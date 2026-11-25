import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmailLinkSession, parseEmailLinkTokens } from '../lib/email-link-session.mjs';
import { createSharedAccount } from '../lib/shared-account.mjs';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const URL = 'https://test-project.supabase.co';
const KEY = 'sb_publishable_only_synthetic_test_credential';
const A = { id: '00000000-0000-4000-8000-000000000001', email: 'one@example.test' };
const B = { id: '00000000-0000-4000-8000-000000000002', email: 'two@example.test' };
const INPUT = { access_token: 'incoming-access-secret', refresh_token: 'incoming-refresh-secret' };
const FRESH = { access_token: 'rotated-access-secret', refresh_token: 'rotated-refresh-secret' };
const STORE_KEY = 'scyl-auth-v1';
const identified = user => ({ data: { user }, error: null });
const session = (user, tokens = FRESH) => ({ data: { user, session: { ...tokens, user } }, error: null });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const link = (extra = '', query = '', origin = 'https://scyl.example.test/auth.html') => `${origin}${query}#access_token=${INPUT.access_token}&refresh_token=${INPUT.refresh_token}&type=magiclink${extra}`;

function fixture({ existing = null, previewUser = A, refreshUser = A } = {}) {
  const values = new Map(existing ? [[STORE_KEY, JSON.stringify({ user: existing, access_token: 'existing-access-secret', refresh_token: 'existing-refresh-secret' })]] : []);
  const calls = [], options = [];
  const storage = {
    getItem: name => values.get(name) ?? null,
    setItem(name, value) { calls.push(['write', name]); values.set(name, value); },
    removeItem(name) { calls.push(['remove', name]); values.delete(name); },
  };
  const previewAuth = {
    async getUser(token) {
      if (token === undefined) { calls.push(['persistentUser']); return persistentAuth.getUser(); }
      calls.push(['previewUser', token]);
      return identified(token === 'existing-access-secret' ? existing : previewUser);
    },
    async refreshSession(value) { calls.push(['refresh', value]); return session(refreshUser); },
    async setSession(value) { return persistentAuth.setSession(value); },
    async stopAutoRefresh() {},
  };
  const persistentAuth = {
    async getUser() { return identified(A); },
    async setSession(value) {
      calls.push(['setSession', value]);
      return session(A, value);
    },
    async stopAutoRefresh() {},
  };
  const machine = createEmailLinkSession({ tokens: INPUT, url: URL, key: KEY, storage, createClient(...args) {
    options.push(args[2]);
    assert.equal(args[2].auth.persistSession, false, 'callback SDK must never read/broadcast a persisted live SCYL session');
    return { auth: previewAuth };
  } });
  return { machine, storage, values, calls, options, previewAuth, persistentAuth };
}

test('email link parser accepts only fragment credentials with supported email types', () => {
  for (const type of ['magiclink', 'signup', 'email']) {
    const parsed = parseEmailLinkTokens(link('&token_type=bearer&expires_in=3600&expires_at=1900000000').replace('type=magiclink', `type=${type}`));
    assert.deepEqual(parsed, { ok: true, tokens: INPUT, type });
  }
  assert.equal(parseEmailLinkTokens(link('', '?target=native')).ok, true);
  for (const origin of ['http://localhost:8080/auth.html', 'http://127.0.0.1/auth.html', 'http://[::1]/auth.html']) {
    assert.equal(parseEmailLinkTokens(link('', '', origin)).ok, true);
  }
});

test('Supabase 서버의 빈 sb 표식이 포함된 공식 성공 콜백을 허용한다', () => {
  // Go's url.Values.Encode sorts these fields; mirror the server response,
  // including its otherwise easy-to-miss empty Supabase identifier.
  for (const type of ['magiclink', 'signup', 'email']) {
    const fragment = new URLSearchParams({ access_token: INPUT.access_token, expires_at: '1900000000',
      expires_in: '3600', refresh_token: INPUT.refresh_token, sb: '', token_type: 'bearer', type });
    const result = parseEmailLinkTokens(`https://scyl.example.test/auth.html#${fragment}`);
    assert.deepEqual(result, { ok: true, tokens: INPUT, type });
    assert.equal('sb' in result.tokens, false);
  }
});

test('sb 표식만으로는 인증되지 않으며 중복·비정상 표식과 섞인 자격정보는 거부한다', () => {
  for (const input of ['https://scyl.example.test/auth.html#sb=', link('&sb=&sb='), link('&sb=trusted'),
    link('&SB='), link('&sb=&access_token=duplicate'), link('&sb=', '?code=another-code'), link('&sb=&provider_token=private')]) {
    assert.equal(parseEmailLinkTokens(input).code, 'invalid_email_link');
  }
});

test('parser rejects insecure origins, query credentials, mixed flows, duplicate parameters and oversized input', () => {
  const rejected = [
    link('', '', 'http://scyl.example.test/auth.html'), link('', '', 'https://user:password@scyl.example.test/auth.html'),
    link('', '?access_token=other'), link('', '?refresh_token=other'), link('', '?AUTHORIZATION=other'), link('', '?token_hash=other'),
    link('&code=other'), link('', '?code=other'), link('&error=access_denied'), link('', '?error_description=no'),
    link().replace('type=magiclink', 'type=recovery'), link('&type=signup'), link('&access_token=duplicate'),
    link('&ACCESS_TOKEN=duplicate'), link('', '?target=web&target=native'), link('&provider_token=private'),
    link('&token_type=other'), link('&expires_in=forever'), link('&unknown=value'),
    link().replace(INPUT.refresh_token, ''), link().replace(INPUT.access_token, 'bad%20token'),
    link().replace(INPUT.access_token, 'a'.repeat(8193)), 'x'.repeat(16385),
  ];
  for (const input of rejected) {
    const result = parseEmailLinkTokens(input);
    assert.equal(result.ok, false, `expected rejection for case ${rejected.indexOf(input)}`);
    assert.equal(result.code, 'invalid_email_link');
    assert.equal(JSON.stringify(result).includes(INPUT.access_token), false);
  }
});

test('preview verifies the access token without saving a session or redeeming the refresh token', async () => {
  const f = fixture();
  assert.deepEqual(await f.machine.preview(), { ok: true, user: A });
  assert.deepEqual(f.calls, [['previewUser', INPUT.access_token]]);
  assert.equal(f.options.length, 1);
  assert.equal(f.options[0].auth.persistSession, false);
  assert.equal(f.options[0].auth.autoRefreshToken, false);
  assert.equal(f.options[0].auth.detectSessionInUrl, false);
  assert.equal(f.values.size, 0);
  assert.equal(f.machine.getState().phase, 'confirmation');
  assert.equal(JSON.stringify(f.machine.getState()).includes('secret'), false);
  f.machine.getState().user.email = 'changed@example.test';
  assert.equal(f.machine.getState().user.email, A.email);
  f.machine.dispose();
});

test('accept cannot start before an explicit verified-account confirmation', async () => {
  const f = fixture();
  assert.equal((await f.machine.accept()).code, 'confirmation_required');
  assert.deepEqual(f.calls, []);
  const held = deferred(); f.previewAuth.getUser = () => held.promise;
  const pending = f.machine.preview();
  assert.equal((await f.machine.accept()).code, 'confirmation_required');
  held.resolve(identified(A)); await pending;
  assert.equal(f.values.size, 0);
  f.machine.dispose();
});

test('accept refreshes and validates the token pair before committing only rotated credentials', async () => {
  const f = fixture(); await f.machine.preview();
  assert.deepEqual(await f.machine.accept(), { ok: true, user: A });
  assert.deepEqual(f.calls.find(call => call[0] === 'refresh')[1], { refresh_token: INPUT.refresh_token });
  assert.deepEqual(f.calls.find(call => call[0] === 'setSession')[1], FRESH);
  assert.equal(f.calls.filter(call => call[0] === 'previewUser').length, 2);
  assert.equal(f.calls.filter(call => call[0] === 'persistentUser').length, 1);
  assert.ok(f.calls.findIndex(call => call[0] === 'persistentUser') < f.calls.findIndex(call => call[0] === 'write'));
  const saved = JSON.parse(f.values.get(STORE_KEY));
  assert.deepEqual(saved, { ...FRESH, user: A });
  assert.equal(f.options.length, 1);
  assert.equal(f.options[0].auth.persistSession, false);
  assert.notEqual(f.options[0].auth.storageKey, STORE_KEY);
  assert.equal(f.options[0].auth.detectSessionInUrl, false);
  assert.equal(JSON.stringify(f.machine.getState()).includes('secret'), false);
  f.machine.dispose();
  assert.equal(f.values.has(STORE_KEY), true, 'disposing a completed callback preserves the confirmed session');
});

test('an existing different verified account is never overwritten or signed out', async () => {
  const f = fixture({ existing: B }); const before = f.values.get(STORE_KEY);
  await f.machine.preview();
  assert.equal((await f.machine.accept()).code, 'different_account');
  assert.equal(f.values.get(STORE_KEY), before);
  assert.equal(f.calls.some(call => ['refresh', 'setSession', 'write', 'remove'].includes(call[0])), false);
  f.machine.dispose();
});

test('a matching existing account may confirm and refresh its own session', async () => {
  const f = fixture({ existing: A }); await f.machine.preview();
  assert.equal((await f.machine.accept()).ok, true);
  assert.equal(f.calls.filter(call => call[0] === 'persistentUser').length, 1);
  assert.ok(f.calls.some(call => call[0] === 'previewUser' && call[1] === 'existing-access-secret'));
  assert.deepEqual(JSON.parse(f.values.get(STORE_KEY)), { ...FRESH, user: A });
  f.machine.dispose();
});

test('refresh token for another account is rejected before any persistent setSession', async () => {
  const f = fixture({ refreshUser: B }); await f.machine.preview();
  assert.equal((await f.machine.accept()).code, 'token_pair_mismatch');
  assert.equal(f.values.size, 0);
  assert.equal(f.calls.some(call => call[0] === 'setSession'), false);
  f.machine.dispose();
});

test('the refreshed access token must verify as the same account on the server', async () => {
  const f = fixture(); await f.machine.preview();
  f.previewAuth.getUser = async () => identified(B);
  assert.equal((await f.machine.accept()).code, 'token_pair_mismatch');
  assert.equal(f.values.size, 0);
  assert.equal(f.calls.some(call => call[0] === 'setSession'), false);
  f.machine.dispose();
});

test('failed or anonymous preview returns fixed text without leaking server messages', async () => {
  for (const result of [
    { data: { user: A }, error: { code: 'bad_jwt', message: INPUT.access_token } },
    identified({ ...A, is_anonymous: true }), identified({ id: 'bad', email: A.email }),
  ]) {
    const f = fixture(); f.previewAuth.getUser = async () => result;
    const reply = await f.machine.preview();
    assert.equal(reply.code, 'verification_failed');
    assert.equal(JSON.stringify(reply).includes('secret'), false);
    assert.equal((await f.machine.accept()).code, 'confirmation_required');
    assert.equal(f.values.size, 0);
    f.machine.dispose();
  }
});

test('final server failure cannot leave the staged session in persistent storage', async () => {
  for (const result of [identified(B), { data: { user: null }, error: { message: FRESH.access_token } }]) {
    const f = fixture(); await f.machine.preview();
    f.persistentAuth.getUser = async () => result;
    const reply = await f.machine.accept();
    assert.equal(reply.code, 'verification_failed');
    assert.equal(f.values.size, 0);
    assert.equal(JSON.stringify(reply).includes('secret'), false);
    f.machine.dispose();
  }
});

test('duplicate confirmation clicks share one refresh and one session commit', async () => {
  const f = fixture(); await f.machine.preview();
  const held = deferred(); let refreshes = 0;
  f.previewAuth.refreshSession = async () => { refreshes++; return held.promise; };
  const first = f.machine.accept(), second = f.machine.accept();
  assert.equal(first, second);
  held.resolve(session(A));
  assert.equal((await first).ok, true);
  assert.equal(refreshes, 1);
  assert.equal(f.calls.filter(call => call[0] === 'write').length, 1);
  assert.equal((await f.machine.accept()).ok, true);
  assert.equal(refreshes, 1);
  f.machine.dispose();
});

test('cancellation while preview is pending does not offer stale account confirmation', async () => {
  const f = fixture(), held = deferred(); f.previewAuth.getUser = () => held.promise;
  const pending = f.machine.preview(); f.machine.cancel(); held.resolve(identified(A));
  assert.equal((await pending).code, 'cancelled');
  assert.equal(f.machine.getState().user, null);
  assert.equal((await f.machine.accept()).code, 'cancelled');
  assert.equal(f.values.size, 0);
  f.machine.dispose();
});

test('cancellation while refreshing cannot create a persisted session', async () => {
  const f = fixture(); await f.machine.preview();
  const held = deferred(), started = deferred();
  f.previewAuth.refreshSession = async () => { started.resolve(); return held.promise; };
  const pending = f.machine.accept(); await started.promise;
  f.machine.cancel(); held.resolve(session(A));
  assert.equal((await pending).code, 'cancelled');
  assert.equal(f.values.size, 0);
  assert.equal(f.calls.some(call => call[0] === 'setSession'), false);
  f.machine.dispose();
});

test('cancellation after SDK staging but before final verification leaves no login', async () => {
  const f = fixture(); await f.machine.preview();
  const held = deferred(), started = deferred();
  f.persistentAuth.getUser = async () => { started.resolve(); return held.promise; };
  const pending = f.machine.accept(); await started.promise;
  assert.equal(f.values.size, 0);
  f.machine.cancel(); held.resolve(identified(A));
  assert.equal((await pending).code, 'cancelled');
  assert.equal(f.values.size, 0);
  f.machine.dispose();
});

test('a different account written during refresh is preserved and stops confirmation', async () => {
  const f = fixture(); await f.machine.preview();
  const held = deferred(), started = deferred();
  f.previewAuth.refreshSession = async () => { started.resolve(); return held.promise; };
  const pending = f.machine.accept(); await started.promise;
  const other = JSON.stringify({ ...INPUT, user: B }); f.values.set(STORE_KEY, other);
  held.resolve(session(A));
  assert.equal((await pending).code, 'account_changed');
  assert.equal(f.values.get(STORE_KEY), other);
  assert.equal(f.calls.some(call => call[0] === 'setSession'), false);
  f.machine.dispose();
});

test('storage failure rolls back only this confirmation and does not report authenticated', async () => {
  const f = fixture(); await f.machine.preview();
  f.storage.setItem = (name, value) => { f.values.set(name, value); throw new Error(INPUT.refresh_token); };
  const result = await f.machine.accept();
  assert.equal(result.code, 'session_save_failed');
  assert.equal(f.values.size, 0);
  assert.equal(f.machine.getState().phase, 'error');
  assert.equal(JSON.stringify(result).includes('secret'), false);
  f.machine.dispose();
});

test('expired or unverifiable existing session is preserved without refreshing that account', async () => {
  const f = fixture({ existing: B }); const before = f.values.get(STORE_KEY);
  await f.machine.preview();
  f.previewAuth.getUser = async () => ({ data: { user: null }, error: { code: 'bad_jwt' } });
  assert.equal((await f.machine.accept()).code, 'verification_failed');
  assert.equal(f.values.get(STORE_KEY), before);
  assert.equal(f.calls.some(call => call[0] === 'refresh' || call[0] === 'setSession'), false);
  f.machine.dispose();
});

test('async storage is rejected before refreshing or writing any account', async () => {
  const f = fixture(); await f.machine.preview();
  f.storage.getItem = async () => null;
  assert.equal((await f.machine.accept()).code, 'session_save_failed');
  assert.equal(f.calls.some(call => call[0] === 'refresh' || call[0] === 'write'), false);
  f.machine.dispose();
});

test('a final storage mismatch is checked synchronously and never overwrites the replacement', async () => {
  const f = fixture(); await f.machine.preview();
  const replacement = JSON.stringify({ ...INPUT, user: B });
  f.persistentAuth.getUser = async () => {
    f.values.set(STORE_KEY, replacement);
    return identified(A);
  };
  assert.equal((await f.machine.accept()).code, 'account_changed');
  assert.equal(f.values.get(STORE_KEY), replacement);
  assert.equal(f.calls.some(call => call[0] === 'write'), false);
  f.machine.dispose();
});

test('installed Supabase SDK accepts a new-browser email link and the next SCYL page restores the verified session', async () => {
  const now = Math.floor(Date.now() / 1000);
  const jwt = suffix => [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: A.id, email: A.email, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now, jti: suffix })).toString('base64url'),
    'synthetic-signature-only',
  ].join('.');
  const initial = { access_token: jwt('incoming'), refresh_token: 'synthetic-incoming-refresh' };
  const rotated = { access_token: jwt('rotated'), refresh_token: 'synthetic-rotated-refresh' };
  const user = { ...A, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-01-01T00:00:00.000Z', email_confirmed_at: '2026-01-01T00:00:00.000Z', is_anonymous: false };
  const data = new Map(), writes = [], requests = [], clients = [];
  const storage = {
    getItem: name => data.get(name) ?? null,
    setItem(name, value) { writes.push(name); data.set(name, value); },
    removeItem(name) { data.delete(name); },
  };
  const fakeFetch = async (input, options = {}) => {
    const target = new globalThis.URL(input);
    assert.equal(target.origin, URL, 'all SDK traffic remains on the synthetic fixture origin');
    const headers = new Headers(options.headers);
    requests.push({ path: target.pathname, method: options.method ?? 'GET' });
    if (target.pathname === '/auth/v1/user') {
      assert.ok([initial.access_token, rotated.access_token].some(token => headers.get('authorization') === `Bearer ${token}`));
      return new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (target.pathname === '/auth/v1/token' && target.searchParams.get('grant_type') === 'refresh_token') {
      assert.equal(JSON.parse(options.body).refresh_token, initial.refresh_token);
      return new Response(JSON.stringify({ ...rotated, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error('Unexpected synthetic SDK request');
  };
  const makeClient = (url, key, options) => {
    const client = createSupabaseClient(url, key, { ...options, global: { fetch: fakeFetch } });
    clients.push(client);
    return client;
  };
  const serverFragment = new URLSearchParams({ access_token: initial.access_token, expires_at: String(now + 3600),
    expires_in: '3600', refresh_token: initial.refresh_token, sb: '', token_type: 'bearer', type: 'magiclink' });
  const parsed = parseEmailLinkTokens(`https://scyl.example.test/auth.html#${serverFragment}`);
  assert.equal(parsed.ok, true, 'the real server callback format must reach server verification');
  const machine = createEmailLinkSession({ tokens: parsed.tokens, url: URL, key: KEY, storage, createClient: makeClient });
  let account;
  try {
    assert.equal(data.size, 0, 'new browser has no session or PKCE verifier');
    assert.deepEqual(await machine.preview(), { ok: true, user: A });
    assert.deepEqual(writes, [], 'preview does not persist or refresh a session');
    assert.equal(requests.some(item => item.path === '/auth/v1/token'), false);
    assert.deepEqual(await machine.accept(), { ok: true, user: A });
    assert.deepEqual(writes, [STORE_KEY]);
    const saved = JSON.parse(data.get(STORE_KEY));
    assert.equal(saved.access_token, rotated.access_token);
    assert.equal(saved.refresh_token, rotated.refresh_token);
    assert.equal(saved.user.id, A.id);
    assert.equal(typeof saved.expires_at, 'number');
    assert.equal(data.has(`${STORE_KEY}-code-verifier`), false);
    machine.dispose();

    account = createSharedAccount({ url: URL, key: KEY, storage, createClient: makeClient });
    assert.equal((await account.start()).ok, true);
    assert.equal(account.getState().phase, 'signed-in');
    assert.deepEqual(account.getState().user, A);
    assert.equal(requests.filter(item => item.path === '/auth/v1/token').length, 1);
    assert.equal(JSON.stringify(account.getState()).includes(rotated.access_token), false);
  } finally {
    account?.dispose(); machine.dispose();
    await Promise.all(clients.map(client => client.auth.dispose()));
  }
});

function rejectExistingSession(f, error = { status: 403, code: 'bad_jwt', message: 'private-old-token-error' }) {
  const original = f.previewAuth.getUser;
  f.previewAuth.getUser = async token => token === 'existing-access-secret'
    ? { data: { user: null }, error } : original(token);
}

test('서버가 만료·무효 판정한 저장 세션은 교체 동의 전 그대로 두고 토큰을 갱신하지 않는다', async () => {
  for (const status of [401, 403]) for (const code of ['bad_jwt', 'session_not_found', 'session_expired', 'user_not_found']) {
    const f = fixture({ existing: B }); const before = f.values.get(STORE_KEY);
    rejectExistingSession(f, { status, code, message: INPUT.access_token }); await f.machine.preview();
    const result = await f.machine.accept();
    assert.equal(result.code, 'expired_session_confirmation_required');
    assert.equal(f.machine.getState().phase, 'replacement-confirmation');
    assert.deepEqual(f.machine.getState().user, A);
    assert.equal(f.values.get(STORE_KEY), before);
    assert.equal(f.calls.some(call => ['refresh', 'setSession', 'write', 'remove'].includes(call[0])), false);
    assert.equal(JSON.stringify([result, f.machine.getState()]).includes('secret'), false);
    f.machine.dispose();
  }
});

test('교체 동의는 기존 세션 판정 후에만 유효하며 명시 재연결은 새 링크 토큰만 검증한다', async () => {
  const f = fixture({ existing: B }); rejectExistingSession(f); await f.machine.preview();
  assert.equal((await f.machine.accept({ replaceExpiredSession: true })).code, 'confirmation_required');
  assert.equal((await f.machine.accept()).code, 'expired_session_confirmation_required');
  const checks = f.calls.length;
  assert.equal((await f.machine.accept()).code, 'expired_session_confirmation_required');
  assert.equal(f.calls.length, checks, '동의 없는 재호출은 새 인증 요청을 만들지 않는다');
  assert.equal((await f.machine.accept({ replaceExpiredSession: true })).ok, true);
  assert.deepEqual(f.calls.filter(call => call[0] === 'refresh').map(call => call[1]), [{ refresh_token: INPUT.refresh_token }]);
  assert.deepEqual(JSON.parse(f.values.get(STORE_KEY)), { ...FRESH, user: A });
  f.machine.dispose(); assert.equal(f.values.has(STORE_KEY), true);
});

test('네트워크·서버·정책 오류와 출처가 불명확한 오류에는 기존 로그인 교체를 제공하지 않는다', async () => {
  for (const error of [
    { status: 500, code: 'bad_jwt' }, { status: 503, code: 'session_expired' },
    { status: 429, code: 'over_request_rate_limit' }, { status: 403, code: 'user_banned' },
    { status: 401, code: 'no_authorization' }, { status: 403 }, { code: 'bad_jwt' },
    { name: 'AuthRetryableFetchError', status: 0 }, new TypeError('network'),
  ]) {
    const f = fixture({ existing: B }), before = f.values.get(STORE_KEY);
    rejectExistingSession(f, error); await f.machine.preview();
    assert.equal((await f.machine.accept()).code, 'verification_failed');
    assert.equal((await f.machine.accept({ replaceExpiredSession: true })).code, 'confirmation_required');
    assert.equal(f.values.get(STORE_KEY), before);
    assert.equal(f.calls.some(call => ['refresh', 'setSession', 'write', 'remove'].includes(call[0])), false);
    f.machine.dispose();
  }
});

test('교체 동의 시점에 기존 계정이 다시 유효하면 다른 계정 덮어쓰기를 거절한다', async () => {
  const f = fixture({ existing: B }), before = f.values.get(STORE_KEY), original = f.previewAuth.getUser;
  rejectExistingSession(f); await f.machine.preview();
  assert.equal((await f.machine.accept()).code, 'expired_session_confirmation_required');
  f.previewAuth.getUser = original;
  assert.equal((await f.machine.accept({ replaceExpiredSession: true })).code, 'different_account');
  assert.equal(f.values.get(STORE_KEY), before);
  assert.equal(f.calls.some(call => ['refresh', 'setSession', 'write', 'remove'].includes(call[0])), false);
  f.machine.dispose();
});

test('교체 동의 후 기존 세션 재확인이 네트워크 오류이면 이전 만료 결과만 믿고 진행하지 않는다', async () => {
  const f = fixture({ existing: B }), before = f.values.get(STORE_KEY);
  rejectExistingSession(f); await f.machine.preview(); await f.machine.accept();
  rejectExistingSession(f, { status: 503, code: 'unexpected_failure' });
  assert.equal((await f.machine.accept({ replaceExpiredSession: true })).code, 'verification_failed');
  assert.equal(f.values.get(STORE_KEY), before);
  assert.equal(f.calls.some(call => ['refresh', 'write', 'remove'].includes(call[0])), false); f.machine.dispose();
});

test('재연결 동의를 기다리는 동안 바뀐 저장값은 삭제되었어도 이전 동의로 교체하지 않는다', async () => {
  for (const newer of [null, JSON.stringify({ ...FRESH, user: B })]) {
    const f = fixture({ existing: B }); rejectExistingSession(f); await f.machine.preview(); await f.machine.accept();
    if (newer === null) f.values.delete(STORE_KEY); else f.values.set(STORE_KEY, newer);
    assert.equal((await f.machine.accept({ replaceExpiredSession: true })).code, 'account_changed');
    assert.equal(f.values.get(STORE_KEY) ?? null, newer);
    assert.equal(f.calls.some(call => ['refresh', 'write', 'remove'].includes(call[0])), false); f.machine.dispose();
  }
});

test('재연결 대기 중 취소·종료는 새 링크를 사용하지 않고 기존 세션을 보존한다', async () => {
  for (const action of ['cancel', 'dispose']) {
    const f = fixture({ existing: B }), before = f.values.get(STORE_KEY);
    rejectExistingSession(f); await f.machine.preview(); await f.machine.accept(); f.machine[action]();
    assert.equal((await f.machine.accept({ replaceExpiredSession: true })).code, 'cancelled');
    assert.equal(f.values.get(STORE_KEY), before);
    assert.equal(f.calls.some(call => ['refresh', 'write', 'remove'].includes(call[0])), false); f.machine.dispose();
  }
});

test('만료 세션 교체도 새 링크의 refresh 계정이 다르면 원래 저장값을 보존한다', async () => {
  const f = fixture({ existing: B, refreshUser: B }), before = f.values.get(STORE_KEY);
  rejectExistingSession(f); await f.machine.preview(); await f.machine.accept();
  assert.equal((await f.machine.accept({ replaceExpiredSession: true })).code, 'token_pair_mismatch');
  assert.equal(f.values.get(STORE_KEY), before);
  assert.equal(f.calls.some(call => ['setSession', 'write', 'remove'].includes(call[0])), false); f.machine.dispose();
});

test('명시 재연결의 중복 클릭은 하나의 새 토큰 검증과 저장으로 합친다', async () => {
  const f = fixture({ existing: B }), held = deferred(), started = deferred();
  rejectExistingSession(f); await f.machine.preview(); await f.machine.accept();
  let refreshes = 0;
  f.previewAuth.refreshSession = async value => { assert.deepEqual(value, { refresh_token: INPUT.refresh_token }); refreshes++; started.resolve(); return held.promise; };
  const first = f.machine.accept({ replaceExpiredSession: true }), second = f.machine.accept({ replaceExpiredSession: true });
  assert.equal(first, second); await started.promise; held.resolve(session(A));
  assert.equal((await first).ok, true); assert.equal(refreshes, 1);
  assert.equal(f.calls.filter(call => call[0] === 'write').length, 1); f.machine.dispose();
});

test('명시 재연결의 새 토큰 검증 중 다른 창이 저장한 세션은 최종 비교에서 보존한다', async () => {
  const f = fixture({ existing: B }), held = deferred(), started = deferred();
  rejectExistingSession(f); await f.machine.preview(); await f.machine.accept();
  f.previewAuth.refreshSession = async () => { started.resolve(); return held.promise; };
  const pending = f.machine.accept({ replaceExpiredSession: true }); await started.promise;
  const newer = JSON.stringify({ ...INPUT, user: B }); f.values.set(STORE_KEY, newer); held.resolve(session(A));
  assert.equal((await pending).code, 'account_changed'); assert.equal(f.values.get(STORE_KEY), newer);
  assert.equal(f.calls.some(call => ['setSession', 'write', 'remove'].includes(call[0])), false); f.machine.dispose();
});

test('실제 Supabase SDK의 403 bad_jwt 이후 명시 재연결은 기존 refresh를 사용하지 않고 새 회원을 복원한다', async () => {
  const now = Math.floor(Date.now() / 1000);
  const jwt = (who, expiry) => [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: who.id, email: who.email, role: 'authenticated', aud: 'authenticated', exp: expiry, iat: now - 7200 })).toString('base64url'), 'synthetic-signature-only'].join('.');
  const old = { access_token: jwt(B, now - 30), refresh_token: 'synthetic-previous-account-refresh', expires_at: now - 30, user: B };
  const incoming = { access_token: jwt(A, now + 3600), refresh_token: 'synthetic-incoming-refresh' };
  const fresh = { access_token: jwt(A, now + 7200), refresh_token: 'synthetic-fresh-refresh' };
  const user = { ...A, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00.000Z', is_anonymous: false };
  const values = new Map([[STORE_KEY, JSON.stringify(old)]]), writes = [], refreshes = [], clients = [];
  const storage = { getItem: name => values.get(name) ?? null, setItem(name, value) { writes.push(name); values.set(name, value); }, removeItem(name) { throw new Error('이전 세션 삭제 금지'); } };
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' } });
  const fakeFetch = async (input, options = {}) => {
    const target = new globalThis.URL(input); assert.equal(target.origin, URL);
    const authorization = new Headers(options.headers).get('authorization');
    if (target.pathname === '/auth/v1/user') {
      if (authorization === `Bearer ${old.access_token}`) return json({ code: 'bad_jwt', message: 'invalid JWT: token has expired' }, 403);
      assert.ok([incoming.access_token, fresh.access_token].some(token => authorization === `Bearer ${token}`));
      return json(user);
    }
    if (target.pathname === '/auth/v1/token' && target.searchParams.get('grant_type') === 'refresh_token') {
      const token = JSON.parse(options.body).refresh_token; refreshes.push(token);
      assert.equal(token, incoming.refresh_token, '기존 계정의 refresh 토큰은 회전시키지 않는다');
      return json({ ...fresh, user, token_type: 'bearer', expires_at: now + 7200, expires_in: 7200 });
    }
    if (target.pathname === '/rest/v1/rpc/get_shared_profile') return json(null);
    throw new Error('예상하지 못한 합성 인증 요청');
  };
  const makeClient = (url, key, options) => { const client = createSupabaseClient(url, key, { ...options, global: { fetch: fakeFetch } }); clients.push(client); return client; };
  const machine = createEmailLinkSession({ tokens: incoming, url: URL, key: KEY, storage, createClient: makeClient }); let account;
  try {
    assert.equal((await machine.preview()).ok, true);
    assert.equal((await machine.accept()).code, 'expired_session_confirmation_required');
    assert.deepEqual(refreshes, []); assert.deepEqual(writes, []); assert.equal(values.get(STORE_KEY), JSON.stringify(old));
    assert.deepEqual(await machine.accept({ replaceExpiredSession: true }), { ok: true, user: A });
    assert.deepEqual(refreshes, [incoming.refresh_token]); assert.deepEqual(writes, [STORE_KEY]);
    const saved = JSON.parse(values.get(STORE_KEY)); assert.equal(saved.expires_at, now + 7200); assert.equal(saved.user.id, A.id);
    machine.dispose();
    account = createSharedAccount({ url: URL, key: KEY, storage, createClient: makeClient });
    assert.equal((await account.start()).ok, true); assert.equal(account.getState().phase, 'signed-in'); assert.equal(account.getState().user.id, A.id);
  } finally { account?.dispose(); machine.dispose(); await Promise.all(clients.map(client => client.auth.dispose())); }
});
