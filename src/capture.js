// Shared capture engine. A platform adapter (meet.js / zoom.js) calls
// SottoCapture.start(adapter) once; the engine watches the caption DOM and
// persists the session to chrome.storage.local via the background worker.
//
// Captions are read via MutationObserver, not polling: Chrome throttles
// timers in background tabs to about once a minute, which would lose
// everything the rolling subtitle overlay showed in between. Observers fire
// regardless of tab visibility. A slow interval remains only to (re)discover
// the caption container — worst case, captions enabled while the tab is
// hidden attach with up to a minute of delay, but once attached nothing is
// missed.
//
// Adapter contract:
//   platform: 'meet' | 'zoom'
//   findContainer(): Element|null  — caption area, when captions are on
//   readEntries(container): [{ node: Element, speaker: string, text: string }]

const SottoCapture = (() => {
  const SCAN_MS = 2000;
  const FLUSH_EVERY_MS = 2500;

  const ANNOUNCE_TEXT =
    'FYI: this call is being transcribed locally on my device (Sotto extension). / ' +
    'Звонок транскрибируется локально на моём устройстве (расширение Sotto).';

  // Platform status lines that show up in the caption area but aren't speech.
  const SYSTEM_MESSAGES =
    /turned on live transcription|live transcription (is )?(on|off|enabled|disabled)|closed caption/i;

  let session = null;
  let dirty = false;
  let lastFlush = 0;
  let observer = null;
  let observedContainer = null;
  // Live caption blocks mutate in place as words arrive; track each DOM node
  // to its transcript entry so we update rather than duplicate.
  let nodeToEntry = new WeakMap();

  function ensureSession(platform) {
    if (session) return session;
    session = {
      id: `${platform}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      platform,
      title: document.title.replace(/^Meet[\s–-]*/, '').trim() || 'Untitled',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      entries: [],
    };
    return session;
  }

  // Words normalized for comparison (lowercase, punctuation stripped), each
  // with the char offset where it ends in the original text.
  function tokenize(text) {
    const tokens = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(text))) {
      const norm = m[0].toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      if (norm) tokens.push({ norm, end: re.lastIndex });
    }
    return tokens;
  }

  // Reconcile the text we hold with a fresh caption snapshot. Live captions
  // grow word-by-word, get re-punctuated as the recognizer corrects itself,
  // and roll (old words drop off the front) — naive replace loses text,
  // naive append duplicates it. Comparison is on normalized words because
  // re-renders routinely change case and punctuation inside the overlap.
  function mergeCaption(oldText, newText) {
    if (!oldText) return newText;
    if (oldText === newText || oldText.endsWith(newText)) return oldText;
    if (newText.startsWith(oldText)) return newText;

    const ot = tokenize(oldText);
    const nt = tokenize(newText);

    // Longest k where the last k words of old are the first k words of new —
    // the snapshots overlap; append only what follows the overlap.
    for (let k = Math.min(ot.length, nt.length); k >= 3; k--) {
      let match = true;
      for (let i = 0; i < k; i++) {
        if (ot[ot.length - k + i].norm !== nt[i].norm) { match = false; break; }
      }
      if (!match) continue;
      if (k === nt.length) {
        // New adds no words: full re-punctuation → prefer the corrected
        // version; a tail-only repeat → keep what we have.
        return k === ot.length ? newText : oldText;
      }
      return oldText + ' ' + newText.slice(nt[k - 1].end).trimStart();
    }

    // High word overlap but no clean join → in-place correction; keep the
    // recognizer's latest version unless it lost most of the text.
    const seen = new Set(ot.map(t => t.norm));
    const hits = nt.filter(t => seen.has(t.norm)).length;
    if (nt.length && hits / nt.length >= 0.6) {
      return newText.length >= oldText.length * 0.7 ? newText : oldText;
    }

    // Genuinely new content with no overlap — continuation after a jump.
    return oldText + ' ' + newText;
  }

  function upsert(platform, node, speaker, text) {
    text = (text || '').trim();
    if (!text || SYSTEM_MESSAGES.test(text)) return;
    const s = ensureSession(platform);
    let entry = nodeToEntry.get(node);
    if (!entry) {
      // Caption blocks get re-created mid-utterance; a consecutive block by
      // the same speaker continues their entry instead of starting a new one.
      const last = s.entries[s.entries.length - 1];
      if (last && last.speaker === speaker) {
        entry = last;
      } else {
        entry = { at: new Date().toISOString(), speaker, text: '' };
        s.entries.push(entry);
      }
      nodeToEntry.set(node, entry);
    }
    const merged = mergeCaption(entry.text, text);
    if (entry.text !== merged || entry.speaker !== speaker) {
      entry.text = merged;
      // Adapters may resolve a better label mid-utterance ("Speaker 2" → "D").
      entry.speaker = speaker;
      s.updatedAt = new Date().toISOString();
      dirty = true;
    }
  }

  function flush(force) {
    if (!dirty || !session) return;
    if (!force && Date.now() - lastFlush < FLUSH_EVERY_MS) return;
    lastFlush = Date.now();
    dirty = false;
    chrome.runtime.sendMessage({ type: 'session-update', session }).catch(() => {
      // Extension reloaded/updated mid-call — nothing we can do from here.
    });
  }

  // Consent (first-run onboarding) and chat-notify preferences. Capture is
  // OFF until the user explicitly enables it — required for personal
  // communications regardless of local-only processing.
  const prefs = { consented: false, chatNotify: true };
  chrome.storage.local.get('settings').then(({ settings: s = {} }) => {
    prefs.consented = s.consented === true;
    prefs.chatNotify = s.chatNotify !== false;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    const s = changes.settings.newValue || {};
    prefs.consented = s.consented === true;
    prefs.chatNotify = s.chatNotify !== false;
  });

  // Post a one-time notice into the call chat so other participants know a
  // transcript is being kept. Best-effort: adapters implement the UI part.
  let announced = false;
  function maybeAnnounce(adapter) {
    if (announced || !prefs.chatNotify || !adapter.announceCapture) return;
    announced = true;
    adapter.announceCapture(ANNOUNCE_TEXT).then((ok) => {
      if (!ok) console.log('[Sotto] chat announcement failed — tell participants yourself');
    }).catch(() => {});
  }

  function start(adapter) {
    function readAll(container) {
      for (const { node, speaker, text } of adapter.readEntries(container)) {
        upsert(adapter.platform, node, speaker || 'Speaker', text);
      }
      if (session) maybeAnnounce(adapter);
      flush(false);
    }

    // HQ recording started on this tab (from the popup) — announce even
    // before any captions are captured.
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'sotto-announce') maybeAnnounce(adapter);
    });

    setInterval(() => {
      if (!prefs.consented) return;
      const container = adapter.findContainer();
      if (container && container !== observedContainer) {
        observer?.disconnect();
        observedContainer = container;
        observer = new MutationObserver(() => readAll(container));
        observer.observe(container, { childList: true, subtree: true, characterData: true });
        readAll(container);
      }
      // Backstop for a tail left unflushed when mutations went quiet.
      if (dirty && Date.now() - lastFlush > 5000) flush(true);
    }, SCAN_MS);

    document.addEventListener('visibilitychange', () => flush(true));

    // Best-effort end-of-call signal (triggers auto-save). Tab close is also
    // covered by tabs.onRemoved in the background worker.
    window.addEventListener('beforeunload', () => {
      if (!session) return;
      chrome.runtime.sendMessage({ type: 'session-end', session }).catch(() => {});
    });
  }

  return {
    start,
    mergeCaption,
    // True when newText continues/overlaps oldText (same utterance);
    // false when it is disjoint content (utterance boundary).
    continues: (oldText, newText) =>
      !oldText || mergeCaption(oldText, newText) !== oldText + ' ' + newText,
  };
})();
