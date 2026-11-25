import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createSharedAccount } from '../lib/shared-account.mjs';

const ORIGIN = 'https://synthetic-stale-session.supabase.co';
const KEY = 'sb_publishable_synthetic_only';
const STORAGE_KEY = 'scyl-auth-v1';
const A = { id: '00000000-0000-4000-8000-000000000001', email: 'one@example.test', is_anonymous: false };
const B = { id: '00000000-0000-4000-8000-000000000002', email: 'two@example.test', is_anonymous: false };
const delay = () => new Promise(resolve => setTimeout(resolve, 5));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' },
});
const session = (name, user = A, expires_at = Math.floor(Date.now() / 1000) + 3600) => ({
  access_token: `synthetic-${name}`, refresh_token: `synthetic-refresh-${name}`, token_type: 'bearer', expires_at, user,
});
async function until(predicate, message) {
  const deadline = Date.now() + 2000;
  while (!predicate() && Date.now() < deadline) await delay();
  assert.ok(predicate(), message);
}

function fixture(handler) {
  const values = new Map(), accounts = [], clients = [], events = [], requests = [];
  const storage = { getItem: key => values.get(key) ?? null,
    setItem(key, value) { values.set(key, value); }, removeItem(key) { values.delete(key); } };
  const transport = async (input, init = {}) => {
    const target = new URL(input); assert.equal(target.origin, ORIGIN, '실제 서버 요청 금지');
    const authorization = new Headers(init.headers).get('authorization');
    requests.push({ path: target.pathname, method: init.method ?? 'GET' });
    if (target.pathname === '/rest/v1/rpc/get_shared_profile') return json(null);
    if (target.pathname === '/auth/v1/logout') return json({});
    return handler({ target, init, authorization });
  };
  function make() {
    const account = createSharedAccount({ url: ORIGIN, key: KEY, storage, fetch: transport,
      createClient(url, key, options) {
        const client = createClient(url, key, { ...options, global: { fetch: transport } });
        client.auth.onAuthStateChange(event => { events.push(event); });
        clients.push(client); return client;
      } });
    accounts.push(account); return account;
  }
  return { values, make, events, requests,
    async close() { await Promise.all(accounts.map(account => account.dispose())); await Promise.all(clients.map(client => client.auth.dispose())); } };
}

for (const replacementUser of [A, B]) {
  test(`실제 SDK의 지연된 이전 계정 조회 실패가 새 ${replacementUser === A ? '동일' : '다른'} 계정 세션을 지우거나 로그아웃 방송하지 않는다`, async () => {
    const started = deferred(), release = deferred();
    const f = fixture(async ({ target, authorization }) => {
      assert.equal(target.pathname, '/auth/v1/user');
      if (authorization === 'Bearer synthetic-old') {
        started.resolve(); await release.promise;
        return json({ code: 'session_not_found', message: 'synthetic old session revoked' }, 400);
      }
      assert.equal(authorization, 'Bearer synthetic-new'); return json(replacementUser);
    });
    try {
      f.values.set(STORAGE_KEY, JSON.stringify(session('old')));
      const old = f.make(), startingOld = old.start(); await started.promise;
      const replacement = JSON.stringify(session('new', replacementUser)); f.values.set(STORAGE_KEY, replacement);
      const current = f.make(); await current.start();
      assert.equal(current.getState().user.id, replacementUser.id);
      release.resolve(); await startingOld;
      await until(() => old.getState().user?.id === replacementUser.id, '이전 클라이언트도 서버에서 최신 계정을 다시 확인한다');
      assert.equal(f.values.get(STORAGE_KEY), replacement);
      assert.equal(f.events.includes('SIGNED_OUT'), false, '거절된 삭제가 로그아웃 알림을 방송하면 안 된다');
      await current.refresh(); assert.equal(current.getState().phase, 'signed-in');
      assert.equal(current.getState().user.id, replacementUser.id);
      assert.equal(f.requests.some(request => request.path.endsWith('/otp')), false);
    } finally { release.resolve(); await f.close(); }
  });
}

for (const refreshOutcome of ['failure', 'success']) {
  test(`실제 SDK의 오래된 초기 갱신 ${refreshOutcome}가 나중에 저장된 세션을 변경하지 않는다`, async () => {
    const started = deferred(), release = deferred();
    const f = fixture(async ({ target, authorization }) => {
      if (target.pathname === '/auth/v1/token') {
        started.resolve(); await release.promise;
        return refreshOutcome === 'failure'
          ? json({ code: 'refresh_token_not_found', message: 'synthetic revoked' }, 400)
          : json({ ...session('rotated-old'), expires_in: 3600 });
      }
      assert.equal(target.pathname, '/auth/v1/user');
      assert.equal(authorization, 'Bearer synthetic-new'); return json(B);
    });
    try {
      f.values.set(STORAGE_KEY, JSON.stringify(session('old', A, Math.floor(Date.now() / 1000) - 60)));
      const old = f.make(), startingOld = old.start(); await started.promise;
      const replacement = JSON.stringify(session('new', B)); f.values.set(STORAGE_KEY, replacement);
      release.resolve(); await startingOld;
      await until(() => old.getState().user?.id === B.id, '새로 저장된 계정을 서버로 검증한다');
      assert.equal(f.values.get(STORAGE_KEY), replacement);
      assert.equal(f.events.includes('SIGNED_OUT'), false);
    } finally { release.resolve(); await f.close(); }
  });
}

test('실제 SDK의 명시적 로그아웃은 현재 세션을 지우며 다음 읽기에서도 복구하지 않는다', async () => {
  const f = fixture(async ({ target }) => { assert.equal(target.pathname, '/auth/v1/user'); return json(A); });
  try {
    f.values.set(STORAGE_KEY, JSON.stringify(session('current')));
    const account = f.make(); await account.start();
    assert.equal((await account.signOut()).ok, true);
    assert.equal(f.values.has(STORAGE_KEY), false);
    assert.equal(account.getState().phase, 'signed-out');
    await account.refresh(); assert.equal(account.getState().user, null);
    assert.equal(f.requests.filter(request => request.path.endsWith('/logout')).length, 1);
  } finally { await f.close(); }
});

test('실제 SDK의 비밀번호 변경 전 명시적 JWT 검증 실패는 다른 창의 새 세션을 지우거나 변경하지 않는다', async () => {
  const started = deferred(), release = deferred(); let hold = false;
  const f = fixture(async ({ target, authorization, init }) => {
    assert.equal(target.pathname, '/auth/v1/user'); assert.notEqual(init.method, 'PUT');
    if (authorization === 'Bearer synthetic-old' && hold) {
      started.resolve(); await release.promise;
      return json({ code: 'session_not_found', message: 'synthetic revoked' }, 400);
    }
    return json(authorization === 'Bearer synthetic-new' ? B : A);
  });
  try {
    f.values.set(STORAGE_KEY, JSON.stringify(session('old')));
    const account = f.make(); await account.start(); hold = true;
    const changing = account.setPassword('synthetic-password-not-sent'); await started.promise;
    const replacement = JSON.stringify(session('new', B)); f.values.set(STORAGE_KEY, replacement);
    release.resolve(); const result = await changing;
    assert.equal(result.ok, false); assert.equal(result.code, 'account_changed');
    assert.equal(f.values.get(STORAGE_KEY), replacement);
    assert.equal(f.events.includes('SIGNED_OUT'), false);
    assert.equal(f.requests.some(request => request.method === 'PUT' || request.path.endsWith('/logout')), false);
    assert.equal(account.getState().user.id, B.id, '새 계정도 서버 검증 후에만 표시한다');
  } finally { release.resolve(); await f.close(); }
});

test('실제 SDK는 저장값이 남은 늦은 로그아웃 방송을 서버 확인 후 무시하고 실제 삭제는 반영한다', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const window = new EventTarget(); window.location = { href: 'https://scyl.example.test/auth.html' };
  Object.defineProperty(globalThis, 'window', { value: window, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: { visibilityState: 'visible' }, configurable: true });
  const started = deferred(), release = deferred(); let blockUpdate = false;
  const f = fixture(async ({ target, init }) => {
    assert.equal(target.pathname, '/auth/v1/user');
    if (blockUpdate && init.method === 'PUT') { blockUpdate = false; started.resolve(); await release.promise; }
    return json(A);
  });
  const sender = new BroadcastChannel(STORAGE_KEY);
  try {
    const stored = JSON.stringify(session('current')); f.values.set(STORAGE_KEY, stored);
    const account = f.make(); await account.start();
    const before = f.requests.length;
    sender.postMessage({ event: 'SIGNED_OUT', session: null });
    await until(() => f.requests.length > before && account.getState().ready, '방송 후 서버 재검증');
    assert.equal(account.getState().user.id, A.id); assert.equal(f.values.get(STORAGE_KEY), stored);
    blockUpdate = true;
    const changing = account.setPassword('synthetic-password-not-sent'); await started.promise;
    const signOutEvents = f.events.filter(event => event === 'SIGNED_OUT').length;
    sender.postMessage({ event: 'SIGNED_OUT', session: null });
    await until(() => f.events.filter(event => event === 'SIGNED_OUT').length > signOutEvents, '진행 중 검증에도 늦은 방송 전달');
    release.resolve(); assert.equal((await changing).ok, true, '이미 실행된 비밀번호 변경의 성공 결과를 잃지 않는다');
    await until(() => account.getState().user?.id === A.id && account.getState().ready, '기존 저장 세션을 서버에서 재확인');
    assert.equal(f.values.get(STORAGE_KEY), stored);
    assert.equal(f.requests.some(request => request.path.endsWith('/logout')), false,
      '진행 중 비밀번호 변경이 있어도 늦은 방송을 실제 로그아웃으로 이어가지 않는다');
    assert.equal(f.requests.filter(request => request.method === 'PUT').length, 1, '비밀번호 변경은 요청한 한 번만 실행한다');
    f.values.delete(STORAGE_KEY); sender.postMessage({ event: 'SIGNED_OUT', session: null });
    await until(() => account.getState().phase === 'signed-out', '실제 세션 삭제는 로그아웃 처리');
    assert.equal(account.getState().user, null);
  } finally {
    release.resolve(); sender.close(); await f.close();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else delete globalThis.window;
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else delete globalThis.document;
  }
});
