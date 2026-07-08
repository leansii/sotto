document.getElementById('grant').onclick = async () => {
  const status = document.getElementById('status');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    status.textContent = 'Done — microphone allowed. You can close this tab; the next recording will pick it up.';
  } catch (e) {
    status.textContent = 'Failed: ' + e.message;
  }
};
