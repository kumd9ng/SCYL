import { validateSharedAccountConfig } from './shared-account.mjs';

const STORAGE_KEY = 'scyl-auth-v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN = /^[A-Za-z0-9._~-]+$/;
const TYPES = new Set(['magiclink', 'signup', 'email']);
const HASH_KEYS = new Set(['access_token', 'refresh_token', 'type', 'token_type', 'expires_in', 'expires_at', 'sb']);
const FORBIDDEN_QUERY = new Set(['access_token', 'refresh_token', 'token', 'token_hash', 'bearer', 'authorization', 'provider_token', 'provider_refresh_token']);
const MESSAGES = {
  invalid_email_link: '인증 링크 형식이 올바르지 않습니다. 받은 메일의 승인 버튼을 다시 확인해 주세요.',
  verification_failed: '이 인증 링크의 계정을 확인하지 못했습니다. 링크가 만료되었거나 연결이 끊겼을 수 있습니다.',
  confirmation_required: '확인된 이메일을 살펴본 뒤 로그인 확인 버튼을 눌러 주세요.',
  different_account: '이미 다른 계정으로 로그인되어 있습니다. 현재 계정에서 로그아웃한 뒤 이 링크를 다시 열어 주세요.',
  account_changed: '인증 중 다른 창에서 로그인 상태가 바뀌었습니다. 현재 계정을 확인한 뒤 다시 시도해 주세요.',
  token_pair_mismatch: '이 링크의 인증 정보를 같은 계정으로 확인하지 못했습니다. 로그인 정보는 저장하지 않았습니다.',
  session_save_failed: '로그인 정보를 저장하지 못했습니다. 브라우저의 저장 공간 설정을 확인해 주세요.',
  cancelled: '이 인증 링크의 로그인을 취소했습니다.',
};
const fail = code => ({ ok: false, code, message: MESSAGES[code] ?? MESSAGES.verification_failed });
const reject = code => { const error = new Error(code); error.code = code; throw error; };

function safeTokens(value) {
  if (!value || typeof value !== 'object') return null;
  const access = value.access_token, refresh = value.refresh_token;
  if (typeof access !== 'string' || access.length < 8 || access.length > 8192 || !TOKEN.test(access)) return null;
  if (typeof refresh !== 'string' || refresh.length < 8 || refresh.length > 2048 || !TOKEN.test(refresh)) return null;
  return { access_token: access, refresh_token: refresh };
}

function safeUser(value) {
  if (!value || !UUID.test(value.id ?? '') || value.is_anonymous === true || typeof value.email !== 'string' || !EMAIL.test(value.email)) return null;
  return { id: value.id, email: value.email };
}

/**
 * Parse only a Supabase email-link fragment. The returned tokens are private
 * handoff data, never UI state. The caller must immediately scrub the URL.
 */
export function parseEmailLinkTokens(input) {
  if (typeof input !== 'string' || input.length > 16384) return fail('invalid_email_link');
  let link;
  try { link = new URL(input); } catch { return fail('invalid_email_link'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(link.hostname);
  if ((link.protocol !== 'https:' && !(local && link.protocol === 'http:')) || link.username || link.password) return fail('invalid_email_link');
  const fragment = new URLSearchParams(link.hash.slice(1));
  for (const params of [link.searchParams, fragment]) {
    const seen = new Set();
    for (const [rawName] of params) {
      const name = rawName.toLowerCase();
      if (seen.has(name) || name === 'code' || name === 'error' || name.startsWith('error_')) return fail('invalid_email_link');
      seen.add(name);
      if (params === link.searchParams && (FORBIDDEN_QUERY.has(name) || name === 'type')) return fail('invalid_email_link');
      if (params === fragment && (!HASH_KEYS.has(name) || name !== rawName)) return fail('invalid_email_link');
    }
  }
  const type = fragment.get('type');
  const tokens = safeTokens({ access_token: fragment.get('access_token'), refresh_token: fragment.get('refresh_token') });
  if (!tokens || !TYPES.has(type)) return fail('invalid_email_link');
  // Supabase's AccessTokenResponse.AsRedirectURL adds the empty `sb=` marker
  // to successful implicit redirects. It is metadata, never proof of identity.
  if (fragment.has('sb') && fragment.get('sb') !== '') return fail('invalid_email_link');
  if (fragment.has('token_type') && fragment.get('token_type')?.toLowerCase() !== 'bearer') return fail('invalid_email_link');
  for (const key of ['expires_in', 'expires_at']) {
    if (fragment.has(key) && !/^\d{1,12}$/.test(fragment.get(key))) return fail('invalid_email_link');
  }
  return { ok: true, tokens, type };
}

/**
 * An email link is first verified without persistence. Only accept(), called
 * after the visitor confirms the displayed account, can commit a SCYL session.
 * All public results contain only the verified ID/email and fixed error text.
 */
export function createEmailLinkSession({ tokens, url, key, createClient, storage } = {}) {
  const config = validateSharedAccountConfig({ url, key });
  if (typeof createClient !== 'function') throw new TypeError('인증 클라이언트 연결을 확인해 주세요.');
  let credentials = safeTokens(tokens);
  let state = { phase: 'idle', user: null, errorCode: '', message: '' };
  let previewClient = null, previewPromise = null, acceptPromise = null;
  let cancelled = false, disposed = false, expectedUser = null, committed = false;
  let foreignChange = false, transaction = null;
  const getState = () => ({ ...state, user: state.user ? { ...state.user } : null });
  const live = () => !cancelled && !disposed;
  const ensureLive = () => { if (!live()) reject('cancelled'); };
  const change = patch => { if (!disposed) state = { ...state, ...patch }; };
  const outcome = error => {
    const result = fail(!live() ? 'cancelled' : Object.hasOwn(MESSAGES, error?.code) ? error.code : 'verification_failed');
    if (live()) change({ phase: 'error', errorCode: result.code, message: result.message, user: null });
    return result;
  };
  const storageChanged = event => {
    if (!committed && transaction && (event.key === STORAGE_KEY || event.key === null)) foreignChange = true;
  };
  globalThis.window?.addEventListener?.('storage', storageChanged);

  function getPreviewClient() {
    if (!previewClient) previewClient = createClient(config.url, config.key, { auth: {
      storageKey: 'scyl-email-link-preview', persistSession: false,
      autoRefreshToken: false, detectSessionInUrl: false, flowType: 'implicit',
    } });
    return previewClient;
  }

  function preview() {
    if (!live()) return Promise.resolve(fail('cancelled'));
    if (expectedUser && state.phase !== 'error') return Promise.resolve({ ok: true, user: { ...expectedUser } });
    if (previewPromise) return previewPromise;
    if (!credentials) return Promise.resolve(outcome({ code: 'invalid_email_link' }));
    change({ phase: 'checking', user: null, errorCode: '', message: '' });
    previewPromise = (async () => {
      try {
        const result = await getPreviewClient().auth.getUser(credentials.access_token);
        ensureLive();
        const user = !result.error && safeUser(result.data?.user);
        if (!user) reject('verification_failed');
        expectedUser = user;
        change({ phase: 'confirmation', user, errorCode: '', message: '' });
        return { ok: true, user: { ...user } };
      } catch (error) { return outcome(error); }
      finally { previewPromise = null; }
    })();
    return previewPromise;
  }

  function persistentStorage() {
    if (storage) return storage;
    try { return globalThis.localStorage; } catch { return null; }
  }

  function readStoredSession(base) {
    const value = base.getItem(STORAGE_KEY);
    if (value !== null && typeof value !== 'string') reject('session_save_failed');
    return value;
  }

  function assertUnchanged() {
    ensureLive();
    if (foreignChange || !transaction || readStoredSession(transaction.base) !== transaction.baseline) reject('account_changed');
    ensureLive();
    if (foreignChange) reject('account_changed');
  }

  function accept() {
    if (!live()) return Promise.resolve(fail('cancelled'));
    if (committed) return Promise.resolve({ ok: true, user: { ...expectedUser } });
    if (acceptPromise) return acceptPromise;
    if (state.phase !== 'confirmation' || !expectedUser || !credentials) return Promise.resolve(fail('confirmation_required'));
    change({ phase: 'accepting', errorCode: '', message: '' });
    acceptPromise = (async () => {
      try {
        const base = persistentStorage();
        if (!base || !['getItem', 'setItem', 'removeItem'].every(name => typeof base[name] === 'function')) reject('session_save_failed');
        // This callback uses synchronous browser localStorage. A custom async
        // adapter is deliberately unsupported: no await may split compare/write.
        transaction = { base, baseline: readStoredSession(base) };
        assertUnchanged();
        if (transaction.baseline !== null) {
          let existing;
          try { existing = JSON.parse(transaction.baseline); } catch { reject('verification_failed'); }
          if (!safeTokens(existing)) reject('verification_failed');
          // Do not initialize a persistent SDK or call its getSession(): even
          // with auto-refresh disabled that could rotate an existing account's
          // expired refresh token before we know whose account it is.
          const checked = await getPreviewClient().auth.getUser(existing.access_token);
          assertUnchanged();
          const currentUser = !checked.error && safeUser(checked.data?.user);
          if (!currentUser) reject('verification_failed');
          if (currentUser.id !== expectedUser.id) reject('different_account');
        }

        // Access and refresh credentials must be proven to belong to the same
        // account. Never persist an unchecked refresh token from a URL.
        const refreshed = await getPreviewClient().auth.refreshSession({ refresh_token: credentials.refresh_token });
        assertUnchanged();
        const freshTokens = !refreshed.error && safeTokens(refreshed.data?.session);
        const refreshedUser = !refreshed.error && safeUser(refreshed.data?.user);
        const sessionUser = !refreshed.error && safeUser(refreshed.data?.session?.user);
        if (!freshTokens || refreshedUser?.id !== expectedUser.id || sessionUser?.id !== expectedUser.id) reject('token_pair_mismatch');
        const freshIdentity = await getPreviewClient().auth.getUser(freshTokens.access_token);
        assertUnchanged();
        if (freshIdentity.error || safeUser(freshIdentity.data?.user)?.id !== expectedUser.id) reject('token_pair_mismatch');

        // Keep SDK normalization and its SIGNED_IN event in a non-persistent
        // client. Nothing is broadcast to live scyl-auth-v1 tabs before consent
        // and every server identity check have completed.
        const stored = await getPreviewClient().auth.setSession(freshTokens);
        assertUnchanged();
        if (stored.error || safeUser(stored.data?.user)?.id !== expectedUser.id) reject('verification_failed');
        const storedTokens = safeTokens(stored.data?.session);
        if (!storedTokens || safeUser(stored.data?.session?.user)?.id !== expectedUser.id) reject('verification_failed');
        const finalIdentity = await getPreviewClient().auth.getUser();
        assertUnchanged();
        const finalUser = !finalIdentity.error && safeUser(finalIdentity.data?.user);
        if (finalUser?.id !== expectedUser.id) reject('verification_failed');

        // Save the SDK-produced Session JSON under the normal SDK key. The next
        // page's createSharedAccount client restores it through the usual SDK
        // and server verification. Compare and write are synchronous here.
        const sessionValue = JSON.stringify(stored.data.session);
        assertUnchanged();
        try {
          const result = base.setItem(STORAGE_KEY, sessionValue);
          if (result !== undefined) reject('session_save_failed');
        } catch {
          // Some adapters may throw after writing. Restore only our own value,
          // never a replacement belonging to a different tab or account.
          try {
            if (readStoredSession(base) === sessionValue) {
              if (transaction.baseline === null) base.removeItem(STORAGE_KEY);
              else base.setItem(STORAGE_KEY, transaction.baseline);
            }
          } catch {}
          reject('session_save_failed');
        }
        if (readStoredSession(base) !== sessionValue) reject('account_changed');
        committed = true; credentials = null;
        expectedUser = finalUser;
        change({ phase: 'authenticated', user: finalUser, errorCode: '', message: '' });
        return { ok: true, user: { ...finalUser } };
      } catch (error) {
        return outcome(error);
      } finally {
        credentials = null;
        try {
          if (previewClient?.auth.dispose) await previewClient.auth.dispose();
          else await previewClient?.auth.stopAutoRefresh?.();
        } catch {}
        acceptPromise = null;
      }
    })();
    return acceptPromise;
  }

  function cancel() {
    if (committed) return { ok: true, user: { ...expectedUser } };
    cancelled = true; credentials = null;
    change({ phase: 'cancelled', user: null, errorCode: 'cancelled', message: MESSAGES.cancelled });
    return fail('cancelled');
  }
  function dispose() {
    if (!committed) cancel();
    disposed = true; credentials = null;
    globalThis.window?.removeEventListener?.('storage', storageChanged);
    try { Promise.resolve(previewClient?.auth.dispose?.()).catch(() => {}); } catch {}
  }
  return { preview, accept, cancel, dispose, getState };
}
