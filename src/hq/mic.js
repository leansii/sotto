document.getElementById('grant').onclick = async () => {
  const status = document.getElementById('status');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    status.textContent = 'Готово — микрофон разрешён. Вкладку можно закрыть, запись подхватит его при следующем старте.';
  } catch (e) {
    status.textContent = 'Не получилось: ' + e.message;
  }
};
