// Zoom web client adapter. Requires captions in the call: the host enables
// them, you turn on "Show captions". Opening the full transcript panel
// ("View full transcript") gives better history than the rolling subtitle
// overlay, so the panel is preferred when present.

SottoCapture.start({
  platform: 'zoom',

  findContainer() {
    return (
      sottoQuery(document, SOTTO_SELECTORS.zoom.panelContainer) ||
      sottoQuery(document, SOTTO_SELECTORS.zoom.container)
    );
  },

  readEntries(container) {
    const isPanel = !!sottoQuery(document, SOTTO_SELECTORS.zoom.panelContainer);
    const s = SOTTO_SELECTORS.zoom;
    const entrySel = isPanel ? s.panelEntry : s.entry;
    const speakerSel = isPanel ? s.panelSpeaker : s.speaker;
    const textSel = isPanel ? s.panelText : s.text;

    const blocks = sottoQueryAll(container, entrySel);
    const out = [];
    for (const node of blocks) {
      const speakerEl = sottoQuery(node, speakerSel);
      const textEl = sottoQuery(node, textSel);
      const speaker = speakerEl
        ? speakerEl.textContent.replace(/:\s*$/, '').trim()
        : 'Speaker';
      out.push({
        node,
        speaker,
        text: textEl ? textEl.textContent : node.textContent,
      });
    }
    return out;
  },
});
