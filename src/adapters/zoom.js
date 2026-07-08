// Zoom web client adapter. Requires captions in the call: the host account
// must have "Automated captions" enabled (zoom.us settings), then in the
// call: More → Captions. On app.zoom.us the meeting UI lives inside a
// same-origin iframe `#webclient`; this script runs in the top page and
// queries through it.
//
// Live-verified overlay structure (2026-07): one PERSISTENT node whose text
// is rewritten in place and rolls (old words drop off the front) —
//   <div class="live-transcription-subtitle__box">
//     <div id="live-transcription-subtitle">
//       <img …>                 ← photo avatar (alt empty), OR an
//       <span>DS</span>            initials bubble — this is the only
//       <span class="live-transcription-subtitle__item">text</span>
//     </div>
//   </div>
// There is no speaker name anywhere in the overlay, so speakers are keyed by
// their avatar (img src or initials text) and labeled with initials or
// "Speaker N". Because the node never changes, utterances are segmented
// here — by speaker-key change or disjoint text — and reported to the
// engine under per-utterance token objects instead of the DOM node.

(() => {
  const TAG = '[Sotto]';

  const settings = { autoEnableCaptions: true };
  chrome.storage.local.get('settings').then(({ settings: s }) => Object.assign(settings, s));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) Object.assign(settings, changes.settings.newValue);
  });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Zoom's React menus ignore bare .click(); they need the full pointer
  // sequence (verified live via CDP).
  function fullClick(el) {
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(type, {
        bubbles: true, cancelable: true, view: el.ownerDocument.defaultView, buttons: 1,
      }));
    }
  }

  // The web client has no "always show captions" setting (unlike desktop),
  // so turn them on once per page load: More → Captions. If the user then
  // hides them, we don't fight it.
  let ccTried = false;
  async function autoEnableCaptions(doc) {
    if (ccTried || settings.autoEnableCaptions === false) return;
    if (!doc.querySelector('[class*="footer"]')) return; // not in the meeting yet
    const more = [...doc.querySelectorAll('button,[role="button"]')].find((b) =>
      /^(more|ещё|еще)$/i.test((b.getAttribute('aria-label') || b.textContent || '').trim()));
    if (!more) return;
    ccTried = true;
    fullClick(more);
    await sleep(700);
    const cap = [...doc.querySelectorAll('a.dropdown-item,[role="menuitem"]')].find((e) =>
      /^(captions|субтитры)$/i.test(e.textContent.trim()) && e.offsetParent !== null);
    if (cap) {
      fullClick(cap);
      console.log(TAG, 'zoom captions enabled');
    } else {
      fullClick(more); // put the menu back
      console.log(TAG, 'Captions item not found in More menu (host may have captions disabled)');
    }
  }

  function meetingDoc() {
    const iframe = document.querySelector('#webclient');
    try {
      if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
        return iframe.contentDocument;
      }
    } catch (_) { /* cross-origin iframe — fall back to own document */ }
    return document;
  }

  // speaker key → display label
  const speakerNames = new Map();

  function nameFromAvatar(doc, img) {
    const direct = img.getAttribute('alt') || img.getAttribute('aria-label');
    if (direct && direct.trim()) return direct.trim();
    const src = img.getAttribute('src') || '';
    // The same avatar next to visible text elsewhere (participant tile).
    for (const other of doc.images) {
      if (other === img || other.getAttribute('src') !== src) continue;
      const label =
        other.parentElement?.nextElementSibling?.textContent?.trim() ||
        other.closest('[aria-label]')?.getAttribute('aria-label')?.trim();
      if (label) return label.slice(0, 60);
    }
    return null;
  }

  function speakerIdentity(sub, textEl, doc) {
    let key = null;
    let label = null;
    for (const el of sub.children) {
      if (el === textEl) break;
      if (el.tagName === 'IMG') {
        key = 'img:' + (el.getAttribute('src') || '');
        label = nameFromAvatar(doc, el);
      } else {
        const t = el.textContent.trim();
        if (t) {
          key = 'txt:' + t;
          label = t; // initials bubble ("DS") or, if Zoom ever adds it, a name
        }
      }
    }
    if (!key) key = 'solo';
    if (label) speakerNames.set(key, label);
    else if (!speakerNames.has(key)) speakerNames.set(key, `Speaker ${speakerNames.size + 1}`);
    return { key, name: speakerNames.get(key) };
  }

  // Open utterance per speaker: engine entries are keyed by token objects
  // because the overlay DOM node is never replaced. Per-speaker (not just
  // "current") because when speakers interleave, the overlay flips away and
  // then returns showing the earlier speaker's ACCUMULATED window — that must
  // continue their utterance, not start a duplicate one.
  const utterances = new Map(); // speaker key → { token, text }

  function readOverlay(container) {
    const doc = container.ownerDocument;
    const sub = container.querySelector('#live-transcription-subtitle') || container;
    const textEl =
      sottoQuery(sub, SOTTO_SELECTORS.zoom.overlayText) || sub.lastElementChild || sub;
    const text = (textEl.textContent || '').trim();
    if (!text) return [];

    const { key, name } = speakerIdentity(sub, textEl, doc);
    let u = utterances.get(key);
    if (u && !SottoCapture.continues(u.text, text)) u = null;
    if (!u) {
      // The speaker key can flap mid-utterance (avatar <img> loads a moment
      // after the initials bubble): if this text continues an utterance open
      // under another key, it's the same person relabeled — migrate it.
      for (const [k, other] of utterances) {
        if (k !== key && other.text.length > 20 && SottoCapture.continues(other.text, text)) {
          utterances.delete(k);
          utterances.set(key, other);
          u = other;
          break;
        }
      }
    }
    if (!u) {
      u = { token: {}, text };
      utterances.set(key, u);
    } else {
      u.text = SottoCapture.mergeCaption(u.text, text);
    }
    return [{ node: u.token, speaker: name, text }];
  }

  function readPanel(container) {
    const s = SOTTO_SELECTORS.zoom;
    const out = [];
    let lastSpeaker = 'Speaker';
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
      const container =
        sottoQuery(doc, SOTTO_SELECTORS.zoom.panelContainer) ||
        sottoQuery(doc, SOTTO_SELECTORS.zoom.overlayContainer);
      if (!container) autoEnableCaptions(doc);
      return container;
    },

    readEntries(container) {
      return sottoMatches(container, SOTTO_SELECTORS.zoom.panelContainer)
        ? readPanel(container)
        : readOverlay(container);
    },
  });
})();
