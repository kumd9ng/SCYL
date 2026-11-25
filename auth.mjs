import { mountAccount } from './lib/account-ui.mjs';
import { nativeAccountLink, readAccountCode } from './lib/account-links.mjs';
const incoming = new URL(location.href);
const code = readAccountCode(incoming.href);
// Do not retain one-time codes or old implicit-flow bearer tokens in history.
history.replaceState(null, '', location.pathname);
const message = document.getElementById('auth-message');
if (incoming.searchParams.get('target') === 'native') {
  const target = nativeAccountLink(code);
  if (target) {
    const link = document.getElementById('native-return'); link.href = target; link.hidden = false;
    document.getElementById('native-help').hidden = false;
    message.textContent = '아래 버튼을 눌러 SCYL 앱에서 인증을 마치세요.';
  } else message.textContent = '유효한 인증 요청을 찾지 못했습니다. SCYL 앱에서 새 인증 메일을 받아 주세요.';
} else {
  const invalid = incoming.hash || incoming.searchParams.has('error') || incoming.searchParams.has('error_code');
  const initialMessage = invalid ? '이 인증 링크를 사용할 수 없습니다. 새 인증 메일을 받아 주세요.' : '';
  const gate = mountAccount({ completionCode: code, initialMessage, onSignedIn() { location.replace('mix-lab.html'); } });
  message.textContent = initialMessage || '메일을 요청했던 브라우저에서 인증을 마칩니다.';
  if (!gate.configured) message.textContent = '계정 연결 설정이 없는 개발 빌드입니다.';
}
