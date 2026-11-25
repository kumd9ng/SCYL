import { readAuthCallback, showAuthCallback } from './auth-callback-ui.mjs';
import { readPasswordSetup } from './account-continuation.mjs';

/** Own the entry/callback view for both document and fragment navigations. */
export function mountAuthPage({ window = globalThis.window, document = window.document,
  config, createClient, mountAccount, readCallback = readAuthCallback,
  showCallback = showAuthCallback, readSetup = readPasswordSetup,
  onComplete = () => window.location.replace('mix-lab.html') } = {}) {
  const main = document.querySelector('main');
  const originalMain = main.innerHTML;
  let view = null, generation = 0, disposed = false, completed = false;

  function releaseView() {
    const previous = view; view = null;
    try { Promise.resolve(previous?.dispose?.()).catch(() => {}); } catch {}
  }

  function resetView() {
    releaseView();
    // mountAccount owns a body-level modal, so restoring main alone is not
    // enough. Dispose first: its close listener must not reopen the modal.
    for (const node of document.querySelectorAll('dialog.scyl-account, .scyl-account-entry')) {
      try { if (node.open) node.close(); } catch {}
      node.remove();
    }
    main.innerHTML = originalMain;
    main.inert = false;
    main.removeAttribute('inert');
  }

  function route(initial = false) {
    if (disposed || completed) return false;
    // Read the current URL, never a delayed hashchange event's old newURL.
    // replaceState already removed the material when a second event arrives.
    let incoming = window.location.href;
    const url = new URL(incoming);
    if (!initial && !url.search && !url.hash) return false;
    let callback;
    try {
      window.history.replaceState(null, '', url.pathname);
      callback = readCallback(incoming);
    } catch {
      callback = { kind: 'error', message: '인증 주소를 안전하게 처리하지 못했습니다. 로그인 화면을 새로 열어 주세요.' };
    } finally { incoming = null; }

    const current = ++generation;
    let callbackFinished = false;
    resetView();
    const finish = () => {
      if (disposed || completed || current !== generation) return;
      completed = true;
      onComplete();
    };
    const finishCallback = ({ passwordSetup = false, expectedUserId = null } = {}) => {
      if (disposed || completed || current !== generation || callbackFinished) return;
      callbackFinished = true;
      // Explicit email confirmation is complete. Restore that same verified
      // account before exposing password/profile steps or playback.
      resetView();
      view = mountAccount({ config, passwordSetup, expectedUserId, onSignedIn: finish });
      document.getElementById('auth-message').textContent = passwordSetup
        ? '비밀번호를 만든 뒤 고양이와 MBTI를 고르면 음악을 들을 수 있어요.'
        : 'MEOW · SCYL 공통 계정으로 음악을 이어가세요.';
    };
    if (callback.kind === 'entry') {
      const setup = readSetup();
      // A reload can lose the view after the callback URL has been scrubbed.
      // The marker restores only the requested UI; mountAccount must verify
      // the server-backed session and the expected UUID before showing it.
      view = mountAccount({ config, passwordSetup: Boolean(setup),
        expectedUserId: setup?.userId ?? null, onSignedIn: finish });
      document.getElementById('auth-message').textContent = view.configured
        ? 'MEOW · SCYL 공통 계정으로 음악을 이어가세요.' : '계정 연결 설정이 없는 개발 빌드입니다.';
    } else {
      view = showCallback({ callback, config, createClient, document, onComplete: finishCallback });
    }
    return true;
  }

  const incoming = () => route();
  const hidden = event => { if (!event.persisted) dispose(); };
  function dispose() {
    if (disposed) return;
    disposed = true; generation++;
    for (const type of ['hashchange', 'popstate', 'pageshow']) window.removeEventListener(type, incoming);
    window.removeEventListener('pagehide', hidden);
    releaseView();
  }
  for (const type of ['hashchange', 'popstate', 'pageshow']) window.addEventListener(type, incoming);
  window.addEventListener('pagehide', hidden);
  route(true);
  return { dispose, get ready() { return view?.ready ?? Promise.resolve(); } };
}
