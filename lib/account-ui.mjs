import { createClient } from '@supabase/supabase-js';
import { createSharedAccount } from './shared-account.mjs';
import { ACCOUNT_CALLBACK, createAccountLinkInbox, readAccountCode } from './account-links.mjs';

const configured = typeof __SCYL_ACCOUNT_CONFIG__ !== 'undefined' ? __SCYL_ACCOUNT_CONFIG__ : null;

// Authentication is a shared identity; music and MEOW activity are not copied here.
export function mountAccount({ onLock = () => {}, onSignedIn = () => {}, completionCode = null, initialMessage = '', config = configured,
  createAccount = createSharedAccount, loadNativeApp = () => import('@capacitor/app').then(module => module.App) } = {}) {
  if (!config) return { configured: false, canUse: () => true, require: () => true, open() {} };
  const native = Boolean(window.Capacitor?.isNativePlatform?.());
  let account, state, lastUser = null, inbox = null, disposed = false, logoutIntent = false;
  let unsubscribe = null, nativeHandle = null;
  const main = document.querySelector('main');
  const entry = document.createElement('button');
  entry.type = 'button'; entry.className = 'scyl-account-entry'; entry.textContent = '계정';
  main.querySelector('header').append(entry);
  const panel = document.createElement('dialog'); panel.className = 'scyl-account';
  panel.setAttribute('aria-labelledby', 'account-heading');
  panel.innerHTML = `<header><img src="assets/scyl-mark.svg" width="36" height="36" alt=""><button type="button" data-close aria-label="계정 창 닫기" hidden>닫기</button></header>
    <h2 id="account-heading">하나의 계정으로.</h2><p>MEOW와 SCYL을 같은 이메일로 이용하세요.<br>기존 MEOW 회원은 다시 가입하지 않아도 됩니다.</p>
    <form><label>이메일<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com"></label>
    <button class="account-primary" type="submit" data-request-submit>인증 메일 받기</button>
    <details data-code-section hidden><summary>숫자 코드가 있는 메일인가요?</summary><label>인증 코드<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" minlength="6" maxlength="8"></label><button class="account-primary" type="submit" data-code-submit>코드로 로그인</button></details>
    <button type="button" data-change hidden>이메일 변경 · 새 메일 받기</button></form>
    <p data-message role="status" aria-live="polite">계정을 확인하고 있습니다.</p><button type="button" data-retry-logout hidden>로그아웃 다시 시도</button>
    <section data-signed hidden><p data-email></p><button type="button" class="account-primary" data-continue>음악 듣기</button><button type="button" data-logout>이 기기의 SCYL 로그아웃</button><p class="account-note">MEOW 로그인과 계정은 유지됩니다.</p></section>
    <p class="account-note">처음 이용하는 이메일은 인증 후 공통 계정이 만들어집니다. 음악 파일은 업로드하지 않습니다.</p>
    <a href="privacy.html">개인정보 안내</a>`;
  document.body.append(panel);
  const find = selector => panel.querySelector(selector);
  const form = find('form'), email = form.elements.email, code = form.elements.code;
  const codeSection = find('[data-code-section]');
  const canUse = () => Boolean(!disposed && state?.ready && !state.busy && state.phase === 'signed-in' && state.user);
  function open() { if (!disposed && !panel.open) panel.showModal(); }
  function lock() { main.inert = true; onLock(); open(); }
  function render(next) {
    state = next;
    const signed = canUse(), userId = signed ? state.user.id : null;
    if (lastUser && lastUser !== userId) onLock();
    const becameSignedIn = userId && userId !== lastUser;
    lastUser = userId;
    main.inert = !signed;
    entry.textContent = signed ? '내 계정' : '로그인';
    find('[data-close]').hidden = !signed;
    form.hidden = signed || logoutIntent; find('[data-signed]').hidden = !signed;
    find('[data-email]').textContent = signed ? state.user.email : '';
    const sent = state.phase === 'code-sent';
    codeSection.hidden = !sent; if (!sent) codeSection.open = false;
    code.required = sent && codeSection.open;
    email.disabled = state.busy || sent || !state.ready;
    code.disabled = state.busy || !sent || !codeSection.open;
    find('[data-request-submit]').disabled = state.busy || !state.ready;
    find('[data-request-submit]').hidden = sent;
    find('[data-request-submit]').textContent = state.busy ? '확인 중…' : '인증 메일 받기';
    find('[data-code-submit]').disabled = state.busy || !state.ready;
    find('[data-code-submit]').textContent = state.busy ? '확인 중…' : '코드로 로그인';
    find('[data-change]').hidden = !sent; find('[data-change]').disabled = state.busy;
    find('[data-logout]').disabled = state.busy;
    find('[data-retry-logout]').hidden = !logoutIntent || signed || state.busy;
    find('[data-retry-logout]').disabled = state.busy;
    find('[data-message]').textContent = state.errorCode ? state.message : initialMessage && !signed ? initialMessage : sent ? '메일의 승인 버튼을 눌러 주세요. 메일을 요청했던 이 브라우저 또는 앱에서 인증을 마칩니다. 숫자 코드가 표시된 메일은 아래에 입력할 수도 있습니다.' : state.message || (signed ? 'MEOW · SCYL 공통 계정으로 로그인했습니다.' : state.ready ? '이메일로 인증 메일을 보내드립니다.' : '계정을 확인하고 있습니다.');
    find('[data-message]').setAttribute('role', state.errorCode || initialMessage ? 'alert' : 'status');
    if (!signed) open();
    if (becameSignedIn) { panel.close(); onSignedIn(state.user); }
    inbox?.stateChanged();
  }
  panel.addEventListener('cancel', event => { if (!canUse()) event.preventDefault(); });
  panel.addEventListener('close', () => { if (!canUse()) open(); });
  entry.addEventListener('click', open);
  for (const selector of ['[data-close]', '[data-continue]']) find(selector).addEventListener('click', () => { if (canUse()) panel.close(); });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (!account || state.busy) return;
    initialMessage = '';
    if (state.phase === 'code-sent') { if (!codeSection.open) return; const result = await account.verifyCode(code.value); if (result.ok && canUse()) panel.close(); }
    else { const result = await account.requestCode(email.value); if (result.ok) { const notice = find('[data-message]'); notice.tabIndex = -1; notice.focus(); } }
  });
  codeSection.addEventListener('toggle', () => { code.required = state?.phase === 'code-sent' && codeSection.open; code.disabled = state?.busy || !code.required; });
  find('[data-change]').addEventListener('click', () => { initialMessage = ''; code.value = ''; account?.changeEmail(); email.focus(); });
  async function logout() {
    if (!account || state?.busy) return;
    logoutIntent = true; inbox?.cancelPending(); onLock();
    const result = await account.signOut();
    if (disposed) return;
    logoutIntent = !result.ok; render(account.getState());
  }
  find('[data-logout]').addEventListener('click', () => { void logout(); });
  find('[data-retry-logout]').addEventListener('click', () => { void logout(); });
  // Returning from a mailbox must preserve a pending email/code challenge.
  const visible = () => { if (!document.hidden && account && state?.phase === 'signed-in' && !state.busy && !logoutIntent) void account.refresh(); };
  document.addEventListener('visibilitychange', visible);
  const hide = event => { if (!event.persisted) dispose(); };
  addEventListener('pagehide', hide);
  function dispose() {
    if (disposed) return;
    disposed = true; inbox?.dispose(); unsubscribe?.(); account?.dispose();
    document.removeEventListener('visibilitychange', visible); removeEventListener('pagehide', hide);
    void nativeHandle?.remove();
  }
  let ready = Promise.resolve();
  try {
    account = createAccount({ ...config, createClient, redirectTo: ACCOUNT_CALLBACK + (native ? '?target=native' : '') });
    inbox = createAccountLinkInbox({ account, onResult(result) {
      if (!result.ok && result.code !== 'already_signed_in') {
        find('[data-message]').textContent = result.message;
        find('[data-message]').setAttribute('role', 'alert');
      }
    } });
    if (completionCode) inbox.receive(completionCode);
    unsubscribe = account.subscribe(render); lock();
    // Register warm-link listeners immediately; never wait for a network user
    // check before listening. The inbox waits until that check is ready.
    const nativeReady = native ? (async () => {
      const App = await loadNativeApp();
      if (disposed) return;
      const receive = ({ url } = {}) => { const code = readAccountCode(url, { native: true }); if (code) inbox.receive(code); };
      const handle = await App.addListener('appUrlOpen', receive);
      if (disposed) { await handle.remove(); return; }
      nativeHandle = handle;
      receive(await App.getLaunchUrl());
    })() : Promise.resolve();
    ready = Promise.all([account.start(), nativeReady]).catch(() => {
      if (disposed) return;
      find('[data-message]').textContent = '메일 인증을 완료하지 못했습니다. 인증 메일을 요청했던 앱에서 다시 시도해 주세요.';
      find('[data-message]').setAttribute('role', 'alert');
    });
  }
  catch { lock(); form.hidden = true; find('[data-message]').textContent = '계정 연결 설정을 확인하지 못했습니다. 잠시 후 다시 열어 주세요.'; }
  return { configured: true, canUse, open, ready, dispose, require() { if (canUse()) return true; open(); return false; } };
}
