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
    // Opens the caption settings panel (language lives there). The gear is
    // near the caption bar; aria-labels are localized, so icon-ligature
    // lookup in adapters/meet.js is the primary path and these are hints.
    captionSettingsButton: [
      'button[aria-label*="caption settings" i]',
      'button[aria-label*="настройки субтитров" i]',
      '.NmXUuc [role="button"]',
      '.NmXUuc button',
    ],
  },

  zoom: {
    // NOTE: on app.zoom.us the meeting UI lives inside a same-origin iframe
    // `#webclient` — adapters/zoom.js resolves the right document before
    // querying; these selectors apply to that inner document.
    //
    // Live subtitle overlay. Each direct child of the box is one speaker
    // turn: first child is the avatar <img> (or a name node), last child is
    // the caption text. Structure parsing lives in adapters/zoom.js.
    overlayContainer: [
      '.live-transcription-subtitle__box',
      '#live-transcription-subtitle',
      '[class*="live-transcription-subtitle"]',
    ],
    // Full transcript side panel ("Captions" > "View full transcript") —
    // keeps history, preferred over the rolling overlay when open.
    panelContainer: [
      '#full-transcription',
      '.lt-full-transcript',
    ],
    panelEntry: [
      '.lt-full-transcript__item',
      '[class*="full-transcript__item"]',
    ],
    panelSpeaker: [
      '[class*="name"]',
    ],
    panelText: [
      '[class*="msg"]',
      '[class*="text"]',
      'p',
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

// True if the element matches any candidate selector.
function sottoMatches(el, candidates) {
  for (const sel of candidates) {
    try {
      if (el.matches(sel)) return true;
    } catch (_) { /* invalid selector — skip */ }
  }
  return false;
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
