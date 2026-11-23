const button = document.getElementById('clear-data');
const status = document.getElementById('delete-status');
button.addEventListener('click', async () => {
  if (!confirm('이 기기의 SCYL 목록·설정·임시 내보내기 파일을 삭제할까요?')) return;
  button.disabled = true;
  let cacheDeleted = true, localDeleted = true;
  if (window.Capacitor?.isNativePlatform?.()) {
    try {
      const { clearNativeExportCache } = await import('./lib/native-export.mjs');
      await clearNativeExportCache();
    } catch { cacheDeleted = false; }
  }
  try { localStorage.removeItem('scyl.session.v1'); localStorage.removeItem('scyl.privacy.v1'); }
  catch { localDeleted = false; }
  if (cacheDeleted && localDeleted) status.textContent = '이 기기의 SCYL 데이터를 삭제했습니다. 열려 있는 다른 SCYL 화면도 초기화됩니다. 공유받은 다른 앱의 복사본은 해당 앱에서 삭제해 주세요.';
  else if (localDeleted) status.textContent = '목록과 설정은 삭제했습니다. 임시 내보내기 파일 삭제는 실패했습니다. 다시 시도해 주세요.';
  else status.textContent = '저장공간에 접근하지 못했습니다. 브라우저나 기기 설정에서 SCYL 데이터를 삭제해 주세요.';
  button.disabled = false;
});
