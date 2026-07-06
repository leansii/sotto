// DOM selectors for caption UI, per platform.
//
// Meet and Zoom ship UI changes without notice, so these WILL rot over time.
// When capture stops working, this file is the first (usually the only) place
// to fix: open DevTools on a call with captions enabled, find the caption
// elements, and update the candidate lists below. Each list is tried in order;
// the first selector that matches anything wins.

const SOTTO_SELECTORS = {
  meet: {
    // Container that holds the live caption blocks.
    container: [
      'div[jsname="dsyhDe"]',
      '.a4cQT',
      'div[aria-live="polite"][jscontroller]',
    ],
    // One block per speaker turn, inside the container.
    entry: [
      'div[jsname="tgaKEf"]',
      '.nMcdL',
      '.TBMuR',
    ],
    // Speaker name, inside an entry block.
    speaker: [
      '.NWpY1d',
      '.KcIKyf',
      '.zs7s8d',
    ],
    // Caption text, inside an entry block.
    text: [
      'div[jsname="YSxPC"]',
      '.bh44bd',
      '.iTTPOb',
    ],
  },

  zoom: {
    // Live subtitle overlay (single rolling line, no history).
    container: [
      '#live-transcription-subtitle',
      'div[class*="live-transcription-subtitle"]',
    ],
    entry: [
      'div[class*="live-transcription-subtitle__item"]',
      'span',
    ],
    speaker: [
      'span[class*="user-name"]',
    ],
    text: [
      'span[class*="text"]',
    ],
    // Full transcript side panel ("Captions" > "View full transcript") —
    // richer than the overlay, preferred when open.
    panelContainer: [
      '.lt-container__list',
      'div[class*="transcript-list"]',
    ],
    panelEntry: [
      '.lt-item',
      'div[class*="transcript-item"]',
    ],
    panelSpeaker: [
      '.lt-item__name',
      'div[class*="transcript-item__name"]',
    ],
    panelText: [
      '.lt-item__msg',
      'div[class*="transcript-item__msg"]',
    ],
  },
};

// Returns the first element matching any candidate selector, or null.
function sottoQuery(root, candidates) {
  for (const sel of candidates) {
    try {
      const el = root.querySelector(sel);
      if (el) return el;
    } catch (_) { /* invalid selector — skip */ }
  }
  return null;
}

// Returns elements for the first candidate selector that matches anything.
function sottoQueryAll(root, candidates) {
  for (const sel of candidates) {
    try {
      const els = root.querySelectorAll(sel);
      if (els.length) return [...els];
    } catch (_) { /* invalid selector — skip */ }
  }
  return [];
}
