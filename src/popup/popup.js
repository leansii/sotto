const PLATFORM_LABEL = { meet: 'Google Meet', zoom: 'Zoom' };

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function toMarkdown(s) {
  const lines = [
    `# ${PLATFORM_LABEL[s.platform] || s.platform} — ${s.title}`,
    '',
    `Started: ${fmtDate(s.startedAt)}`,
    '',
  ];
  for (const e of s.entries) {
    lines.push(`**${e.speaker}** (${fmtTime(e.at)}): ${e.text}`, '');
  }
  return lines.join('\n');
}

function toText(s) {
  const lines = [
    `${PLATFORM_LABEL[s.platform] || s.platform} — ${s.title}`,
    `Started: ${fmtDate(s.startedAt)}`,
    '',
  ];
  for (const e of s.entries) {
    lines.push(`[${fmtTime(e.at)}] ${e.speaker}: ${e.text}`);
  }
  return lines.join('\n');
}

function download(filename, content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeName(s, ext) {
  const date = s.startedAt.slice(0, 10);
  const title = s.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 40) || 'session';
  return `${date} ${title}.${ext}`;
}

async function render() {
  const { sessions = {} } = await chrome.storage.local.get('sessions');
  const main = document.getElementById('sessions');
  const tpl = document.getElementById('session-row');
  main.replaceChildren();

  const list = Object.values(sessions).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No transcripts yet. Join a call and turn captions on.';
    main.append(empty);
    return;
  }

  for (const s of list) {
    const row = tpl.content.firstElementChild.cloneNode(true);
    row.querySelector('.title').textContent = s.title;
    row.querySelector('.sub').textContent =
      `${PLATFORM_LABEL[s.platform] || s.platform} · ${fmtDate(s.startedAt)} · ${s.entries.length} entries`;
    row.querySelector('.export-md').onclick = () => download(safeName(s, 'md'), toMarkdown(s));
    row.querySelector('.export-txt').onclick = () => download(safeName(s, 'txt'), toText(s));
    row.querySelector('.delete').onclick = async () => {
      if (!confirm(`Delete transcript "${s.title}"? This cannot be undone.`)) return;
      const { sessions = {} } = await chrome.storage.local.get('sessions');
      delete sessions[s.id];
      await chrome.storage.local.set({ sessions });
      render();
    };
    main.append(row);
  }
}

render();
