// Google Meet adapter. Sotto reads what Meet renders, it does not do ASR.
// Captions are turned on automatically (popup toggle) by clicking the CC
// button; the caption language can be switched to the popup's saved choice.
//
// Buttons are located by Material Symbols icon ligatures ('closed_caption_off',
// 'settings', …): the ligature text is the canonical icon name, independent
// of UI language and of Meet's rotating compiled class names.

(() => {
  const TAG = '[Sotto]';

  const settings = { autoEnableCaptions: true, meetLang: '' };
  chrome.storage.local.get('settings').then(({ settings: s }) => Object.assign(settings, s));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    const before = settings.meetLang;
    Object.assign(settings, changes.settings.newValue);
    if (settings.meetLang && settings.meetLang !== before) langApplied = false;
  });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function iconButton(ligature, root = document) {
    const icons = root.querySelectorAll('.google-symbols, .google-material-icons, i[class*="material"]');
    for (const el of icons) {
      if (el.textContent.trim() === ligature) {
        return el.closest('button, [role="button"]') || el;
      }
    }
    return null;
  }

  // --- auto-enable captions -------------------------------------------------
  // Click CC once per page load: if the user then turns captions off
  // deliberately, we don't fight them.
  let ccClicked = false;
  function autoEnableCaptions() {
    if (ccClicked || settings.autoEnableCaptions === false) return;
    const btn = iconButton('closed_caption_off');
    if (btn) {
      ccClicked = true;
      btn.click();
      console.log(TAG, 'captions enabled');
    }
  }

  // --- caption language -----------------------------------------------------
  // settings.meetLang is a '|'-separated list of names to match against the
  // options in Meet's picker (native + English spelling — the picker is
  // rendered in the UI locale).
  let langApplied = false;
  let langPending = false;

  function visibleOptions() {
    return [...document.querySelectorAll('[role="option"], option')]
      .filter((el) => el.offsetParent !== null);
  }

  async function applyCaptionLanguage(container) {
    const wanted = settings.meetLang.split('|').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!wanted.length) return;

    const captionRoot = container.closest('.a4cQT') || container.parentElement || document;
    const opener =
      sottoQuery(document, SOTTO_SELECTORS.meet.captionSettingsButton) ||
      iconButton('settings', captionRoot);
    if (!opener) {
      console.log(TAG, 'caption settings button not found — language not switched');
      return;
    }
    opener.click();
    await sleep(700);

    let options = visibleOptions();
    if (!options.length) {
      // The panel opened but the language control is a closed combobox.
      const combo = document.querySelector(
        '[role="dialog"] [role="combobox"], [role="dialog"] select, [role="listbox"], [role="combobox"]');
      if (combo) {
        combo.click();
        await sleep(500);
        options = visibleOptions();
      }
    }

    const target = options.find((o) => {
      const t = o.textContent.toLowerCase();
      return wanted.some((w) => t.includes(w));
    });
    if (target) {
      target.click();
      console.log(TAG, 'caption language set to', target.textContent.trim());
    } else {
      console.log(TAG, `language matching "${settings.meetLang}" not found among ${options.length} visible options`);
    }
    await sleep(400);

    // Put the UI back: close icon in the opened panel, Escape as fallback.
    const dialog = document.querySelector('[role="dialog"]');
    const closer = dialog && iconButton('close', dialog);
    if (closer) closer.click();
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
  }

  // --- capture --------------------------------------------------------------
  SottoCapture.start({
    platform: 'meet',

    findContainer() {
      const container = sottoQuery(document, SOTTO_SELECTORS.meet.container);
      if (!container) {
        autoEnableCaptions();
        return null;
      }
      if (settings.meetLang && !langApplied && !langPending) {
        langApplied = true;
        langPending = true;
        // Let the caption UI settle after CC came on before poking settings.
        setTimeout(() => {
          applyCaptionLanguage(container).finally(() => { langPending = false; });
        }, 1500);
      }
      return container;
    },

    readEntries(container) {
      const blocks = sottoQueryAll(container, SOTTO_SELECTORS.meet.entry);
      const out = [];
      for (const node of blocks) {
        const speakerEl = sottoQuery(node, SOTTO_SELECTORS.meet.speaker);
        const textEl = sottoQuery(node, SOTTO_SELECTORS.meet.text);
        out.push({
          node,
          speaker: speakerEl ? speakerEl.textContent.trim() : 'Speaker',
          text: textEl ? textEl.textContent : node.textContent,
        });
      }
      return out;
    },
  });
})();
