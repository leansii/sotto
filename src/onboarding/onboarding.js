document.getElementById('consent').onclick = async () => {
  const { settings = {} } = await chrome.storage.local.get('settings');
  settings.consented = true;
  await chrome.storage.local.set({ settings });
  document.getElementById('done').textContent =
    'Capture enabled. You can close this tab — Sotto will pick up your next call.';
  document.getElementById('consent').disabled = true;
};
