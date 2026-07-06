// Shared capture engine. A platform adapter (meet.js / zoom.js) calls
// SottoCapture.start(adapter) once; the engine polls the caption DOM,
// tracks caption blocks as they grow word-by-word, and persists the
// session to chrome.storage.local via the background worker.
//
// Adapter contract:
//   platform: 'meet' | 'zoom'
//   findContainer(): Element|null  — caption area, when captions are on
//   readEntries(container): [{ node: Element, speaker: string, text: string }]

const SottoCapture = (() => {
  const POLL_MS = 500;
  const FLUSH_MS = 3000;

  let session = null;
  let dirty = false;
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

  function upsert(platform, node, speaker, text) {
    text = (text || '').trim();
    if (!text) return;
    const s = ensureSession(platform);
    let entry = nodeToEntry.get(node);
    if (!entry) {
      // A caption block sometimes gets re-created mid-sentence; if the last
      // entry for this speaker is a prefix of the new text, treat it as the
      // same utterance instead of appending a duplicate.
      const last = s.entries[s.entries.length - 1];
      if (last && last.speaker === speaker &&
          (text.startsWith(last.text) || last.text.startsWith(text))) {
        entry = last;
        nodeToEntry.set(node, entry);
      } else {
        entry = { at: new Date().toISOString(), speaker, text: '' };
        s.entries.push(entry);
        nodeToEntry.set(node, entry);
      }
    }
    if (entry.text !== text) {
      entry.text = text;
      s.updatedAt = new Date().toISOString();
      dirty = true;
    }
  }

  function flush() {
    if (!dirty || !session) return;
    dirty = false;
    chrome.runtime.sendMessage({ type: 'session-update', session }).catch(() => {
      // Extension reloaded/updated mid-call — nothing we can do from here.
    });
  }

  function start(adapter) {
    setInterval(() => {
      const container = adapter.findContainer();
      if (!container) return;
      for (const { node, speaker, text } of adapter.readEntries(container)) {
        upsert(adapter.platform, node, speaker || 'Speaker', text);
      }
    }, POLL_MS);

    setInterval(flush, FLUSH_MS);

    // Best-effort end-of-call signal (triggers auto-save). Tab close is also
    // covered by tabs.onRemoved in the background worker.
    window.addEventListener('beforeunload', () => {
      if (!session) return;
      chrome.runtime.sendMessage({ type: 'session-end', session }).catch(() => {});
    });
  }

  return { start };
})();
