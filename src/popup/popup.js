function download(filename, content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function saveSetting(key, value) {
  const { settings = {} } = await chrome.storage.local.get('settings');
  settings[key] = value;
  await chrome.storage.local.set({ settings });
}

async function initSettings() {
  const { settings = {} } = await chrome.storage.local.get('settings');

  const autosave = document.getElementById('autosave');
  autosave.checked = settings.autoSaveTxt !== false;
  autosave.onchange = () => saveSetting('autoSaveTxt', autosave.checked);

  const autocc = document.getElementById('autocc');
  autocc.checked = settings.autoEnableCaptions !== false;
  autocc.onchange = () => saveSetting('autoEnableCaptions', autocc.checked);

  const lang = document.getElementById('meet-lang');
  lang.value = settings.meetLang || '';
  if (lang.value !== (settings.meetLang || '')) lang.value = ''; // stored value not in list
  lang.onchange = () => saveSetting('meetLang', lang.value);
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
      `${SottoFormat.label(s)} · ${SottoFormat.fmtDate(s.startedAt)} · ${s.entries.length} entries`;
    row.querySelector('.export-md').onclick = () =>
      download(SottoFormat.filename(s, 'md'), SottoFormat.toMarkdown(s));
    row.querySelector('.export-txt').onclick = () =>
      download(SottoFormat.filename(s, 'txt'), SottoFormat.toText(s));
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

initSettings();
render();
