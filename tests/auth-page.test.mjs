import test from 'node:test';
import assert from 'node:assert/strict';
import { mountAuthPage } from '../lib/auth-page.mjs';
import { beginPasswordSetup, readPasswordSetup } from '../lib/account-continuation.mjs';

const base = 'https://scyl.example.test/auth.html';
const link = label => `${base}#access_token=synthetic-access-${label}&refresh_token=synthetic-refresh-${label}&sb=&type=magiclink`;

function setup(initial = base, extra = {}) {
  let href = initial;
  const order = [], calls = { entries: [], callbacks: [], completed: 0 }, nodes = [];
  const window = new EventTarget();
  window.location = { get href() { return href; } };
  window.history = { replaceState(_state, _title, next) { href = new URL(next, href).href; order.push('scrub'); } };
  const main = { inert: false, value: '<header>SCYL</header><h1>원래 제목</h1>',
    get innerHTML() { return this.value; },
    set innerHTML(value) { this.value = value; document.message = { textContent: '', setAttribute() {} }; document.nativeVisible = false; document.actions = 0; },
    removeAttribute(name) { if (name === 'inert') this.inert = false; } };
  const document = { message: { textContent: '' }, nativeVisible: false, actions: 0,
    querySelector(selector) { assert.equal(selector, 'main'); return main; },
    querySelectorAll() { return nodes.filter(node => !node.removed); },
    getElementById(id) { assert.equal(id, 'auth-message'); return this.message; } };
  window.document = document;
  function owner(options) {
    return { options, configured: true, disposed: false, dispose() { this.disposed = true; order.push('dispose'); } };
  }
  function mountAccount(options) {
    order.push('entry'); assert.equal(href, base);
    const entry = owner(options); calls.entries.push(entry); main.inert = true;
    nodes.push({ open: true, removed: false, close() { assert.equal(entry.disposed, true); this.open = false; }, remove() { this.removed = true; } });
    return entry;
  }
  function showCallback(options) {
    order.push('callback'); assert.equal(href, base); assert.equal(main.inert, false);
    assert.equal(nodes.filter(node => !node.removed).length, 0);
    const result = owner(options); calls.callbacks.push(result); document.actions++;
    document.nativeVisible = options.callback.kind === 'native';
    return result;
  }
  const page = mountAuthPage({ window, document, config: {}, mountAccount, showCallback, readSetup: () => null, ...extra,
    createClient() { throw new Error('실제 인증 요청 금지'); }, onComplete() { calls.completed++; } });
  const emit = (type, extra = {}) => {
    const event = new Event(type); Object.assign(event, extra); window.dispatchEvent(event);
  };
  return { page, calls, document, main, nodes, order, window, emit,
    navigate(url, type = 'hashchange') { href = url; emit(type); }, get href() { return href; } };
}

test('열린 이메일 입력 화면에서 인증 해시를 받으면 주소를 지우고 모달을 정리한다', () => {
  const h = setup(); h.navigate(link('first'));
  assert.equal(h.calls.entries.length, 1); assert.equal(h.calls.entries[0].disposed, true);
  assert.equal(h.calls.callbacks.length, 1); assert.equal(h.calls.callbacks[0].options.callback.kind, 'email');
  assert.equal(h.href, base); assert.equal(h.main.inert, false); assert.equal(h.calls.completed, 0);
  assert.deepEqual(h.order, ['scrub', 'entry', 'scrub', 'dispose', 'callback']); h.page.dispose();
});

test('오류 결과 뒤에 도착한 새 인증 해시는 입력 폼 없이 승인 화면으로 바뀐다', () => {
  const h = setup(`${base}#error_code=otp_expired`);
  assert.equal(h.calls.callbacks[0].options.callback.kind, 'error'); h.navigate(link('new'));
  assert.equal(h.calls.entries.length, 0); assert.equal(h.calls.callbacks.length, 2);
  assert.equal(h.calls.callbacks[0].disposed, true); assert.equal(h.calls.callbacks[1].options.callback.kind, 'email');
  assert.equal(h.document.actions, 1); h.page.dispose();
});

test('이전 계정 확인과 이전 링크의 늦은 완료는 새 인증 화면을 이동시키지 않는다', () => {
  const h = setup(); const entry = h.calls.entries[0]; h.navigate(link('a'));
  const first = h.calls.callbacks[0]; h.navigate(link('b'));
  entry.options.onSignedIn(); first.options.onComplete();
  assert.equal(h.calls.completed, 0); assert.equal(first.disposed, true);
  const latest = h.calls.callbacks[1]; latest.options.onComplete(); latest.options.onComplete();
  assert.equal(h.calls.completed, 0); assert.equal(h.calls.entries.length, 2);
  h.calls.entries[1].options.onSignedIn(); h.calls.entries[1].options.onSignedIn();
  assert.equal(h.calls.completed, 1); h.page.dispose();
});

test('메일 확인의 기본 선택은 같은 회원의 비밀번호·프로필 단계가 끝나야 최종 이동한다', () => {
  const h = setup(link('setup'));
  h.calls.callbacks[0].options.onComplete({ passwordSetup: true, expectedUserId: 'verified-user-id' });
  const entry = h.calls.entries[0];
  assert.equal(entry.options.passwordSetup, true); assert.equal(entry.options.expectedUserId, 'verified-user-id');
  assert.equal(h.calls.callbacks[0].disposed, true); assert.equal(h.calls.completed, 0);
  entry.options.onSignedIn(); assert.equal(h.calls.completed, 1); h.page.dispose();
});

test('기존 비밀번호 선택도 확인된 회원 UUID를 유지하여 프로필 확인에 전달한다', () => {
  const h = setup(link('existing'));
  h.calls.callbacks[0].options.onComplete({ passwordSetup: false, expectedUserId: 'verified-user-id' });
  assert.equal(h.calls.entries[0].options.passwordSetup, false);
  assert.equal(h.calls.entries[0].options.expectedUserId, 'verified-user-id'); assert.equal(h.calls.completed, 0); h.page.dispose();
});

test('비밀번호 단계 중 새 인증 링크가 열리면 이전 단계의 늦은 완료를 무시한다', () => {
  const h = setup(link('first'));
  h.calls.callbacks[0].options.onComplete({ passwordSetup: true, expectedUserId: 'first-user' });
  const previous = h.calls.entries[0]; h.navigate(link('second'));
  previous.options.onSignedIn(); assert.equal(h.calls.completed, 0); assert.equal(previous.disposed, true);
  h.calls.callbacks[1].options.onComplete({ passwordSetup: true, expectedUserId: 'second-user' });
  assert.equal(h.calls.entries[1].options.expectedUserId, 'second-user'); h.page.dispose();
});

test('지연 해시 이벤트와 깨끗한 주소의 복원 이벤트는 인증을 중복 처리하지 않는다', () => {
  const h = setup(link('one'));
  h.emit('hashchange', { newURL: link('one') }); h.emit('pageshow', { persisted: true }); h.emit('popstate');
  assert.equal(h.calls.callbacks.length, 1); assert.equal(h.calls.entries.length, 0);
  assert.equal(h.calls.callbacks[0].disposed, false); assert.equal(h.href, base); h.page.dispose();
});

test('뒤로 가기 캐시 복원에서 새 인증 정보가 있으면 수집하고 없으면 기존 화면을 보존한다', () => {
  const h = setup(`${base}#error_code=otp_expired`); h.emit('pagehide', { persisted: true });
  h.emit('pageshow', { persisted: true }); assert.equal(h.calls.callbacks.length, 1);
  h.navigate(link('restored'), 'pageshow'); assert.equal(h.calls.callbacks.length, 2);
  assert.equal(h.calls.callbacks[1].options.callback.kind, 'email'); h.page.dispose();
});

test('페이지가 실제 종료되면 구독과 화면을 정리하고 늦은 완료를 차단한다', () => {
  const h = setup(link('closed')); const controller = h.calls.callbacks[0];
  h.emit('pagehide', { persisted: false }); assert.equal(controller.disposed, true);
  controller.options.onComplete(); h.navigate(link('ignored')); h.emit('pageshow');
  assert.equal(h.calls.completed, 0); assert.equal(h.calls.callbacks.length, 1); h.page.dispose();
});

test('네이티브 복귀 안내가 웹 콜백으로 바뀌면 이전 링크와 동작을 제거한다', () => {
  const h = setup(`${base}?target=native&code=b8c68781-f143-480c-9e5c-86fabbe352a9`);
  assert.equal(h.document.nativeVisible, true); h.navigate(link('web'));
  assert.equal(h.document.nativeVisible, false); assert.equal(h.document.actions, 1);
  assert.equal(h.calls.callbacks[0].disposed, true); assert.equal(h.calls.callbacks[1].options.callback.kind, 'email'); h.page.dispose();
});

test('정리된 인증 주소를 새로 열면 남은 비밀번호 단계와 확인 대상 UUID를 복원한다', () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null,
    setItem(key, value) { values.set(key, value); }, removeItem(key) { values.delete(key); } };
  const now = () => 1_800_000_000_000;
  const user = { id: '00000000-0000-4000-8000-000000000001', email: 'one@example.test' };
  const first = setup(link('reload'));
  beginPasswordSetup(user, { storage, now });
  first.calls.callbacks[0].options.onComplete({ passwordSetup: true, expectedUserId: user.id });
  first.page.dispose();
  const restored = setup(base, { readSetup: () => readPasswordSetup({ storage, now }) });
  assert.equal(restored.calls.entries[0].options.passwordSetup, true);
  assert.equal(restored.calls.entries[0].options.expectedUserId, user.id);
  assert.equal(restored.calls.completed, 0, '단계 기록만으로 로그인 완료 처리하지 않는다');
  restored.calls.entries[0].options.onSignedIn();
  assert.equal(restored.calls.completed, 1); restored.page.dispose();
});

test('만료된 복원 기록은 일반 진입에 비밀번호 단계나 계정 제한을 남기지 않는다', () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null,
    setItem(key, value) { values.set(key, value); }, removeItem(key) { values.delete(key); } };
  const now = 1_800_000_000_000;
  beginPasswordSetup({ id: '00000000-0000-4000-8000-000000000001', email: 'one@example.test' }, { storage, now: () => now });
  const h = setup(base, { readSetup: () => readPasswordSetup({ storage, now: () => now + 3_600_000 }) });
  assert.equal(h.calls.entries[0].options.passwordSetup, false);
  assert.equal(h.calls.entries[0].options.expectedUserId, null);
  assert.equal(h.calls.completed, 0); assert.equal(values.size, 0); h.page.dispose();
});

test('새 메일의 명시 승인에는 이전 복원 기록을 섞지 않는다', () => {
  const h = setup(link('new'), { readSetup() { throw new Error('새 콜백은 과거 단계 기록을 사용하면 안 된다'); } });
  h.calls.callbacks[0].options.onComplete({ passwordSetup: true, expectedUserId: 'new-verified-user' });
  assert.equal(h.calls.entries[0].options.expectedUserId, 'new-verified-user');
  assert.equal(h.calls.entries[0].options.passwordSetup, true); assert.equal(h.calls.completed, 0); h.page.dispose();
});
