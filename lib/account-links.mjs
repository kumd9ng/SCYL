export const ACCOUNT_CALLBACK = 'https://scyl-listening-room-20261123.neo-kumdong-8306.chatgpt.site/auth.html';
export function readAccountCode(value, { native = false } = {}) {
  try {
    const url = new URL(value);
    if (native && (url.protocol !== 'com.scyl.app:' || url.hostname !== 'auth' || url.port || (url.pathname && url.pathname !== '/'))) return null;
    if (!native && !(url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) return null;
    if (url.username || url.password || url.hash || url.searchParams.getAll('code').length !== 1) return null;
    if (['error', 'error_code', 'error_description', 'access_token', 'refresh_token', 'token_hash', 'id_token'].some(name => url.searchParams.has(name))) return null;
    const code = url.searchParams.get('code');
    return /^[a-zA-Z0-9_-]{16,512}$/.test(code || '') ? code : null;
  } catch { return null; }
}
export function nativeAccountLink(code) {
  if (!/^[a-zA-Z0-9_-]{16,512}$/.test(code || '')) return null;
  return 'com.scyl.app://auth?code=' + encodeURIComponent(code);
}

/** Keep a native/callback code until initial/foreground auth checks settle. */
export function createAccountLinkInbox({ account, onResult = () => {} }) {
  const queued = [], seen = new Set();
  let running = false, disposed = false, timer = null, version = 0, inFlight = null, epoch = 0;
  function schedule() {
    if (disposed || timer !== null || running) return;
    timer = setTimeout(() => { timer = null; void drain(); }, 0);
  }
  async function drain() {
    if (disposed || running || !queued.length) return;
    const state = account.getState();
    if (!state.ready || state.busy) return;
    const code = queued.shift(), before = version, intent = epoch;
    running = true; inFlight = code;
    let result;
    try { result = await account.completeLink(code); }
    catch { result = { ok: false, code: 'auth_unavailable', message: '인증 링크를 확인하지 못했습니다. 새 인증 메일을 받아 주세요.' }; }
    running = false; inFlight = null;
    if (disposed) return;
    if (intent !== epoch) { schedule(); return; }
    if (result.code === 'busy' || result.code === 'cancelled') {
      queued.unshift(code);
      if (version !== before) schedule();
      return;
    }
    seen.add(code);
    if (seen.size > 32) seen.delete(seen.values().next().value);
    try { onResult(result); } catch {}
    schedule();
  }
  return {
    receive(code) {
      if (disposed || typeof code !== 'string' || !/^[A-Za-z0-9_-]{16,512}$/.test(code) || seen.has(code) || queued.includes(code) || inFlight === code) return false;
      queued.push(code); schedule(); return true;
    },
    stateChanged() { version++; schedule(); },
    cancelPending() {
      epoch++;
      for (const code of queued) seen.add(code);
      if (inFlight) seen.add(inFlight);
      queued.length = 0;
    },
    dispose() { disposed = true; if (timer !== null) clearTimeout(timer); queued.length = 0; seen.clear(); },
  };
}
