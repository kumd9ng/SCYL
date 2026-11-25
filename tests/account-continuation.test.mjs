import test from 'node:test';
import assert from 'node:assert/strict';
import { rememberVerifiedEmail, readRememberedEmail, beginPasswordSetup, readPasswordSetup, finishPasswordSetup } from '../lib/account-continuation.mjs';

const EMAIL_KEY = 'scyl.last-email.v1', SETUP_KEY = 'scyl.password-setup.v1';
const A = { id: '00000000-0000-4000-8000-000000000001', email: 'one@example.test' };
const B = { id: '00000000-0000-4000-8000-000000000002', email: 'two@example.test' };
const NOW = 1_800_000_000_000;
const clock = () => NOW;
function memory() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null,
    setItem(key, value) { values.set(key, value); }, removeItem(key) { values.delete(key); } };
}
const unavailable = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('blocked'); } };

test('확인된 이메일은 기존 키와 호환되며 localStorage 우선으로 복원한다', () => {
  const localStorage = memory(), sessionStorage = memory(), options = { localStorage, sessionStorage };
  localStorage.setItem(EMAIL_KEY, A.email); sessionStorage.setItem(EMAIL_KEY, B.email);
  assert.equal(readRememberedEmail(options), A.email);
  assert.equal(rememberVerifiedEmail(B.email, options), B.email);
  assert.equal(localStorage.getItem(EMAIL_KEY), B.email);
  assert.equal(sessionStorage.getItem(EMAIL_KEY), B.email);
  assert.equal(readRememberedEmail(options), B.email);
});

test('영구 저장이 막히거나 값이 잘못되면 현재 탭에 보관한 이메일을 사용한다', () => {
  const sessionStorage = memory();
  assert.equal(rememberVerifiedEmail(A.email, { localStorage: unavailable, sessionStorage }), A.email);
  assert.equal(readRememberedEmail({ localStorage: unavailable, sessionStorage }), A.email);
  const localStorage = memory(); localStorage.setItem(EMAIL_KEY, 'bad address');
  assert.equal(readRememberedEmail({ localStorage, sessionStorage }), A.email);
  assert.equal(readRememberedEmail({ localStorage: unavailable, sessionStorage: unavailable }), '');
  assert.equal(rememberVerifiedEmail(A.email, { localStorage: unavailable, sessionStorage: unavailable }), A.email);
});

test('잘못된 이메일은 기존 입력 선호를 지우거나 덮어쓰지 않는다', () => {
  const localStorage = memory(), sessionStorage = memory(), options = { localStorage, sessionStorage };
  rememberVerifiedEmail(A.email, options);
  for (const invalid of [null, {}, '', 'one', 'one@site', ' one@example.test', 'one@example.test\n', 'x'.repeat(255) + '@example.test']) {
    assert.equal(rememberVerifiedEmail(invalid, options), '');
    assert.equal(readRememberedEmail(options), A.email);
  }
});

test('비밀번호 단계는 토큰과 비밀번호 없이 새 화면에서 복원하고 반환값을 복사한다', () => {
  const storage = memory(), options = { storage, now: clock };
  const user = { ...A, password: 'must-not-store', access_token: 'must-not-store', refresh_token: 'must-not-store' };
  const attempt = beginPasswordSetup(user, options);
  assert.deepEqual(Object.keys(attempt).sort(), ['email', 'id', 'startedAt', 'userId']);
  assert.equal(attempt.userId, A.id); assert.equal(attempt.email, A.email); assert.equal(attempt.startedAt, NOW);
  assert.match(attempt.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.deepEqual(readPasswordSetup(options), attempt);
  assert.equal(storage.getItem(SETUP_KEY).includes('must-not-store'), false);
  attempt.email = B.email;
  const restored = readPasswordSetup(options); restored.userId = B.id;
  assert.equal(readPasswordSetup(options).email, A.email);
  assert.equal(readPasswordSetup(options).userId, A.id);
});

test('인증된 사용자 형태가 없거나 시각이 잘못되면 새 단계를 만들지 않는다', () => {
  const storage = memory(), options = { storage, now: clock };
  const original = beginPasswordSetup(A, options);
  for (const user of [null, {}, { ...A, id: 'not-uuid' }, { ...A, email: 'bad' }, { ...A, is_anonymous: true }]) {
    assert.equal(beginPasswordSetup(user, options), null);
    assert.deepEqual(readPasswordSetup(options), original);
  }
  for (const now of [() => -1, () => NaN, () => Infinity, () => 1.5, () => { throw new Error('clock'); }]) {
    assert.equal(beginPasswordSetup(A, { storage, now }), null);
  }
});

test('저장 불가 시 페이지 내부 시도 값만 반환하고 읽기에는 메모리 세션을 가장하지 않는다', () => {
  for (const storage of [null, unavailable]) {
    const attempt = beginPasswordSetup(A, { storage, now: clock });
    assert.equal(attempt.userId, A.id);
    assert.equal(readPasswordSetup({ storage, now: clock }), null);
    assert.equal(finishPasswordSetup(A.id, attempt.id, { storage }), false);
  }
  assert.equal(readPasswordSetup(), null, '브라우저 저장소가 없는 Node에서는 숨은 메모리 복원을 하지 않는다');
});

test('단계는 정확히 한 시간에 만료되며 미래 시각도 복원하지 않는다', () => {
  const storage = memory(), options = { storage, now: clock };
  const attempt = beginPasswordSetup(A, options);
  assert.deepEqual(readPasswordSetup({ storage, now: () => NOW + 3_599_999 }), attempt);
  assert.equal(readPasswordSetup({ storage, now: () => NOW + 3_600_000 }), null);
  assert.equal(storage.getItem(SETUP_KEY), null);
  beginPasswordSetup(A, { storage, now: () => NOW + 1 });
  assert.equal(readPasswordSetup(options), null);
  assert.equal(storage.getItem(SETUP_KEY), null);
});

test('깨진 레코드와 인증 비밀이 추가된 레코드는 반환하지 않고 같은 값일 때만 정리한다', () => {
  const storage = memory(), options = { storage, now: clock };
  const good = beginPasswordSetup(A, options);
  for (const bad of ['broken', '[]', 'null', JSON.stringify({ ...good, userId: 'wrong' }), JSON.stringify({ ...good, email: 'bad' }),
    JSON.stringify({ ...good, startedAt: '1800000000000' }), JSON.stringify({ ...good, access_token: 'secret' })]) {
    storage.setItem(SETUP_KEY, bad);
    assert.equal(readPasswordSetup(options), null);
    assert.equal(storage.getItem(SETUP_KEY), null);
  }
});

test('잘못되거나 만료된 값을 읽는 사이 새 시도가 저장되면 새 값을 지우지 않는다', () => {
  const base = memory(), options = { storage: base, now: clock };
  const newer = beginPasswordSetup(B, options), replacement = base.getItem(SETUP_KEY);
  const expired = JSON.stringify({ ...newer, startedAt: NOW - 3_600_000 });
  for (const original of ['broken', expired]) {
    let reads = 0;
    const storage = { ...base, getItem(key) { reads++; return reads === 1 ? original : base.getItem(key); } };
    assert.equal(readPasswordSetup({ storage, now: clock }), null);
    assert.equal(base.getItem(SETUP_KEY), replacement);
  }
});

test('완료는 같은 사용자와 같은 시도만 삭제하여 다른 계정과 늦은 응답을 보존한다', () => {
  const storage = memory(), options = { storage, now: clock };
  const first = beginPasswordSetup(A, options), newer = beginPasswordSetup(A, options);
  assert.notEqual(first.id, newer.id);
  assert.equal(finishPasswordSetup(A.id, first.id, options), false);
  assert.equal(finishPasswordSetup(B.id, newer.id, options), false);
  assert.deepEqual(readPasswordSetup(options), newer);
  assert.equal(finishPasswordSetup(A.id, newer.id, options), true);
  assert.equal(readPasswordSetup(options), null);
  assert.equal(finishPasswordSetup(A.id, newer.id, options), false);
});

test('완료 중 레코드가 교체되어도 compare-and-remove가 새 시도를 보존한다', () => {
  const base = memory(), options = { storage: base, now: clock };
  const first = beginPasswordSetup(A, options), firstRaw = base.getItem(SETUP_KEY);
  const newer = beginPasswordSetup(B, options);
  let reads = 0;
  const storage = { ...base, getItem(key) { reads++; return reads === 1 ? firstRaw : base.getItem(key); } };
  assert.equal(finishPasswordSetup(A.id, first.id, { storage }), false);
  assert.deepEqual(readPasswordSetup(options), newer);
});

test('삭제 권한이 막혀도 예외를 퍼뜨리거나 완료됐다고 반환하지 않는다', () => {
  const base = memory(), options = { storage: base, now: clock };
  const attempt = beginPasswordSetup(A, options);
  const storage = { ...base, removeItem() { throw new Error('blocked'); } };
  assert.equal(finishPasswordSetup(A.id, attempt.id, { storage }), false);
  assert.deepEqual(readPasswordSetup(options), attempt);
});
