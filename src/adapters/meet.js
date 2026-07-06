// Google Meet adapter. Requires captions to be turned on in the call
// (the "CC" button) — Sotto reads what Meet renders, it does not do ASR.

SottoCapture.start({
  platform: 'meet',

  findContainer() {
    return sottoQuery(document, SOTTO_SELECTORS.meet.container);
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
