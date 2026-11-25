import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedAccount, validateSharedAccountConfig } from '../lib/shared-account.mjs';

const URL = 'https://test-project.supabase.co';
const KEY = 'sb_publishable_only_synthetic_test_credential';
const A = { id: '00000000-0000-4000-8000-000000000001', email: 'one@example.test' };
const B = { id: '00000000-0000-4000-8000-000000000002', email: 'two@example.test' };
const missing = () => ({ data: { user: null }, error: { name: 'AuthSessionMissingError' } });
const identified = user => ({ data: { user }, error: null });
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const jwt = payload => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'synthetic'].join('.');

function fixture(overrides = {}) {
  let listener = null, user = null, disconnected = false;
  const calls = [], clientOptions = [], pending = [];
  const auth = {
    onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() { disconnected = true; listener = null; } } } }; },
    async getUser() { calls.push(['getUser']); return user ? identified(user) : missing(); },
    async signInWithOtp(value) { calls.push(['request', value]); return { data: {}, error: null }; },
    async verifyOtp(value) { calls.push(['verify', value]); user = A; listener?.('SIGNED_IN', { user: A, access_token: 'must-not-leak' }); return { data: { user: A, session: { access_token: 'must-not-leak', user: A } }, error: null }; },
    async signOut(value) { calls.push(['signOut', value]); user = null; listener?.('SIGNED_OUT', null); return { error: null }; },
    ...overrides,
  };
  const account = createSharedAccount({ url: URL, key: KEY, createClient(...args) { clientOptions.push(args); return { auth }; } });
  return {
    account, auth, calls, clientOptions, pending,
    setUser(value) { user = value; },
    emit(event, session) { listener?.(event, session); },
    get disconnected() { return disconnected; },
  };
}

test('configuration accepts only HTTPS origins and public anon/publishable keys', () => {
  assert.deepEqual(validateSharedAccountConfig({ url: URL + '/', key: KEY }), { url: URL, key: KEY });
  const anon = jwt({ role: 'anon', ref: 'test-project' });
  assert.equal(validateSharedAccountConfig({ url: URL, key: anon }).key, anon);
  for (const key of ['sb_secret_never_use_this', jwt({ role: 'service_role' }), jwt({ role: 'authenticated' }), jwt({ role: 'anon', ref: 'another-project' }), 'not-a-public-key']) {
    assert.throws(() => validateSharedAccountConfig({ url: URL, key }), error => error.code === 'invalid_auth_config' && !error.message.includes(key));
  }
  for (const url of ['http://test-project.supabase.co', URL + '/auth', URL + '?token=private', URL + '#secret', 'https://user:password@test-project.supabase.co']) {
    assert.throws(() => validateSharedAccountConfig({ url, key: KEY }));
  }
});

test('SCYL owns a separate persistent session and never consumes URL credentials', () => {
  const f = fixture();
  assert.equal(f.clientOptions[0][2].auth.storageKey, 'scyl-auth-v1');
  assert.equal(f.clientOptions[0][2].auth.persistSession, true);
  assert.equal(f.clientOptions[0][2].auth.detectSessionInUrl, false);
  assert.equal(f.clientOptions[0][2].auth.flowType, 'pkce');
  f.account.dispose();
});

test('starting without a session is ready and sends no email', async () => {
  const f = fixture();
  assert.equal((await f.account.start()).ok, true);
  assert.equal(f.account.getState().phase, 'signed-out');
  assert.equal(f.account.getState().ready, true);
  assert.deepEqual(f.calls, [['getUser']]);
  f.account.dispose();
});

test('restored identity comes from the server and exports no session or private metadata', async () => {
  const f = fixture(); f.setUser({ ...A, access_token: 'private', app_metadata: { secret: 'private' } });
  await f.account.start();
  assert.deepEqual(f.account.getState().user, A);
  assert.equal(JSON.stringify(f.account.getState()).includes('private'), false);
  const copy = f.account.getState(); copy.user.id = B.id;
  assert.equal(f.account.getState().user.id, A.id);
  f.account.dispose();
});

test('auth events cannot authenticate a cached identity before server verification', async () => {
  const held = deferred(), f = fixture(); await f.account.start();
  f.auth.getUser = () => held.promise;
  f.emit('SIGNED_IN', { user: A });
  assert.equal(f.account.getState().user, null);
  assert.equal(f.account.getState().ready, false);
  await tick(); held.resolve(identified(A)); await tick();
  assert.equal(f.account.getState().phase, 'signed-in');
  f.account.dispose();
});

test('a failed server identity check closes access instead of trusting the stored user', async () => {
  const f = fixture({ getUser: async () => ({ data: { user: A }, error: { code: 'bad_jwt', message: 'SECRET_ACCESS_TOKEN' } }) });
  assert.equal((await f.account.start()).ok, false);
  assert.equal(f.account.getState().user, null);
  assert.equal(f.account.getState().phase, 'error');
  assert.equal(JSON.stringify(f.account.getState()).includes('SECRET_ACCESS_TOKEN'), false);
  f.account.dispose();
});

test('duplicate code requests are blocked and the shared email OTP signup API is used', async () => {
  const held = deferred(), f = fixture(); await f.account.start();
  f.auth.signInWithOtp = value => { f.calls.push(['request', value]); return held.promise; };
  const first = f.account.requestCode(' one@example.test ');
  assert.equal((await f.account.requestCode(B.email)).code, 'busy');
  assert.deepEqual(f.calls.find(call => call[0] === 'request')[1], { email: A.email, options: { shouldCreateUser: true } });
  held.resolve({ error: null }); assert.equal((await first).ok, true);
  assert.equal(f.account.getState().phase, 'code-sent');
  assert.equal(f.account.getState().email, A.email);
  f.account.dispose();
});

test('invalid email and code do not issue network mutations', async () => {
  const f = fixture(); await f.account.start();
  assert.equal((await f.account.requestCode('broken')).code, 'invalid_email');
  assert.equal(f.calls.some(call => call[0] === 'request'), false);
  await f.account.requestCode(A.email);
  for (const code of ['12345', '1e2345', '<script>', '123456789', 123456]) assert.equal((await f.account.verifyCode(code)).code, 'invalid_code');
  assert.equal(f.calls.some(call => call[0] === 'verify'), false);
  f.account.dispose();
});

test('mail configuration and rate limit errors are actionable Korean messages without raw errors', async () => {
  const f = fixture(); await f.account.start();
  f.auth.signInWithOtp = async () => ({ error: { code: 'email_address_not_authorized', message: 'SECRET_DATA' } });
  const denied = await f.account.requestCode(A.email);
  assert.equal(denied.code, 'email_address_not_authorized');
  assert.match(denied.message, /발송 설정/);
  f.auth.signInWithOtp = async () => ({ error: { status: 429, message: 'SECRET_DATA' } });
  assert.equal((await f.account.requestCode(A.email)).code, 'over_request_rate_limit');
  assert.equal(JSON.stringify(f.account.getState()).includes('SECRET_DATA'), false);
  f.account.dispose();
});

test('expired OTP keeps the code screen and never accepts a user', async () => {
  const f = fixture({ verifyOtp: async () => ({ error: { code: 'otp_expired' } }) });
  await f.account.start(); await f.account.requestCode(A.email);
  assert.equal((await f.account.verifyCode('123456')).code, 'otp_expired');
  assert.equal(f.account.getState().phase, 'code-sent');
  assert.equal(f.account.getState().busy, false);
  assert.equal(f.account.getState().user, null);
  f.account.dispose();
});

test('successful OTP uses the same server member UUID and still verifies getUser', async () => {
  const f = fixture(); await f.account.start(); await f.account.requestCode(A.email);
  const result = await f.account.verifyCode('12345678');
  assert.equal(result.ok, true); assert.deepEqual(result.user, A);
  assert.deepEqual(f.calls.find(call => call[0] === 'verify')[1], { email: A.email, token: '12345678', type: 'email' });
  assert.equal(f.calls.filter(call => call[0] === 'getUser').length, 2);
  assert.equal(f.account.getState().phase, 'signed-in');
  assert.equal(f.account.getState().busy, false);
  assert.equal(JSON.stringify(result).includes('must-not-leak'), false);
  f.account.dispose();
});

test('a successful verify response cannot bypass a failed getUser or different user', async () => {
  for (const returned of [{ data: { user: A }, error: { status: 503 } }, identified(B), identified({ ...A, is_anonymous: true })]) {
    const f = fixture(); await f.account.start(); await f.account.requestCode(A.email);
    f.auth.getUser = async () => returned;
    assert.equal((await f.account.verifyCode('123456')).ok, false);
    assert.equal(f.account.getState().user, null);
    assert.equal(f.account.getState().phase, 'code-sent');
    f.account.dispose();
  }
});

test('late identity from an old account cannot replace a newly verified account', async () => {
  const a = deferred(), b = deferred(), f = fixture(); await f.account.start();
  f.auth.getUser = () => a.promise; f.emit('SIGNED_IN', { user: A }); await tick();
  f.auth.getUser = () => b.promise; f.emit('SIGNED_IN', { user: B }); await tick();
  b.resolve(identified(B)); await tick(); a.resolve(identified(A)); await tick();
  assert.deepEqual(f.account.getState().user, B);
  f.account.dispose();
});

test('logout waits for a pending OTP mutation and stops its late sign-in from reopening access', async () => {
  const held = deferred(), f = fixture(); await f.account.start(); await f.account.requestCode(A.email);
  f.auth.verifyOtp = async () => { await held.promise; f.setUser(A); f.emit('SIGNED_IN', { user: A }); return { data: { user: A } }; };
  const verifying = f.account.verifyCode('123456'); await Promise.resolve();
  const logout = f.account.signOut();
  assert.equal(f.account.getState().user, null);
  assert.equal((await f.account.requestCode(B.email)).code, 'busy');
  assert.equal(f.calls.some(call => call[0] === 'signOut'), false);
  held.resolve();
  assert.equal((await verifying).code, 'cancelled');
  assert.equal((await logout).ok, true); await tick();
  assert.equal(f.account.getState().phase, 'signed-out');
  assert.deepEqual(f.calls.find(call => call[0] === 'signOut')[1], { scope: 'local' });
  f.account.dispose();
});

test('logout invalidates an in-flight identity refresh', async () => {
  const held = deferred(), f = fixture(); await f.account.start();
  f.auth.getUser = () => held.promise;
  const refreshing = f.account.refresh(); await f.account.signOut(); held.resolve(identified(A));
  assert.equal((await refreshing).code, 'cancelled');
  assert.equal(f.account.getState().user, null);
  assert.equal(f.account.getState().phase, 'signed-out');
  f.account.dispose();
});

test('failed logout remains closed and can be retried without switching to global scope', async () => {
  const f = fixture(); f.setUser(A); await f.account.start();
  const original = f.auth.signOut;
  f.auth.signOut = async value => { assert.deepEqual(value, { scope: 'local' }); throw new Error('SECRET'); };
  assert.equal((await f.account.signOut()).ok, false);
  assert.equal(f.account.getState().phase, 'error'); assert.equal(f.account.getState().user, null);
  f.auth.signOut = original;
  assert.equal((await f.account.signOut()).ok, true);
  f.account.dispose();
});

test('changing email resets the previous challenge but cannot interrupt an SDK verification mutation', async () => {
  const held = deferred(), f = fixture(); await f.account.start(); await f.account.requestCode(A.email);
  assert.equal(f.account.changeEmail().ok, true);
  assert.equal(f.account.getState().email, '');
  assert.equal((await f.account.verifyCode('123456')).code, 'code_not_requested');
  await f.account.requestCode(B.email);
  f.auth.verifyOtp = () => held.promise;
  const pending = f.account.verifyCode('123456');
  assert.equal(f.account.changeEmail().code, 'busy');
  held.resolve({ error: { code: 'otp_expired' } }); await pending;
  assert.equal(f.account.changeEmail().ok, true);
  f.account.dispose();
});

test('dispose unsubscribes and late network responses cannot notify or restore a user', async () => {
  const held = deferred(), f = fixture(); await f.account.start();
  let notifications = 0;
  f.account.subscribe(() => { notifications++; });
  f.auth.getUser = () => held.promise;
  const pending = f.account.refresh(), before = notifications;
  f.account.dispose(); held.resolve(identified(A));
  assert.equal((await pending).code, 'cancelled');
  assert.equal(f.disconnected, true);
  assert.equal(notifications, before);
  assert.equal(f.account.getState().user, null);
  assert.equal((await f.account.requestCode(A.email)).code, 'disposed');
});

test('requestCode includes only the explicitly configured HTTPS mail return URL', async () => {
  const requests = [], redirectTo = 'https://scyl.example.test/auth.html?target=native';
  const f = fixture();
  const account = createSharedAccount({ url: URL, key: KEY, redirectTo, createClient() { return { auth: { ...f.auth, async signInWithOtp(value) { requests.push(value); return { error: null }; } } }; } });
  await account.start(); await account.requestCode(A.email);
  assert.deepEqual(requests[0].options, { shouldCreateUser: true, emailRedirectTo: redirectTo });
  for (const redirect of ['http://example.test/auth', 'https://user:pass@example.test/auth', 'https://example.test/auth#token=private', 'javascript:alert(1)']) {
    assert.throws(() => validateSharedAccountConfig({ url: URL, key: KEY, redirectTo: redirect }));
  }
  account.dispose(); f.account.dispose();
});

test('PKCE authorization link completion verifies the returned user with the server', async () => {
  const f = fixture(); await f.account.start();
  const code = '00000000-0000-4000-8000-000000000099';
  f.auth.exchangeCodeForSession = async value => {
    assert.equal(value, code); f.setUser(A); f.emit('SIGNED_IN', { user: A });
    return { data: { user: A, session: { access_token: 'SECRET', user: A } } };
  };
  const result = await f.account.completeLink(code);
  assert.equal(result.ok, true); assert.deepEqual(result.user, A);
  assert.equal(f.account.getState().phase, 'signed-in');
  assert.equal(f.calls.filter(call => call[0] === 'getUser').length, 2);
  assert.equal(JSON.stringify(result).includes('SECRET'), false);
  f.account.dispose();
});

test('a replayed or verifier-less link fails closed and cannot use a session from its response', async () => {
  const f = fixture(); await f.account.start();
  f.auth.exchangeCodeForSession = async () => ({ data: { user: A }, error: { code: 'flow_state_not_found', message: 'SECRET' } });
  const result = await f.account.completeLink('00000000-0000-4000-8000-000000000099');
  assert.equal(result.ok, false); assert.equal(result.code, 'flow_state_not_found');
  assert.match(result.message, /요청한 브라우저나 앱/);
  assert.equal(f.account.getState().user, null);
  assert.equal(f.calls.filter(call => call[0] === 'getUser').length, 1);
  f.account.dispose();
});

test('link handling rejects implicit credentials or malformed codes without SDK exchange', async () => {
  const f = fixture(); await f.account.start();
  let exchanges = 0;
  f.auth.exchangeCodeForSession = async () => { exchanges++; return {}; };
  for (const code of ['access_token=secret', '#refresh_token=secret', 'too-short', 'a'.repeat(513), null, { code: 'secret' }]) {
    assert.equal((await f.account.completeLink(code)).code, 'invalid_link');
  }
  assert.equal(exchanges, 0);
  f.account.dispose();
});

test('logout during PKCE exchange waits and revokes only the resulting SCYL session', async () => {
  const held = deferred(), f = fixture(); await f.account.start();
  f.auth.exchangeCodeForSession = async () => { await held.promise; f.setUser(A); f.emit('SIGNED_IN', { user: A }); return { data: { user: A } }; };
  const completing = f.account.completeLink('00000000-0000-4000-8000-000000000099'); await Promise.resolve();
  const logout = f.account.signOut(); held.resolve();
  assert.equal((await completing).code, 'cancelled'); assert.equal((await logout).ok, true); await tick();
  assert.equal(f.account.getState().phase, 'signed-out');
  assert.deepEqual(f.calls.find(call => call[0] === 'signOut')[1], { scope: 'local' });
  f.account.dispose();
});

test('an initial null-session event settles start as signed-out despite the stale initial check', async () => {
  const held = deferred(), f = fixture({ getUser: () => held.promise });
  const starting = f.account.start();
  f.emit('INITIAL_SESSION', null); held.resolve(missing());
  assert.equal((await starting).ok, true);
  assert.equal(f.account.getState().ready, true);
  assert.equal(f.account.getState().phase, 'signed-out');
  f.account.dispose();
});

test('failed logout ignores later refresh events until local logout succeeds', async () => {
  const f = fixture(); f.setUser(A); await f.account.start();
  f.auth.signOut = async () => ({ error: { status: 503 } });
  assert.equal((await f.account.signOut()).ok, false);
  f.emit('TOKEN_REFRESHED', { user: A }); await tick();
  assert.equal(f.account.getState().user, null);
  assert.equal((await f.account.refresh()).code, 'cancelled');
  f.account.dispose();
});
