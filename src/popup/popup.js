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

  const chatNotify = document.getElementById('chat-notify');
  chatNotify.checked = settings.chatNotify !== false;
  chatNotify.onchange = () => saveSetting('chatNotify', chatNotify.checked);

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

const WHISPER_PORT = 8123;

async function serverAlive() {
  try {
    // Any HTTP response (even 404) means the server is up; only a network
    // error means it isn't.
    await fetch(`http://127.0.0.1:${WHISPER_PORT}/`, { method: 'GET' });
    return true;
  } catch (_) {
    return false;
  }
}

async function initHq() {
  const status = document.getElementById('hq-status');
  const toggle = document.getElementById('hq-toggle');
  const langSel = document.getElementById('hq-lang');

  const { settings = {} } = await chrome.storage.local.get('settings');
  langSel.value = settings.hqLang || 'ru';
  langSel.onchange = () => saveSetting('hqLang', langSel.value);

  document.getElementById('hq-help').onclick = () =>
    chrome.tabs.create({ url: chrome.runtime.getURL('src/hq/help.html') });

  const refresh = async () => {
    const { hq } = await chrome.storage.session.get('hq');
    const on = !!hq;
    status.textContent = on ? `Recording: ${(hq.title || 'tab').slice(0, 24)}` : 'HQ recording off';
    status.classList.toggle('on', on);
    toggle.textContent = on ? 'Stop HQ' : 'Start HQ';
    return on;
  };
  await refresh();

  toggle.onclick = async () => {
    if (await refresh()) {
      await chrome.runtime.sendMessage({ type: 'hq-stop' });
    } else {
      if (!(await serverAlive())) {
        status.textContent = 'whisper-server not running — opening setup guide';
        chrome.tabs.create({ url: chrome.runtime.getURL('src/hq/help.html') });
        return;
      }
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const r = await chrome.runtime.sendMessage({
        type: 'hq-start', tabId: tab.id, title: tab.title, language: langSel.value, port: WHISPER_PORT,
      });
      if (!r?.ok) {
        if (/consent-required/.test(r?.error || '')) {
          chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/onboarding.html') });
          return;
        }
        status.textContent = 'Failed: ' + (r?.error || 'unknown');
        return;
      }
    }
    await refresh();
    render();
  };
}

initSettings();
initHq();
render();
