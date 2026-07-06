// Transcript formatters, shared by the popup page and the background
// service worker (via importScripts).

const SottoFormat = (() => {
  const PLATFORM_LABEL = { meet: 'Google Meet', zoom: 'Zoom' };

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

  function toMarkdown(s) {
    const lines = [`# ${label(s)} — ${s.title}`, '', `Started: ${fmtDate(s.startedAt)}`, ''];
    for (const e of s.entries) {
      lines.push(`**${e.speaker}** (${fmtTime(e.at)}): ${e.text}`, '');
    }
    return lines.join('\n');
  }

  function toText(s) {
    const lines = [`${label(s)} — ${s.title}`, `Started: ${fmtDate(s.startedAt)}`, ''];
    for (const e of s.entries) {
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
