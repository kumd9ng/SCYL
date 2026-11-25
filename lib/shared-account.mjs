import { isCompanionProfile, normalizeCompanionProfile } from './companion-catalog.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTH_STORAGE_KEY = 'scyl-auth-v1';
const PKCE_LEGACY_KEY = `${AUTH_STORAGE_KEY}-code-verifier`;
const MAIL_RETRY_KEY = `${AUTH_STORAGE_KEY}-email-retry-at`;
const MAIL_RETRY_DELAY = 60_000;
export const PASSWORD_MIN_LENGTH = 8;
const cancelled = () => ({ ok: false, code: 'cancelled', message: '이전 인증 요청을 취소했습니다.' });
const sessionChangedError = () => Object.assign(new Error('Account session changed during verification.'), { code: 'account_storage_changed' });

function requestSafeStorage(provided) {
  let storage = provided;
  if (!storage) { try { storage = globalThis.localStorage; } catch {} }
  if (!storage) {
    const memory = new Map();
    storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); }, removeItem: key => { memory.delete(key); } };
  }
  let transaction = null, sessionMutation = null, lockedSession = null, closed = false;
  let lockTail = Promise.resolve();
  const changedElsewhere = event => {
    if (transaction && (event.key === PKCE_LEGACY_KEY || event.key === null)) transaction.foreign = true;
    if (sessionMutation && (event.key === AUTH_STORAGE_KEY || event.key === null)) sessionMutation.foreign = true;
    if (lockedSession && (event.key === AUTH_STORAGE_KEY || event.key === null)) lockedSession.foreign = true;
  };
  globalThis.window?.addEventListener?.('storage', changedElsewhere);
  async function writableSession(removing = false) {
    if (lockedSession) {
      const owner = lockedSession, before = await storage.getItem(AUTH_STORAGE_KEY);
      // A getUser/refresh response may arrive after a callback or another tab
      // committed a newer session. Throw before the SDK's remove/write finishes:
      // silently dropping it would still let the SDK broadcast SIGNED_OUT.
      if (closed || lockedSession !== owner || owner.foreign || before !== owner.value) throw sessionChangedError();
    }
    const owner = sessionMutation;
    if (!owner) return !closed;
    const before = await storage.getItem(AUTH_STORAGE_KEY);
    if (closed || sessionMutation !== owner || owner.foreign || !owner.current() || before !== owner.value) {
      owner.discarded = true;
      if (removing) throw sessionChangedError();
      return false;
    }
    return true;
  }
  const adapter = {
    getItem: key => closed ? null : storage.getItem(key),
    async setItem(key, value) {
      if (closed) return;
      if (key === AUTH_STORAGE_KEY && !await writableSession()) return;
      const owner = transaction;
      if (owner && key === PKCE_LEGACY_KEY) {
        const before = await storage.getItem(key);
        if (closed) return;
        if (before !== owner.after) owner.foreign = true;
        owner.after = value; owner.wrote = true;
      }
      if (closed) return;
      await storage.setItem(key, value);
      if (key === AUTH_STORAGE_KEY && sessionMutation) sessionMutation.value = value;
      if (key === AUTH_STORAGE_KEY && lockedSession) lockedSession.value = value;
    },
    async removeItem(key) {
      if (closed) return;
      if (key === AUTH_STORAGE_KEY && !await writableSession(true)) return;
      const owner = transaction;
      if (owner && key === PKCE_LEGACY_KEY) {
        const before = await storage.getItem(key);
        if (closed) return;
        if (before !== owner.after) owner.foreign = true;
        owner.after = null;
      }
      if (closed) return;
      await storage.removeItem(key);
      if (key === AUTH_STORAGE_KEY && sessionMutation) sessionMutation.value = null;
      if (key === AUTH_STORAGE_KEY && lockedSession) lockedSession.value = null;
    },
  };
  return {
    adapter,
    // Supabase routes initialization, reads, refreshes and sign-out through its
    // public lock hook. Serialize this client's work and bind every SDK storage
    // mutation to the snapshot from before its asynchronous network operation.
    lock(_name, _timeout, run) {
      const pending = lockTail.then(async () => {
        if (closed) return run();
        const owner = { value: await storage.getItem(AUTH_STORAGE_KEY), foreign: false };
        lockedSession = owner;
        try {
          return await run();
        }
        finally { if (lockedSession === owner) lockedSession = null; }
      });
      lockTail = pending.catch(() => {});
      return pending;
    },
    async beginSessionMutation(current) {
      const value = await storage.getItem(AUTH_STORAGE_KEY);
      if (closed || !current()) return null;
      const owner = { value, current, foreign: false, discarded: false };
      sessionMutation = owner; return owner;
    },
    endSessionMutation(owner) { if (sessionMutation === owner) sessionMutation = null; },
    rejectedSessionMutation: () => Boolean(sessionMutation?.discarded),
    async begin() {
      if (closed) return null;
      const before = await storage.getItem(PKCE_LEGACY_KEY);
      if (closed) return null;
      const owner = { before, after: before, wrote: false, foreign: false };
      transaction = owner; return owner;
    },
    async rollback(owner, stillCurrent) {
      if (closed || transaction !== owner || owner.foreign || !owner.wrote || !stillCurrent()) return;
      const current = await storage.getItem(PKCE_LEGACY_KEY);
      // A different tab/operation may have advanced the verifier. Never
      // replace that value with an older request's snapshot.
      if (closed || transaction !== owner || current !== owner.after || owner.foreign || !stillCurrent()) return;
      if (owner.before === null || owner.before === undefined) await storage.removeItem(PKCE_LEGACY_KEY);
      else await storage.setItem(PKCE_LEGACY_KEY, owner.before);
    },
    end(owner) { if (transaction === owner) transaction = null; },
    dispose() {
      // SDK disposal does not abort in-flight exchanges/refreshes. Close the
      // storage boundary synchronously before their late save/remove calls.
      closed = true; transaction = null; sessionMutation = null; lockedSession = null;
      globalThis.window?.removeEventListener?.('storage', changedElsewhere);
    },
  };
}

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
    over_email_send_rate_limit: '서비스의 인증 메일 발송 한도에 도달해 새 메일을 보내지 못했습니다. 서버 한도가 해제된 뒤 다시 발송할 수 있습니다.',
    over_request_rate_limit: '인증 요청 한도에 도달해 새 메일을 보내지 못했습니다. 잠시 후 다시 요청해 주세요.',
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
    pkce_code_verifier_not_found: '이 브라우저에서 인증을 시작한 기록을 찾지 못했습니다. 인증 메일을 요청했던 Safari·Chrome 또는 SCYL 앱에서 링크를 열어 주세요. 다른 브라우저·기기로 열었거나 저장 정보가 지워졌을 수 있습니다.',
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

function passwordFailure(error, setting = false) {
  const messages = {
    invalid_credentials: '이메일 또는 비밀번호가 올바르지 않습니다. 처음 이용하거나 비밀번호를 잊었다면 이메일 인증으로 계속해 주세요.',
    email_not_confirmed: '이메일 인증을 먼저 완료해 주세요.',
    weak_password: `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상으로 입력하고 서버의 비밀번호 조건을 확인해 주세요.`,
    same_password: '현재 비밀번호와 다른 새 비밀번호를 입력해 주세요.',
    reauthentication_needed: '비밀번호를 바꾸려면 이메일로 다시 인증한 뒤 설정해 주세요.',
    reauthentication_not_valid: '재인증을 확인하지 못했습니다. 이메일로 다시 인증한 뒤 비밀번호를 설정해 주세요.',
    reauth_nonce_missing: '비밀번호 변경을 위한 재인증이 아직 완료되지 않았습니다. 이메일로 다시 인증해 주세요.',
    session_not_found: '로그인이 만료되었습니다. 다시 로그인한 뒤 비밀번호를 설정해 주세요.',
    session_expired: '로그인이 만료되었습니다. 다시 로그인한 뒤 비밀번호를 설정해 주세요.',
    over_request_rate_limit: '로그인 요청이 많습니다. 잠시 후 다시 시도해 주세요.',
    email_provider_disabled: '현재 이메일 로그인이 서버에서 허용되지 않습니다.',
  };
  const code = Object.hasOwn(messages, error?.code) ? error.code : error?.status === 429 ? 'over_request_rate_limit' : setting ? 'password_update_failed' : 'password_sign_in_failed';
  return { ok: false, code, message: messages[code] ?? (setting ? '비밀번호 설정 결과를 확인하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.' : '로그인하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.') };
}

const copyUser = user => user ? { ...user, ...(user.profile ? { profile: { ...user.profile } } : {}) } : null;

/**
 * Shared membership identity, with a separate SCYL session. `getUser` verifies
 * every accepted identity with the server. This client is not a replacement
 * for server authorization/RLS. No access or refresh token is exposed in state.
 */
export function createSharedAccount({ url, key, redirectTo, createClient, storage, fetch: passwordFetch = globalThis.fetch, now = Date.now, flowType = 'pkce' } = {}) {
  const config = validateSharedAccountConfig({ url, key, redirectTo });
  if (!['pkce', 'implicit'].includes(flowType)) {
    const error = new Error('지원하지 않는 계정 인증 방식입니다.'); error.code = 'invalid_auth_flow'; throw error;
  }
  if (typeof createClient !== 'function') throw new TypeError('인증 클라이언트 연결을 확인해 주세요.');
  const safeStorage = requestSafeStorage(storage);
  const client = createClient(config.url, config.key, { auth: {
    storageKey: AUTH_STORAGE_KEY, persistSession: true, autoRefreshToken: true,
    // Email codes work on both web and native. Never consume unrelated tokens
    // or codes from the hosted Sites callback/query string.
    detectSessionInUrl: false, flowType, storage: safeStorage.adapter, lock: safeStorage.lock,
  } });
  const { auth } = client;
  const listeners = new Set();
  const readyWaiters = new Set();
  let state = { phase: 'initializing', ready: false, busy: false, user: null, email: '', message: '', errorCode: '', profileUnavailable: false };
  let generation = 0, authVersion = 0, validation = 0, active = null;
  let started = false, disposed = false, subscription = null, startPromise = null, teardown = null;
  let pendingVerify = null, pendingSend = null, logoutPromise = null, logoutRequested = false;
  let requestRetryAt = 0, cooldownLoaded = false;
  const timers = new Set();
  const profileRequests = new Set();
  const profileUnavailable = () => ({ ok: false, code: 'profile_unavailable', message: '공통 회원 정보를 불러오지 못했습니다. 공통 프로필 다시 확인 버튼을 눌러 주세요.' });
  async function profileRpc(name, body) {
    const controller = new AbortController(); profileRequests.add(controller);
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const request = client.rpc(name, body);
      return await (typeof request.abortSignal === 'function' ? request.abortSignal(controller.signal) : request);
    } finally { clearTimeout(timeout); profileRequests.delete(controller); }
  }
  async function readProfile(userId) {
    const result = await profileRpc('get_shared_profile', { expected_actor: userId });
    if (result?.error) throw new Error('Shared profile unavailable');
    if (result.data === null) return null;
    if (result.data?.userId !== userId || !isCompanionProfile(result.data)) throw new Error('Invalid shared profile');
    // Existing MEOW identities may use a variant breed ID. Keep that exact
    // server identity; normalization supplies only its display group.
    return { ...normalizeCompanionProfile(result.data), catId: result.data.catId };
  }
  const getState = () => ({ ...state, user: copyUser(state.user),
    requestRetryAt, requestWaitSeconds: Math.max(0, Math.ceil((requestRetryAt - now()) / 1000)) });
  const readyResult = () => state.phase === 'error'
    ? { ok: false, code: state.errorCode, message: state.message }
    : { ok: true, user: copyUser(state.user) };
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
  async function guardedSessionMutation(operation, run) {
    const owner = await safeStorage.beginSessionMutation(() => current(operation));
    if (!owner) return { cancelled: true };
    try {
      const result = await run();
      return owner.discarded ? { storageChanged: true } : result;
    } finally { safeStorage.endSessionMutation(owner); }
  }
  async function changedDuringVerification(operation) {
    finish(operation, {});
    await refresh();
    return { ok: false, code: 'account_changed', message: '이 브라우저의 로그인 계정이 바뀌었습니다. 현재 계정을 확인해 주세요.' };
  }
  function signedOut(patch = {}) {
    publish({ phase: 'signed-out', ready: true, user: null, email: '', message: '', errorCode: '', profileUnavailable: false, ...patch });
  }

  async function validateIdentity({ expectedId = null, operation = null, retriedStorageChange = false } = {}) {
    const ticket = ++validation, version = authVersion, epoch = generation;
    let result, before, after;
    try {
      before = await safeStorage.adapter.getItem(AUTH_STORAGE_KEY);
      result = await auth.getUser();
      after = await safeStorage.adapter.getItem(AUTH_STORAGE_KEY);
    } catch (error) { result = { error }; }
    if (disposed || logoutRequested || ticket !== validation || version !== authVersion || epoch !== generation || (operation && !current(operation))) return cancelled();
    if ((result?.error?.code === 'account_storage_changed' || (after !== undefined && before !== after)) && !retriedStorageChange) {
      // A background validation follows the current stored session; an explicit
      // password/profile operation remains pinned to its original actor.
      return validateIdentity({ expectedId: operation ? expectedId : null, operation, retriedStorageChange: true });
    }
    if (result?.error?.name === 'AuthSessionMissingError' && !expectedId) {
      signedOut(); return { ok: true, user: null };
    }
    const user = publicUser(result?.data?.user);
    if (result?.error || !user || (expectedId && user.id !== expectedId)) {
      const error = failure(result?.error, true);
      publish({ phase: 'error', ready: true, user: null, message: error.message, errorCode: error.code });
      return error;
    }
    let profile;
    try { profile = await readProfile(user.id); }
    catch {
      if (disposed || logoutRequested || ticket !== validation || version !== authVersion || epoch !== generation || (operation && !current(operation))) return cancelled();
      const error = profileUnavailable();
      // Keep the verified login. A failed profile read must not send the member
      // through email again or offer to overwrite an unknown existing profile.
      publish({ phase: 'signed-in', ready: true, user, email: user.email, profileUnavailable: true, errorCode: error.code, message: error.message });
      return { ok: true, user: copyUser(user), profileUnavailable: true };
    }
    if (disposed || logoutRequested || ticket !== validation || version !== authVersion || epoch !== generation || (operation && !current(operation))) return cancelled();
    if (profile) user.profile = profile;
    publish({ phase: 'signed-in', ready: true, user, email: user.email, profileUnavailable: false, message: '로그인되었습니다.', errorCode: '' });
    return { ok: true, user: copyUser(user) };
  }

  function authChanged(event, session, removalConfirmed = false) {
    if (disposed) return;
    if (event !== 'SIGNED_OUT' && safeStorage.rejectedSessionMutation()) return;
    if (event === 'SIGNED_OUT' && !removalConfirmed && !logoutRequested
      && ['profile', 'password-update'].includes(active?.type)) {
      // A stale broadcast must not cancel an already accepted password PUT
      // and hide its result. These mutations already verify the pinned actor
      // again before publishing success. Only actual storage removal interrupts
      // them; merely reading the stored value never authenticates an identity.
      const operation = active;
      try {
        Promise.resolve(safeStorage.adapter.getItem(AUTH_STORAGE_KEY)).then(stored => {
          if (disposed || logoutRequested || stored !== null) return;
          if (active === operation) authChanged(event, session, true);
          else if (!active) defer(() => { void validateIdentity(); });
        }).catch(() => { if (!disposed && active === operation) authChanged(event, session, true); });
      } catch { authChanged(event, session, true); }
      return;
    }
    // A token refresh may arrive during the shared-profile request. Preserve
    // the current identity until the explicit server checks finish below.
    if (['profile', 'password-update'].includes(active?.type) && event !== 'SIGNED_OUT' && session?.user?.id === active.expectedId) return;
    ++authVersion; ++validation;
    if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session)) {
      if (event === 'INITIAL_SESSION' && ['verify', 'password-login'].includes(active?.type)) return;
      ++generation; active = null;
      if (logoutRequested) signedOut({ busy: true });
      else {
        // BroadcastChannel sign-out can be stale, and INITIAL_SESSION(null)
        // also represents an SDK restore failure. Neither proves the currently
        // stored session is gone. Recheck it with the server before deciding.
        const epoch = generation, version = authVersion;
        publish({ ready: false, user: null, busy: false, message: '', errorCode: '' });
        defer(async () => {
          const stored = await safeStorage.adapter.getItem(AUTH_STORAGE_KEY);
          if (disposed || epoch !== generation || version !== authVersion || logoutRequested) return;
          // A genuine local/global removal during verification must still wait
          // for that mutation and revoke its late result. A stale broadcast
          // with a currently stored session must never revoke that session.
          if (pendingVerify && stored === null) { publish({ busy: true }); void signOut(); }
          else void validateIdentity();
        });
      }
      return;
    }
    if (logoutRequested || !session?.user?.id) return;
    if (['request', 'profile', 'password-update'].includes(active?.type)
      || (active?.type === 'password-login' && session.user.email?.toLowerCase() !== active.expectedEmail)) {
      ++generation; active = null; publish({ busy: false });
    }
    const epoch = generation, version = authVersion;
    publish({ user: null, ready: false, message: '', errorCode: '' });
    // Supabase holds an auth lock while invoking the callback. Do not make an
    // SDK call or return a promise from inside onAuthStateChange.
    defer(() => {
      if (epoch === generation && version === authVersion && !logoutRequested && !['verify', 'password-login'].includes(active?.type)) void validateIdentity();
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
    startPromise = (async () => {
      try {
        const saved = Number(await safeStorage.adapter.getItem(MAIL_RETRY_KEY));
        if (Number.isFinite(saved) && saved > now()) requestRetryAt = Math.min(saved, now() + MAIL_RETRY_DELAY);
      } catch {}
      cooldownLoaded = true;
      return validateIdentity();
    })().then(result => {
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
    if (!cooldownLoaded || pendingSend) return { ok: false, code: 'busy', message: '진행 중인 인증 처리가 끝난 뒤 다시 시도해 주세요.' };
    if (state.user) return { ok: false, code: 'already_signed_in', message: '이미 로그인되어 있습니다.' };
    const normalized = typeof email === 'string' ? email.trim() : '';
    if (!EMAIL.test(normalized) || normalized.length > 254) {
      const result = { ok: false, code: 'invalid_email', message: '이메일 주소를 확인해 주세요.' };
      publish({ message: result.message, errorCode: result.code }); return result;
    }
    const seconds = getState().requestWaitSeconds;
    if (seconds > 0) {
      const result = { ok: false, code: 'email_request_cooldown', message: `중복 발송을 막기 위해 ${seconds}초 뒤에 새 인증 메일을 요청할 수 있습니다. 서버의 발송 한도 해제 시각과는 다릅니다.` };
      publish({ message: result.message, errorCode: result.code }); return result;
    }
    const operation = begin('request');
    let result, snapshot;
    const pending = (async () => {
      try {
        snapshot = await safeStorage.begin();
        if (!current(operation)) return { cancelled: true };
        requestRetryAt = now() + MAIL_RETRY_DELAY;
        try { await safeStorage.adapter.setItem(MAIL_RETRY_KEY, String(requestRetryAt)); } catch {}
        if (!current(operation)) return { cancelled: true };
        result = await auth.signInWithOtp({ email: normalized, options: { shouldCreateUser: true, ...(config.redirectTo ? { emailRedirectTo: config.redirectTo } : {}) } });
      } catch (error) { result = { error }; }
      if (result?.error && snapshot && current(operation)) {
        try { await safeStorage.rollback(snapshot, () => current(operation)); } catch {}
      }
      return result;
    })();
    pendingSend = pending;
    try { result = await pending; }
    finally { if (snapshot) safeStorage.end(snapshot); if (pendingSend === pending) pendingSend = null; }
    if (!current(operation)) return cancelled();
    if (result?.error) return showFailure(operation, failure(result.error));
    finish(operation, { phase: 'code-sent', email: normalized, user: null, message: '인증 메일을 보냈습니다. 메일의 승인 버튼을 열어 주세요. 인증 코드가 표시되면 코드로도 로그인할 수 있습니다.', errorCode: '' });
    return { ok: true };
  }

  async function signInWithPassword(email, password) {
    const blocked = preflight(); if (blocked) return blocked;
    if (state.user) return { ok: false, code: 'already_signed_in', message: '이미 로그인되어 있습니다. 계정을 바꾸려면 먼저 로그아웃해 주세요.' };
    const normalized = typeof email === 'string' ? email.trim() : '';
    const invalid = !EMAIL.test(normalized) || normalized.length > 254
      ? { ok: false, code: 'invalid_email', message: '이메일 주소를 확인해 주세요.' }
      : typeof password !== 'string' || !password.length
        ? { ok: false, code: 'invalid_password', message: '비밀번호를 입력해 주세요.' } : null;
    if (invalid) { publish({ message: invalid.message, errorCode: invalid.code }); return invalid; }
    // Existing MEOW passwords may predate the new-password length requirement.
    // Do not trim passwords or apply the creation policy to existing logins.
    const operation = begin('password-login'); operation.expectedEmail = normalized.toLowerCase();
    let response;
    const pending = Promise.resolve().then(async () => {
      const owner = await safeStorage.beginSessionMutation(() => current(operation));
      if (!owner) return { cancelled: true };
      try {
        const result = await auth.signInWithPassword({ email: normalized, password });
        if (owner.discarded) return { storageChanged: true };
        return result;
      } finally { safeStorage.endSessionMutation(owner); password = ''; }
    });
    pendingVerify = pending;
    try { response = await pending; } catch (error) { response = { error }; }
    finally { password = ''; if (pendingVerify === pending) pendingVerify = null; }
    if (!current(operation)) return cancelled();
    if (response?.storageChanged) {
      finish(operation, {}); await refresh(); return { ok: false, code: 'account_changed', message: '이 브라우저의 로그인 계정이 바뀌었습니다. 현재 계정을 확인해 주세요.' };
    }
    if (response?.error) return showFailure(operation, passwordFailure(response.error), { ready: true, phase: 'signed-out', user: null, email: normalized });
    const returned = publicUser(response?.data?.user ?? response?.data?.session?.user);
    if (!returned || returned.email.toLowerCase() !== operation.expectedEmail) {
      return showFailure(operation, passwordFailure(null), { ready: true, phase: 'signed-out', user: null, email: normalized });
    }
    const verified = await validateIdentity({ expectedId: returned.id, operation });
    if (!current(operation)) return cancelled();
    if (!verified.ok && verified.code !== 'cancelled') {
      finish(operation, { phase: 'signed-out', ready: true, user: null, email: normalized, errorCode: verified.code, message: verified.message });
    } else {
      finish(operation, {});
      if (verified.code === 'cancelled') defer(() => { void refresh(); });
    }
    return verified;
  }

  async function setPassword(password) {
    const blocked = preflight(); if (blocked) return blocked;
    if (state.phase !== 'signed-in' || !state.user) return { ok: false, code: 'not_signed_in', message: '이메일 인증이나 기존 비밀번호로 먼저 로그인해 주세요.' };
    if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
      const result = { ok: false, code: 'invalid_password', message: `새 비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상으로 입력해 주세요.` };
      publish({ message: result.message, errorCode: result.code }); return result;
    }
    const expectedId = state.user.id;
    const operation = begin('password-update'); operation.expectedId = expectedId;
    let response;
    const pending = Promise.resolve().then(async () => {
      const owner = await safeStorage.beginSessionMutation(() => current(operation));
      if (!owner) return { cancelled: true };
      try {
        // Pin the request to the original verified actor. SDK updateUser reads
        // whichever session exists after its lock wait, which could be another
        // account signed in by a different tab in the meantime.
        const captured = await auth.getSession();
        if (!current(operation)) return { cancelled: true };
        if (captured?.error) return { error: captured.error };
        const accessToken = captured?.data?.session?.access_token;
        if (typeof accessToken !== 'string' || !accessToken) return { identityChanged: true };
        const before = await auth.getUser(accessToken);
        if (!current(operation)) return { cancelled: true };
        if (before?.error) return { error: before.error };
        if (publicUser(before?.data?.user)?.id !== expectedId) return { identityChanged: true };
        const controller = new AbortController(); profileRequests.add(controller);
        const timeout = setTimeout(() => controller.abort(), 15000);
        let result;
        try {
          const reply = await passwordFetch(config.url + '/auth/v1/user', {
            method: 'PUT', headers: { apikey: config.key, Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }), signal: controller.signal,
          });
          const data = await reply.json().catch(() => null);
          result = reply.ok ? { data: { user: data } } : { error: { code: data?.code ?? data?.error_code, status: reply.status } };
        } finally { clearTimeout(timeout); profileRequests.delete(controller); }
        if (!current(operation)) return { cancelled: true };
        if (owner.discarded) return { identityChanged: true };
        if (result?.error) return { error: result.error };
        if (publicUser(result?.data?.user)?.id !== expectedId) return { identityChanged: true };
        const checked = await auth.getUser();
        if (!current(operation)) return { cancelled: true };
        if (checked?.error) return { error: checked.error };
        const user = publicUser(checked?.data?.user);
        if (user?.id !== expectedId) return { identityChanged: true };
        return { user };
      } finally { safeStorage.endSessionMutation(owner); password = ''; }
    });
    pendingVerify = pending;
    try { response = await pending; } catch (error) { response = { error }; }
    finally { password = ''; if (pendingVerify === pending) pendingVerify = null; }
    if (!current(operation)) return cancelled();
    if (response?.error?.code === 'account_storage_changed') return changedDuringVerification(operation);
    if (response?.identityChanged) return showFailure(operation, { ok: false, code: 'account_changed', message: '로그인 계정이 바뀌었습니다. 현재 계정을 다시 확인해 주세요.' }, { phase: 'error', ready: true, user: null });
    if (!response?.user) return showFailure(operation, passwordFailure(response?.error, true));
    // Keep the existing canonical profile. Setting a password does not change it.
    const user = { ...response.user, ...(state.user?.profile ? { profile: { ...state.user.profile } } : {}) };
    finish(operation, { phase: 'signed-in', ready: true, user, email: user.email, message: '공통 계정 비밀번호를 설정했습니다. 다음부터 이메일과 비밀번호로 로그인할 수 있습니다.', errorCode: '' });
    return { ok: true, user: copyUser(user) };
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
    const pending = Promise.resolve().then(() => guardedSessionMutation(operation, () => auth.verifyOtp({ email, token, type: 'email' })));
    pendingVerify = pending;
    try { result = await pending; } catch (error) { result = { error }; }
    finally { if (pendingVerify === pending) pendingVerify = null; }
    if (!current(operation)) return cancelled();
    if (result?.storageChanged) return changedDuringVerification(operation);
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
    const pending = Promise.resolve().then(() => guardedSessionMutation(operation, () => auth.exchangeCodeForSession(code)));
    pendingVerify = pending;
    try { result = await pending; } catch (error) { result = { error }; }
    finally { if (pendingVerify === pending) pendingVerify = null; }
    if (!current(operation)) return cancelled();
    if (result?.storageChanged) return changedDuringVerification(operation);
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

  async function saveProfile(value) {
    const blocked = preflight(); if (blocked) return blocked;
    if (state.phase !== 'signed-in' || !state.user) return { ok: false, code: 'not_signed_in', message: '먼저 로그인해 주세요.' };
    if (state.profileUnavailable) return profileUnavailable();
    if (!isCompanionProfile(value)) {
      const result = { ok: false, code: 'invalid_profile', message: '고양이와 MBTI를 모두 선택해 주세요.' };
      publish({ message: result.message, errorCode: result.code }); return result;
    }
    const profile = normalizeCompanionProfile(value), expectedId = state.user.id;
    const operation = begin('profile'); operation.expectedId = expectedId;
    const failed = { ok: false, code: 'profile_save_failed', message: '선택한 정보를 저장하지 못했습니다. 연결 상태를 확인하고 다시 눌러 주세요.' };
    let response;
    // Both apps call the same authenticated RPC. Never write app-specific
    // user_metadata or use a local cache as the authoritative member profile.
    const pending = Promise.resolve().then(async () => {
      if (!current(operation)) return { cancelled: true };
      const before = await auth.getUser();
      if (!current(operation)) return { cancelled: true };
      if (before?.error || publicUser(before?.data?.user)?.id !== expectedId) return { identityChanged: true };
      const updated = await profileRpc('save_shared_profile', { expected_actor: expectedId, cat_id: profile.catId, mbti_code: profile.mbti });
      if (!current(operation)) return { cancelled: true };
      const conflict = updated?.error?.message === 'SHARED_PROFILE_FIXED';
      if (updated?.error && !conflict) return { error: true };
      if (!conflict && (updated?.data?.userId !== expectedId || !isCompanionProfile(updated.data))) return { error: true };
      const checked = await auth.getUser();
      if (!current(operation)) return { cancelled: true };
      const user = checked?.error ? null : publicUser(checked?.data?.user);
      if (user?.id !== expectedId) return { identityChanged: true };
      const saved = await readProfile(expectedId);
      if (!current(operation)) return { cancelled: true };
      if (!saved || (!conflict && (saved.catId !== profile.catId || saved.mbti !== profile.mbti))) return { error: true };
      user.profile = saved;
      return { user, conflict };
    });
    pendingVerify = pending;
    try { response = await pending; } catch { response = { error: true }; }
    finally { if (pendingVerify === pending) pendingVerify = null; }
    if (!current(operation)) return cancelled();
    if (response?.identityChanged) return showFailure(operation, { ok: false, code: 'account_changed', message: '로그인 계정이 바뀌었습니다. 다시 로그인해 주세요.' }, { phase: 'error', ready: true, user: null });
    if (!response?.user) return showFailure(operation, failed);
    finish(operation, { phase: 'signed-in', ready: true, user: response.user, email: response.user.email, profileUnavailable: false, message: response.conflict ? '이미 확정된 공통 회원 정보를 불러왔습니다.' : '두 앱이 함께 사용할 고양이와 MBTI를 저장했습니다.', errorCode: '' });
    return { ok: true, user: copyUser(response.user) };
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
    if (disposed) return teardown;
    disposed = true; ++generation; ++validation; active = null;
    subscription?.unsubscribe();
    safeStorage.dispose();
    for (const controller of profileRequests) controller.abort();
    profileRequests.clear();
    for (const timer of timers) clearTimeout(timer);
    for (const resolve of readyWaiters) resolve(cancelled());
    readyWaiters.clear();
    timers.clear(); listeners.clear();
    // Teardown must not sign the member out. The SDK owns a visibility
    // listener, refresh timer and BroadcastChannel beyond our subscription.
    try { teardown = Promise.resolve(auth.dispose?.()).catch(() => {}); }
    catch { teardown = Promise.resolve(); }
    return teardown;
  }
  return { start, requestCode, signInWithPassword, setPassword, verifyCode, completeLink, saveProfile, changeEmail, signOut, refresh, getState, subscribe, dispose };
}
