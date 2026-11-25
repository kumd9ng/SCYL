import { readAuthCallback, showAuthCallback } from './auth-callback-ui.mjs';

/** Own the entry/callback view for both document and fragment navigations. */
export function mountAuthPage({ window = globalThis.window, document = window.document,
  config, createClient, mountAccount, readCallback = readAuthCallback,
  showCallback = showAuthCallback, onComplete = () => window.location.replace('mix-lab.html') } = {}) {
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
    resetView();
    const finish = () => {
      if (disposed || completed || current !== generation) return;
      completed = true;
      onComplete();
    };
    if (callback.kind === 'entry') {
      view = mountAccount({ config, onSignedIn: finish });
      document.getElementById('auth-message').textContent = view.configured
        ? 'MEOW · SCYL 공통 계정으로 음악을 이어가세요.' : '계정 연결 설정이 없는 개발 빌드입니다.';
    } else {
      view = showCallback({ callback, config, createClient, document, onComplete: finish });
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
