import { createSharedAccount } from './shared-account.mjs';
import { nativeAccountLink, readAccountCode } from './account-links.mjs';
import { createEmailLinkSession, parseEmailLinkTokens } from './email-link-session.mjs';

export function readAuthCallback(value) {
  const url = new URL(value);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const error = url.searchParams.get('error_code') || fragment.get('error_code');
  if (error || url.searchParams.has('error') || fragment.has('error')) {
    return { kind: 'error', message: error === 'otp_expired'
      ? '이 인증 메일은 이미 사용했거나 만료되었습니다. 이미 로그인한 브라우저의 음악 화면을 확인해 주세요. 다시 로그인이 필요하면 새 인증 메일로 진행해 주세요.'
      : '인증 메일의 승인을 완료하지 못했습니다. 주소 입력 화면으로 자동 이동하지 않습니다. 새 인증을 시작하려면 아래 로그인 화면을 눌러 주세요.' };
  }
  if (url.searchParams.get('target') === 'native') {
    const code = readAccountCode(value);
    return code ? { kind: 'native', code } : { kind: 'error', message: '앱으로 전달할 인증 정보를 찾지 못했습니다. SCYL 앱에서 보낸 최신 메일을 확인해 주세요.' };
  }
  if (url.hash) {
    const parsed = parseEmailLinkTokens(value);
    return parsed.ok ? { kind: 'email', tokens: parsed.tokens } : { kind: 'error', message: parsed.message };
  }
  const code = readAccountCode(value);
  if (code) return { kind: 'pkce', code };
  if (url.search) return { kind: 'error', message: '인증 링크에 로그인 정보가 없습니다. 메일의 승인 버튼으로 들어왔는지 확인해 주세요.' };
  return { kind: 'entry' };
}

/** Callback failures stay on a result screen; they never auto-open a new email form. */
export function showAuthCallback({ callback, config, createClient, document = globalThis.document,
  onComplete, createAccount = createSharedAccount, createLinkSession = createEmailLinkSession }) {
  const message = document.getElementById('auth-message');
  const heading = document.querySelector('h1');
  const actions = document.createElement('section');
  actions.className = 'auth-actions'; message.after(actions);
  let disposed = false, handler = null, accepting = false;
  const note = text => { message.textContent = text; };
  function button(label, run) {
    const element = document.createElement('button');
    element.type = 'button'; element.className = 'app-return'; element.textContent = label;
    element.addEventListener('click', run); actions.append(element); return element;
  }
  function failure(text) {
    if (disposed) return;
    heading.textContent = '인증을 마치지 못했어요.';
    note(text); message.setAttribute('role', 'alert'); actions.replaceChildren();
    const link = document.createElement('a'); link.href = 'auth.html';
    link.className = 'app-return'; link.textContent = '로그인 화면으로'; actions.append(link);
  }
  async function run() {
    if (callback.kind === 'error') { failure(callback.message); return; }
    if (callback.kind === 'native') {
      heading.textContent = 'SCYL 앱에서 이어서.';
      note('아래 버튼으로 인증을 요청했던 SCYL 앱을 열어 주세요.');
      const link = document.getElementById('native-return');
      link.href = nativeAccountLink(callback.code); link.hidden = false;
      document.getElementById('native-help').hidden = false; return;
    }
    if (!config) { failure('계정 연결 설정을 확인하지 못했습니다. 잠시 후 다시 열어 주세요.'); return; }
    heading.textContent = '이메일을 확인하고 있어요.';
    note('승인 결과를 확인하는 동안 잠시 기다려 주세요.');
    try {
      if (callback.kind === 'email') {
        handler = createLinkSession({ ...config, tokens: callback.tokens, createClient });
        callback.tokens = null;
        const result = await handler.preview();
        if (disposed) return;
        if (!result.ok) { failure(result.message); return; }
        heading.textContent = '이메일 인증이 끝났어요.';
        const verifiedUser = result.user || handler.getState().user;
        note(`${verifiedUser.email} 계정이 확인되었습니다. 처음 가입하거나 비밀번호를 잊었다면 아래에서 비밀번호를 만들어 주세요.`);
        const acceptAccount = passwordSetup => async () => {
          if (accepting || disposed) return;
          accepting = true;
          for (const element of actions.querySelectorAll('button')) element.disabled = true;
          note('로그인을 마무리하고 있습니다.');
          try {
            const accepted = await handler.accept();
            if (disposed) return;
            if (!accepted.ok) { failure(accepted.message); return; }
            if (accepted.user?.id !== verifiedUser.id) { failure('로그인 계정이 바뀌었습니다. 확인한 계정으로 다시 인증해 주세요.'); return; }
            onComplete({ passwordSetup, expectedUserId: verifiedUser.id });
          } catch { failure('로그인을 저장하지 못했습니다. 연결 상태를 확인한 뒤 다시 인증해 주세요.'); }
        };
        button('비밀번호 만들기·재설정', acceptAccount(true));
        const existing = button('이미 비밀번호가 있어요', acceptAccount(false));
        existing.classList.add('auth-secondary');
        return;
      }
      handler = createAccount({ ...config, createClient, flowType: 'pkce' });
      await handler.start();
      if (disposed) return;
      if (handler.getState().user) {
        const expectedUserId = handler.getState().user.id;
        heading.textContent = '이미 로그인되어 있어요.';
        note('이 브라우저에 로그인한 계정으로 음악을 계속 들을 수 있습니다.');
        button('음악 듣기', () => {
          if (disposed || accepting) return;
          accepting = true;
          for (const element of actions.querySelectorAll('button')) element.disabled = true;
          onComplete({ passwordSetup: false, expectedUserId });
        }); return;
      }
      const result = await handler.completeLink(callback.code);
      if (disposed) return;
      if (result.ok) {
        const expectedUserId = result.user?.id ?? handler.getState().user?.id;
        if (!expectedUserId) { failure('확인된 계정을 찾지 못했습니다. 다시 인증해 주세요.'); return; }
        onComplete({ passwordSetup: true, expectedUserId });
      }
      else failure(result.message);
    } catch { failure('인증 결과를 확인하지 못했습니다. 연결 상태를 확인해 주세요. 이메일을 다시 입력하도록 자동 이동하지 않습니다.'); }
  }
  return { ready: run(), dispose() { disposed = true; handler?.dispose(); } };
}
