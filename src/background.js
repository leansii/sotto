// Service worker: persists sessions sent by content scripts and shows a
// "REC" badge on tabs that are actively capturing. All data lives in
// chrome.storage.local — nothing ever leaves the machine.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'session-update' && msg.session) {
    chrome.storage.local
      .get('sessions')
      .then(({ sessions = {} }) => {
        sessions[msg.session.id] = msg.session;
        return chrome.storage.local.set({ sessions });
      })
      .then(() => sendResponse({ ok: true }));

    if (sender.tab?.id != null) {
      chrome.action.setBadgeText({ tabId: sender.tab.id, text: 'REC' });
      chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#c0392b' });
    }
    return true; // async sendResponse
  }
});
