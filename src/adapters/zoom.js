// Zoom web client adapter. Requires captions in the call: the host enables
// them, you turn on "Show captions". Opening the full transcript panel
// ("Captions" > "View full transcript") keeps history and is preferred over
// the rolling subtitle overlay when open.
//
// On app.zoom.us the meeting UI lives inside a same-origin iframe
// `#webclient`; this script runs in the top page and queries through it.

(() => {
  // Avatar URL → speaker name, learned from participant tiles. The subtitle
  // overlay identifies speakers by avatar <img> only, so the name has to be
  // found where the same image appears next to visible text.
  const avatarNames = new Map();
  let lastSpeaker = 'Speaker';

  function meetingDoc() {
    const iframe = document.querySelector('#webclient');
    try {
      if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
        return iframe.contentDocument;
      }
    } catch (_) { /* cross-origin iframe — fall back to own document */ }
    return document;
  }

  function nameFromAvatar(doc, img) {
    const direct = img.getAttribute('alt') || img.getAttribute('aria-label');
    if (direct && direct.trim()) return direct.trim();
    const src = img.getAttribute('src') || '';
    if (avatarNames.has(src)) return avatarNames.get(src);
    for (const other of doc.images) {
      if (other === img || other.getAttribute('src') !== src) continue;
      const label =
        other.parentElement?.nextElementSibling?.textContent?.trim() ||
        other.parentElement?.nextSibling?.textContent?.trim();
      if (label) {
        avatarNames.set(src, label);
        return label;
      }
    }
    return null;
  }

  // Overlay: each direct child of the box is one speaker turn —
  // [avatar <img> | name node, ..., caption text node].
  function readOverlay(container) {
    const doc = container.ownerDocument;
    const out = [];
    for (const node of container.children) {
      if (!node.textContent.trim()) continue;
      const kids = node.childNodes;
      let speaker = null;
      let text = node.textContent;
      if (kids.length > 1) {
        const first = kids[0];
        if (first.nodeType === Node.ELEMENT_NODE && first.tagName === 'IMG') {
          speaker = nameFromAvatar(doc, first);
        } else {
          const t = first.textContent.replace(/:\s*$/, '').trim();
          if (t) speaker = t;
        }
        text = kids[kids.length - 1].textContent;
      }
      if (speaker) lastSpeaker = speaker;
      out.push({ node, speaker: speaker || lastSpeaker, text });
    }
    return out;
  }

  function readPanel(container) {
    const s = SOTTO_SELECTORS.zoom;
    const out = [];
    for (const node of sottoQueryAll(container, s.panelEntry)) {
      const speakerEl = sottoQuery(node, s.panelSpeaker);
      const textEl = sottoQuery(node, s.panelText);
      let speaker = speakerEl ? speakerEl.textContent.replace(/:\s*$/, '').trim() : null;
      let text = textEl ? textEl.textContent : node.textContent;
      // No recognizable sub-elements — fall back to "Name: text" splitting.
      if (!speaker) {
        const m = text.match(/^\s*([^:\n]{1,60}):\s+(.*)$/s);
        if (m) [, speaker, text] = m;
      }
      if (speaker) lastSpeaker = speaker;
      out.push({ node, speaker: speaker || lastSpeaker, text });
    }
    return out;
  }

  SottoCapture.start({
    platform: 'zoom',

    findContainer() {
      const doc = meetingDoc();
      return (
        sottoQuery(doc, SOTTO_SELECTORS.zoom.panelContainer) ||
        sottoQuery(doc, SOTTO_SELECTORS.zoom.overlayContainer)
      );
    },

    readEntries(container) {
      return sottoMatches(container, SOTTO_SELECTORS.zoom.panelContainer)
        ? readPanel(container)
        : readOverlay(container);
    },
  });
})();
