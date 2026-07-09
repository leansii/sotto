// Offscreen document: holds the tab-audio and microphone streams during HQ
// recording, cuts them into utterance chunks on silence boundaries, and sends
// each chunk to the local whisper-server. Two channels give free diarization:
// everything from the mic is "You", everything from the tab is the other side.
//
// All audio stays on this machine — the only network target is 127.0.0.1.

const SR = 16000;
const MIN_CHUNK_S = 8;      // don't bother Whisper with shorter fragments
const MAX_CHUNK_S = 25;     // hard cap so entries stay timely
const TAIL_SILENCE_S = 0.7; // flush when the speaker pauses this long
const SILENCE_RMS = 0.01;
const MIN_VOICED_FRACTION = 0.05; // drop chunks that are essentially silence

let session = null;
let serverPort = 8123;
let lang = 'ru';
let channels = [];
let audioCtx = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'hq-capture-start') start(msg).catch(reportError);
  if (msg.type === 'hq-capture-stop') stop();
});

function reportError(e) {
  console.error('[Sotto]', e);
  chrome.runtime.sendMessage({ type: 'hq-error', error: String(e?.message || e) }).catch(() => {});
}

async function start({ streamId, title, language, port }) {
  lang = language || 'ru';
  serverPort = port || 8123;
  session = {
    id: `whisper-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    platform: 'whisper',
    title: title || 'HQ recording',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    entries: [],
  };

  const tabStream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
  });

  let micStream = null;
  try {
    // Echo cancellation keeps the other side's voice (played through the
    // speakers) out of the mic channel; headphones remove it completely.
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (e) {
    // Mic permission not granted to the extension yet — background opens the
    // one-time grant page; recording continues with the tab side only.
    chrome.runtime.sendMessage({ type: 'hq-mic-denied' }).catch(() => {});
  }

  audioCtx = new AudioContext({ sampleRate: SR });
  // Tab capture mutes the tab for the user — route it back to the speakers.
  audioCtx.createMediaStreamSource(tabStream).connect(audioCtx.destination);

  channels = [new Channel(tabStream, 'Собеседник')];
  if (micStream) channels.push(new Channel(micStream, 'Вы'));
}

function stop() {
  for (const ch of channels) ch.close();
  channels = [];
  audioCtx?.close();
  audioCtx = null;
  if (session) {
    chrome.runtime.sendMessage({ type: 'session-end', session }).catch(() => {});
    session = null;
  }
  chrome.runtime.sendMessage({ type: 'hq-stopped' }).catch(() => {});
}

class Channel {
  constructor(stream, speaker) {
    this.stream = stream;
    this.speaker = speaker;
    this.buf = [];
    this.samples = 0;
    this.chunkStartedAt = null;
    this.busy = Promise.resolve();

    this.source = audioCtx.createMediaStreamSource(stream);
    // ScriptProcessor needs a path to the destination to fire; zero gain so
    // the mic never echoes back out of the speakers.
    this.proc = audioCtx.createScriptProcessor(4096, 1, 1);
    this.sink = audioCtx.createGain();
    this.sink.gain.value = 0;
    this.source.connect(this.proc);
    this.proc.connect(this.sink);
    this.sink.connect(audioCtx.destination);
    this.proc.onaudioprocess = (e) => this.onAudio(e.inputBuffer.getChannelData(0));
  }

  onAudio(data) {
    if (!this.chunkStartedAt) this.chunkStartedAt = new Date().toISOString();
    this.buf.push(new Float32Array(data));
    this.samples += data.length;

    const seconds = this.samples / SR;
    if (seconds >= MAX_CHUNK_S || (seconds >= MIN_CHUNK_S && this.tailSilent())) {
      this.flush();
    }
  }

  tailSilent() {
    let need = Math.floor(TAIL_SILENCE_S * SR);
    for (let i = this.buf.length - 1; i >= 0 && need > 0; i--) {
      const b = this.buf[i];
      const take = Math.min(need, b.length);
      if (rms(b.subarray(b.length - take)) > SILENCE_RMS) return false;
      need -= take;
    }
    return need <= 0;
  }

  flush() {
    const parts = this.buf;
    const at = this.chunkStartedAt;
    this.buf = [];
    this.samples = 0;
    this.chunkStartedAt = null;

    const pcm = concat(parts);
    const vf = voicedFraction(pcm);
    if (vf < MIN_VOICED_FRACTION) return; // silence — skip
    // Serialize requests per channel so whisper-server isn't hammered.
    this.busy = this.busy.then(() => transcribe(pcm, this.speaker, at, vf)).catch(reportError);
  }

  close() {
    if (this.samples / SR >= 2) this.flush();
    this.proc.disconnect();
    this.source.disconnect();
    this.sink.disconnect();
    this.stream.getTracks().forEach((t) => t.stop());
  }
}

async function transcribe(pcm, speaker, at, vf) {
  const form = new FormData();
  form.append('file', new Blob([wavEncode(pcm)], { type: 'audio/wav' }), 'chunk.wav');
  form.append('response_format', 'json');
  if (lang !== 'auto') form.append('language', lang);

  const res = await fetch(`http://127.0.0.1:${serverPort}/inference`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`whisper-server ${res.status}`);
  const { text } = await res.json();
  const clean = (text || '').trim();
  if (!clean || isHallucination(clean)) return;
  // Whisper invents short pleasantries («Спасибо.», "Thank you.") on chunks
  // that barely contain voice — breathing, keyboard, room noise.
  if (clean.split(/\s+/).length <= 3 && vf < 0.25) return;

  if (!session) return; // stopped while this chunk was in flight
  session.entries.push({ at, speaker, text: clean });
  session.entries.sort((a, b) => a.at.localeCompare(b.at));
  session.updatedAt = new Date().toISOString();
  chrome.runtime.sendMessage({ type: 'session-update', session }).catch(() => {});
}

// Whisper's stock hallucinations on near-silence (RU/EN).
function isHallucination(t) {
  return /^(субтитры|продолжение следует|спасибо за (просмотр|внимание)|редактор субтитров|благодарю за просмотр|thanks for watching|thank you for watching|you$)/i.test(t.trim());
}

function rms(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s / (a.length || 1));
}

function voicedFraction(pcm) {
  const win = 1600; // 100 ms
  let voiced = 0, total = 0;
  for (let i = 0; i + win <= pcm.length; i += win) {
    total++;
    if (rms(pcm.subarray(i, i + win)) > SILENCE_RMS) voiced++;
  }
  return total ? voiced / total : 0;
}

function concat(parts) {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

// Float32 PCM → 16-bit mono WAV.
function wavEncode(pcm) {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}
