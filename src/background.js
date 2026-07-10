// Service worker: persists sessions sent by content scripts, shows a "REC"
// badge on capturing tabs, and — unless disabled in the popup — saves the
// transcript as a .txt file to Downloads/Sotto/ when the call tab closes.
// All data stays on this machine: storage is chrome.storage.local, the
// download uses a data: URL, and there are no network calls.

importScripts('format.js');

// First-run consent: capture stays off until the user enables it on the
// onboarding page (required for personal communications, even local-only).
chrome.runtime.onInstalled.addListener(async () => {
  const { settings = {} } = await chrome.storage.local.get('settings');
  if (!settings.consented) {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/onboarding.html') });
  }
});

// --- HQ recording (tab + mic → local whisper-server) -----------------------

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'src/offscreen/offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Capture tab and microphone audio for local-only transcription',
  });
}

async function hqStart({ tabId, title, language, port }) {
  const { settings = {} } = await chrome.storage.local.get('settings');
  if (!settings.consented) throw new Error('consent-required');
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  await ensureOffscreen();
  await chrome.runtime.sendMessage({ type: 'hq-capture-start', streamId, title, language, port });
  await chrome.storage.session.set({ hq: { tabId, title: title || 'tab' } });
  chrome.action.setBadgeText({ tabId, text: 'HQ' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#1a7f4f' });
  // Let participants know (content script posts to the call chat, if any).
  chrome.tabs.sendMessage(tabId, { type: 'sotto-announce' }).catch(() => {});
}

async function hqStop() {
  const { hq } = await chrome.storage.session.get('hq');
  await chrome.runtime.sendMessage({ type: 'hq-capture-stop' }).catch(() => {});
  await chrome.storage.session.remove('hq');
  if (hq?.tabId != null) chrome.action.setBadgeText({ tabId: hq.tabId, text: '' }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'hq-start') {
    hqStart(msg).then(() => sendResponse({ ok: true }), (e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type === 'hq-stop') {
    hqStop().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'hq-stopped') {
    chrome.offscreen.closeDocument().catch(() => {});
  }
  if (msg.type === 'hq-mic-denied') {
    // One-time grant page; next recording picks the mic up automatically.
    chrome.tabs.create({ url: chrome.runtime.getURL('src/hq/mic.html') });
  }
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
  const { hq } = await chrome.storage.session.get('hq');
  if (hq?.tabId === tabId) await hqStop(); // offscreen flushes and ends the session

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
