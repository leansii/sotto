// Service worker: persists sessions sent by content scripts, shows a "REC"
// badge on capturing tabs, and — unless disabled in the popup — saves the
// transcript as a .txt file to Downloads/Sotto/ when the call tab closes.
// All data stays on this machine: storage is chrome.storage.local, the
// download uses a data: URL, and there are no network calls.

importScripts('format.js');

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'session-update' && msg.session) {
    persist(msg.session, sender.tab?.id).then(() => sendResponse({ ok: true }));
    if (sender.tab?.id != null) {
      chrome.action.setBadgeText({ tabId: sender.tab.id, text: 'REC' });
      chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#c0392b' });
    }
    return true; // async sendResponse
  }
  if (msg.type === 'session-end' && msg.session) {
    persist(msg.session, sender.tab?.id)
      .then(() => autoSaveTxt(msg.session.id))
      .then(() => sendResponse({ ok: true }));
    return true;
  }
});

// A call can end without a session-end message (crash, killed tab), so the
// tab-closed event is the reliable auto-save trigger; session-end on
// navigation is the best-effort fast path. savedAt makes the two idempotent.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { tabSessions = {} } = await chrome.storage.session.get('tabSessions');
  const sessionId = tabSessions[tabId];
  if (!sessionId) return;
  delete tabSessions[tabId];
  await chrome.storage.session.set({ tabSessions });
  await autoSaveTxt(sessionId);
});

async function persist(session, tabId) {
  const { sessions = {} } = await chrome.storage.local.get('sessions');
  const prev = sessions[session.id];
  if (prev?.savedAt) session.savedAt = prev.savedAt;
  sessions[session.id] = session;
  await chrome.storage.local.set({ sessions });

  if (tabId != null) {
    // tab → session map lives in storage.session so it survives service
    // worker idle shutdowns but not browser restarts.
    const { tabSessions = {} } = await chrome.storage.session.get('tabSessions');
    if (tabSessions[tabId] !== session.id) {
      tabSessions[tabId] = session.id;
      await chrome.storage.session.set({ tabSessions });
    }
  }
}

async function autoSaveTxt(sessionId) {
  const { settings = {} } = await chrome.storage.local.get('settings');
  if (settings.autoSaveTxt === false) return;

  const { sessions = {} } = await chrome.storage.local.get('sessions');
  const s = sessions[sessionId];
  if (!s || !s.entries.length || s.savedAt) return;

  const url = 'data:text/plain;charset=utf-8,' + encodeURIComponent(SottoFormat.toText(s));
  await chrome.downloads.download({
    url,
    filename: `Sotto/${SottoFormat.filename(s, 'txt')}`,
    conflictAction: 'uniquify',
  });

  s.savedAt = new Date().toISOString();
  sessions[sessionId] = s;
  await chrome.storage.local.set({ sessions });
}
