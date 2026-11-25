import { createClient } from '@supabase/supabase-js';
import { mountAccount } from './lib/account-ui.mjs';
import { readAuthCallback, showAuthCallback } from './lib/auth-callback-ui.mjs';

// Remove authentication material before any network call or UI work.
let incoming = location.href;
history.replaceState(null, '', location.pathname);
const callback = readAuthCallback(incoming);
incoming = null;
const config = typeof __SCYL_ACCOUNT_CONFIG__ !== 'undefined' ? __SCYL_ACCOUNT_CONFIG__ : null;
const onComplete = () => location.replace('mix-lab.html');
if (callback.kind === 'entry') {
  const gate = mountAccount({ onSignedIn: onComplete });
  document.getElementById('auth-message').textContent = gate.configured
    ? 'MEOW · SCYL 공통 계정으로 음악을 이어가세요.' : '계정 연결 설정이 없는 개발 빌드입니다.';
} else {
  const controller = showAuthCallback({ callback, config, createClient, onComplete });
  addEventListener('pagehide', event => { if (!event.persisted) controller.dispose(); });
}
