// Transcript formatters, shared by the popup page and the background
// service worker (via importScripts).

const SottoFormat = (() => {
  const PLATFORM_LABEL = { meet: 'Google Meet', zoom: 'Zoom', whisper: 'HQ (Whisper)' };

  function fmtDate(iso) {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  function label(s) {
    return PLATFORM_LABEL[s.platform] || s.platform;
  }

  // Chronological entries with consecutive same-speaker chunks merged into
  // one paragraph (HQ mode cuts speech every 8–25 s, which reads as a wall
  // of fragments otherwise). Merging is presentation-only — stored entries
  // stay as captured.
  const MERGE_GAP_MS = 45000;

  function paragraphs(s) {
    const sorted = [...s.entries].sort((a, b) => a.at.localeCompare(b.at));
    const flat = (t) => t.trim().replace(/\s*\n\s*/g, ' ');
    const out = [];
    for (const e of sorted) {
      const prev = out[out.length - 1];
      if (prev && prev.speaker === e.speaker &&
          new Date(e.at) - new Date(prev.lastAt) < MERGE_GAP_MS) {
        prev.text += ' ' + flat(e.text);
        prev.lastAt = e.at;
      } else {
        out.push({ at: e.at, lastAt: e.at, speaker: e.speaker, text: flat(e.text) });
      }
    }
    return out;
  }

  function toMarkdown(s) {
    const lines = [`# ${label(s)} — ${s.title}`, '', `Started: ${fmtDate(s.startedAt)}`, ''];
    for (const e of paragraphs(s)) {
      lines.push(`**${e.speaker}** (${fmtTime(e.at)}): ${e.text}`, '');
    }
    return lines.join('\n');
  }

  function toText(s) {
    const lines = [`${label(s)} — ${s.title}`, `Started: ${fmtDate(s.startedAt)}`, ''];
    for (const e of paragraphs(s)) {
      lines.push(`[${fmtTime(e.at)}] ${e.speaker}: ${e.text}`);
    }
    return lines.join('\n');
  }

  function filename(s, ext) {
    const date = s.startedAt.slice(0, 10);
    const title = s.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 40) || 'session';
    return `${date} ${title}.${ext}`;
  }

  return { label, fmtDate, fmtTime, toMarkdown, toText, filename };
})();
