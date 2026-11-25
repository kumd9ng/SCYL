const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cancelled = () => ({ ok: false, code: 'cancelled', message: '이전 인증 요청을 취소했습니다.' });

function configError() {
  const error = new Error('공통 계정 연결 설정을 확인해 주세요. 공개용 인증 주소와 키만 사용할 수 있습니다.');
  error.code = 'invalid_auth_config';
  return error;
}

/** Accept only browser-safe Supabase credentials; never accept a service key. */
export function validateSharedAccountConfig({ url, key, redirectTo } = {}) {
  if (typeof url !== 'string' || typeof key !== 'string') throw configError();
  let parsed;
  try { parsed = new URL(url.trim()); } catch { throw configError(); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw configError();
  const publicKey = key.trim();
  if (!/^sb_publishable_[A-Za-z0-9_-]{12,}$/.test(publicKey)) {
    try {
      const pieces = publicKey.split('.');
      if (pieces.length !== 3 || pieces.some(piece => !/^[A-Za-z0-9_-]+$/.test(piece))) throw configError();
      const payload = JSON.parse(atob(pieces[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role !== 'anon') throw configError();
      if (payload.ref && parsed.hostname.endsWith('.supabase.co') && parsed.hostname !== `${payload.ref}.supabase.co`) throw configError();
    } catch { throw configError(); }
  }
  let redirect;
  if (redirectTo !== undefined) {
    try { redirect = new URL(redirectTo); } catch { throw configError(); }
    if (typeof redirectTo !== 'string' || redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.hash || redirectTo.length > 2048) throw configError();
  }
  return Object.freeze({ url: parsed.origin, key: publicKey, ...(redirect ? { redirectTo: redirect.href } : {}) });
}

function failure(error, verifying = false) {
  const messages = {
    email_address_not_authorized: '인증 메일 발송 설정이 아직 완료되지 않아 이 주소로 메일을 보낼 수 없습니다. 서비스 설정을 확인해 주세요.',
    over_email_send_rate_limit: '인증 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
    over_request_rate_limit: '인증 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
    email_provider_disabled: '현재 이메일 로그인이 서버에서 허용되지 않습니다.',
    otp_disabled: '현재 이메일 로그인이 서버에서 허용되지 않습니다.',
    signup_disabled: '현재 신규 회원 가입이 서버에서 허용되지 않습니다.',
    otp_expired: '인증 코드가 만료되었거나 유효하지 않습니다. 최신 코드를 확인하거나 새 메일을 받아 주세요.',
    invalid_credentials: '인증 코드를 확인하지 못했습니다. 메일의 최신 코드를 확인해 주세요.',
    session_not_found: '로그인이 만료되었습니다. 다시 인증해 주세요.',
    session_expired: '로그인이 만료되었습니다. 다시 인증해 주세요.',
    user_not_found: '회원 정보를 확인하지 못했습니다. 다시 인증해 주세요.',
    bad_jwt: '로그인을 확인하지 못했습니다. 다시 인증해 주세요.',
    flow_state_not_found: '이 링크를 요청한 브라우저나 앱에서 열어 주세요. 메일에 인증 코드가 있다면 코드로도 로그인할 수 있습니다.',
    flow_state_expired: '인증 링크가 만료되었습니다. 새 인증 메일을 받아 주세요.',
    bad_code_verifier: '이 링크를 요청한 브라우저나 앱에서 열어 주세요. 메일에 인증 코드가 있다면 코드로도 로그인할 수 있습니다.',
  };
  const code = Object.hasOwn(messages, error?.code) ? error.code : error?.status === 429 ? 'over_request_rate_limit' : 'auth_unavailable';
  return { ok: false, code, message: messages[code] ?? (verifying
    ? '로그인을 확인하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.'
    : '인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.') };
}

function publicUser(user) {
  if (!user || typeof user.id !== 'string' || !UUID.test(user.id) || user.is_anonymous === true || typeof user.email !== 'string' || !EMAIL.test(user.email)) return null;
  return { id: user.id, email: user.email };
}

/**
 * Shared membership identity, with a separate SCYL session. `getUser` verifies
 * every accepted identity with the server. This client is not a replacement
 * for server authorization/RLS. No access or refresh token is exposed in state.
 */
export function createSharedAccount({ url, key, redirectTo, createClient, storage } = {}) {
  const config = validateSharedAccountConfig({ url, key, redirectTo });
  if (typeof createClient !== 'function') throw new TypeError('인증 클라이언트 연결을 확인해 주세요.');
  const { auth } = createClient(config.url, config.key, { auth: {
    storageKey: 'scyl-auth-v1', persistSession: true, autoRefreshToken: true,
    // Email codes work on both web and native. Never consume unrelated tokens
    // or codes from the hosted Sites callback/query string.
    detectSessionInUrl: false, flowType: 'pkce', ...(storage ? { storage } : {}),
  } });
  const listeners = new Set();
  const readyWaiters = new Set();
  let state = { phase: 'initializing', ready: false, busy: false, user: null, email: '', message: '', errorCode: '' };
  let generation = 0, authVersion = 0, validation = 0, active = null;
  let started = false, disposed = false, subscription = null, startPromise = null;
  let pendingVerify = null, logoutPromise = null, logoutRequested = false;
  const timers = new Set();
  const getState = () => ({ ...state, user: state.user ? { ...state.user } : null });
  const readyResult = () => state.phase === 'error'
    ? { ok: false, code: state.errorCode, message: state.message }
    : { ok: true, user: state.user ? { ...state.user } : null };
  function publish(patch) {
    if (disposed) return;
    state = { ...state, ...patch };
    for (const listener of listeners) { try { listener(getState()); } catch {} }
    if (state.ready) {
      for (const resolve of readyWaiters) resolve(readyResult());
      readyWaiters.clear();
    }
  }
  function defer(callback) {
    const timer = setTimeout(() => { timers.delete(timer); if (!disposed) callback(); }, 0);
    timers.add(timer);
  }
  const current = operation => !disposed && active === operation && operation.generation === generation && !logoutRequested;
  function preflight() {
    if (disposed) return { ok: false, code: 'disposed', message: '이 화면의 인증 처리가 종료되었습니다.' };
    if (!started || !state.ready || state.busy || logoutRequested) return { ok: false, code: 'busy', message: '진행 중인 인증 처리가 끝난 뒤 다시 시도해 주세요.' };
    return null;
  }
  function begin(type) {
    const operation = { type, generation };
    active = operation;
    publish({ busy: true, message: '', errorCode: '' });
    return operation;
  }
  function finish(operation, patch) {
    if (!current(operation)) return false;
    active = null; publish({ ...patch, busy: false }); return true;
  }
  function showFailure(operation, result, patch = {}) {
    finish(operation, { ...patch, errorCode: result.code, message: result.message });
    return result;
  }
  function signedOut(patch = {}) {
    publish({ phase: 'signed-out', ready: true, user: null, email: '', message: '', errorCode: '', ...patch });
  }

  async function validateIdentity({ expectedId = null, operation = null } = {}) {
    const ticket = ++validation, version = authVersion, epoch = generation;
    let result;
    try { result = await auth.getUser(); } catch (error) { result = { error }; }
    if (disposed || logoutRequested || ticket !== validation || version !== authVersion || epoch !== generation || (operation && !current(operation))) return cancelled();
    if (result?.error?.name === 'AuthSessionMissingError' && !expectedId) {
      signedOut(); return { ok: true, user: null };
    }
    const user = publicUser(result?.data?.user);
    if (result?.error || !user || (expectedId && user.id !== expectedId)) {
      const error = failure(result?.error, true);
      publish({ phase: 'error', ready: true, user: null, message: error.message, errorCode: error.code });
      return error;
    }
    publish({ phase: 'signed-in', ready: true, user, email: user.email, message: '로그인되었습니다.', errorCode: '' });
    return { ok: true, user: { ...user } };
  }

  function authChanged(event, session) {
    if (disposed) return;
    ++authVersion; ++validation;
    if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session)) {
      if (event === 'INITIAL_SESSION' && active?.type === 'verify') return;
      ++generation; active = null;
      signedOut({ busy: logoutRequested });
      // A local/global sign-out can arrive while verifyOtp is saving a session.
      // Let that network operation settle, then revoke only this SCYL session.
      if (pendingVerify && !logoutRequested) { publish({ busy: true }); defer(() => { void signOut(); }); }
      return;
    }
    if (logoutRequested || !session?.user?.id) return;
    if (active?.type === 'request') { ++generation; active = null; publish({ busy: false }); }
    const epoch = generation, version = authVersion, expectedId = session.user.id;
    publish({ user: null, ready: false, message: '', errorCode: '' });
    // Supabase holds an auth lock while invoking the callback. Do not make an
    // SDK call or return a promise from inside onAuthStateChange.
    defer(() => {
      if (epoch === generation && version === authVersion && !logoutRequested && active?.type !== 'verify') void validateIdentity({ expectedId });
    });
  }

  function start() {
    if (disposed) return Promise.resolve(cancelled());
    if (startPromise) return startPromise;
    started = true;
    try { subscription = auth.onAuthStateChange(authChanged)?.data?.subscription ?? null; }
    catch (error) {
      const result = failure(error);
      publish({ phase: 'error', ready: true, message: result.message, errorCode: result.code });
      return Promise.resolve(result);
    }
    startPromise = validateIdentity().then(result => {
      // INITIAL_SESSION may legitimately invalidate the first getUser call.
      // Resolve start only once the latest event has a settled identity state.
      if (result.code !== 'cancelled' || disposed) return result;
      if (state.ready) return readyResult();
      return new Promise(resolve => { readyWaiters.add(resolve); });
    });
    return startPromise;
  }

  async function requestCode(email) {
    const blocked = preflight(); if (blocked) return blocked;
    if (state.user) return { ok: false, code: 'already_signed_in', message: '이미 로그인되어 있습니다.' };
    const normalized = typeof email === 'string' ? email.trim() : '';
    if (!EMAIL.test(normalized) || normalized.length > 254) {
      const result = { ok: false, code: 'invalid_email', message: '이메일 주소를 확인해 주세요.' };
      publish({ message: result.message, errorCode: result.code }); return result;
    }
    const operation = begin('request');
    let result;
    try { result = await auth.signInWithOtp({ email: normalized, options: { shouldCreateUser: true, ...(config.redirectTo ? { emailRedirectTo: config.redirectTo } : {}) } }); }
    catch (error) { result = { error }; }
    if (!current(operation)) return cancelled();
    if (result?.error) return showFailure(operation, failure(result.error));
    finish(operation, { phase: 'code-sent', email: normalized, user: null, message: '인증 메일을 보냈습니다. 메일의 승인 버튼을 열어 주세요. 인증 코드가 표시되면 코드로도 로그인할 수 있습니다.', errorCode: '' });
    return { ok: true };
  }

  async function verifyCode(code) {
    const blocked = preflight(); if (blocked) return blocked;
    if (state.phase !== 'code-sent' || !state.email) return { ok: false, code: 'code_not_requested', message: '먼저 인증 메일을 받아 주세요.' };
    const token = typeof code === 'string' ? code.trim() : '';
    if (!/^\d{6,8}$/.test(token)) {
      const result = { ok: false, code: 'invalid_code', message: '메일에 표시된 6~8자리 인증 코드를 입력해 주세요.' };
      publish({ message: result.message, errorCode: result.code }); return result;
    }
    const operation = begin('verify'), email = state.email;
    let result;
    const pending = Promise.resolve().then(() => auth.verifyOtp({ email, token, type: 'email' }));
    pendingVerify = pending;
    try { result = await pending; } catch (error) { result = { error }; }
    finally { if (pendingVerify === pending) pendingVerify = null; }
    if (!current(operation)) return cancelled();
    if (result?.error) return showFailure(operation, failure(result.error, true), { ready: true, phase: 'code-sent', user: null });
    const expectedId = result?.data?.user?.id ?? result?.data?.session?.user?.id;
    if (typeof expectedId !== 'string' || !UUID.test(expectedId)) return showFailure(operation, failure(null, true), { ready: true, phase: 'code-sent', user: null });
    const verified = await validateIdentity({ expectedId, operation });
    if (!current(operation)) return cancelled();
    if (!verified.ok && verified.code !== 'cancelled') {
      finish(operation, { phase: 'code-sent', ready: true, user: null, email, errorCode: verified.code, message: verified.message });
    } else {
      finish(operation, {});
      if (verified.code === 'cancelled') defer(() => { void refresh(); });
    }
    return verified;
  }

  async function completeLink(code) {
    const blocked = preflight(); if (blocked) return blocked;
    if (state.user) return { ok: false, code: 'already_signed_in', message: '이미 로그인되어 있습니다. 다른 계정으로 바꾸려면 먼저 로그아웃해 주세요.' };
    if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{16,512}$/.test(code)) {
      const result = { ok: false, code: 'invalid_link', message: '인증 링크를 확인하지 못했습니다. 새 인증 메일을 받아 주세요.' };
      publish({ message: result.message, errorCode: result.code }); return result;
    }
    const operation = begin('verify'), email = state.email;
    let result;
    // Supabase exchanges only an authorization code and checks the PKCE
    // verifier kept in this app's storage. Never accept implicit URL tokens.
    const pending = Promise.resolve().then(() => auth.exchangeCodeForSession(code));
    pendingVerify = pending;
    try { result = await pending; } catch (error) { result = { error }; }
    finally { if (pendingVerify === pending) pendingVerify = null; }
    if (!current(operation)) return cancelled();
    const phase = email ? 'code-sent' : 'signed-out';
    if (result?.error) return showFailure(operation, failure(result.error, true), { ready: true, phase, user: null });
    const expectedId = result?.data?.user?.id ?? result?.data?.session?.user?.id;
    if (typeof expectedId !== 'string' || !UUID.test(expectedId)) return showFailure(operation, failure(null, true), { ready: true, phase, user: null });
    const verified = await validateIdentity({ expectedId, operation });
    if (!current(operation)) return cancelled();
    if (!verified.ok && verified.code !== 'cancelled') {
      finish(operation, { phase, ready: true, user: null, email, errorCode: verified.code, message: verified.message });
    } else {
      finish(operation, {});
      if (verified.code === 'cancelled') defer(() => { void refresh(); });
    }
    return verified;
  }

  function changeEmail() {
    const blocked = preflight(); if (blocked) return blocked;
    if (state.user) return { ok: false, code: 'already_signed_in', message: '계정을 바꾸려면 먼저 로그아웃해 주세요.' };
    ++generation; ++validation; active = null;
    signedOut({ busy: false }); return { ok: true };
  }

  function signOut() {
    if (disposed) return Promise.resolve(cancelled());
    if (logoutPromise) return logoutPromise;
    logoutRequested = true; ++generation; ++validation; active = null;
    signedOut({ busy: true, message: '이 앱에서 로그아웃하고 있습니다.' });
    const pending = pendingVerify;
    logoutPromise = (async () => {
      if (pending) { try { await pending; } catch {} }
      let result;
      try { result = await auth.signOut({ scope: 'local' }); } catch (error) { result = { error }; }
      if (disposed) return cancelled();
      if (result?.error) {
        const error = failure(result.error);
        // Keep playback closed even when remote logout cannot be confirmed.
        publish({ phase: 'error', ready: true, busy: false, user: null, message: '로그아웃을 완료하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.', errorCode: error.code });
        return { ...error, message: state.message };
      }
      logoutRequested = false;
      signedOut({ busy: false, message: 'SCYL에서 로그아웃했습니다.' });
      return { ok: true };
    })().finally(() => { logoutPromise = null; });
    return logoutPromise;
  }

  function refresh() {
    if (!started || disposed || logoutRequested || active) return Promise.resolve(cancelled());
    publish({ ready: false, user: null });
    return validateIdentity();
  }
  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('인증 상태 수신 함수를 확인해 주세요.');
    if (disposed) return () => {};
    listeners.add(listener); listener(getState());
    return () => { listeners.delete(listener); };
  }
  function dispose() {
    if (disposed) return;
    disposed = true; ++generation; ++validation; active = null;
    subscription?.unsubscribe();
    for (const timer of timers) clearTimeout(timer);
    for (const resolve of readyWaiters) resolve(cancelled());
    readyWaiters.clear();
    timers.clear(); listeners.clear();
  }
  return { start, requestCode, verifyCode, completeLink, changeEmail, signOut, refresh, getState, subscribe, dispose };
}
