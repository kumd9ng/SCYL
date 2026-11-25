import test from 'node:test';
import assert from 'node:assert/strict';
import { readAuthCallback } from '../lib/auth-callback-ui.mjs';

const base = 'https://scyl.example.test/auth';
const code = 'b8c68781-f143-480c-9e5c-86fabbe352a9';
const fragment = '#access_token=synthetic.access.token&refresh_token=synthetic-refresh-token&type=magiclink&token_type=bearer&expires_in=3600';

test('일반 인증 화면만 이메일 입력 경로로 분류한다', () => {
  assert.deepEqual(readAuthCallback(base), { kind: 'entry' });
  assert.deepEqual(readAuthCallback(`${base}.html`), { kind: 'entry' });
  for (const suffix of ['?code=short', '?unknown=1', '?code=', '#unknown=1', '#access_token=incomplete']) {
    assert.equal(readAuthCallback(base + suffix).kind, 'error');
  }
});

test('쿼리와 해시의 만료 오류는 이메일 입력으로 돌아가지 않는다', () => {
  for (const suffix of ['?error_code=otp_expired', '#error=access_denied&error_code=otp_expired', `?code=${code}&error_code=otp_expired`]) {
    const callback = readAuthCallback(base + suffix);
    assert.equal(callback.kind, 'error');
    assert.match(callback.message, /이미 사용했거나 만료/);
  }
});

test('인증 제공자가 반환한 임의 오류 설명을 그대로 표시하지 않는다', () => {
  for (const suffix of ['?error=secret-value&error_description=private-secret', '#error_code=unknown&error_description=private-secret']) {
    const callback = readAuthCallback(base + suffix);
    assert.equal(callback.kind, 'error');
    assert.doesNotMatch(callback.message, /secret/);
  }
});

test('기존 웹 PKCE 링크와 정규화된 주소의 코드를 보존한다', () => {
  for (const path of [base, `${base}.html`]) {
    assert.deepEqual(readAuthCallback(`${path}?code=${code}`), { kind: 'pkce', code });
  }
});

test('네이티브 콜백은 코드가 있는 앱 복귀 경로만 허용한다', () => {
  assert.deepEqual(readAuthCallback(`${base}?target=native&code=${code}`), { kind: 'native', code });
  for (const suffix of ['?target=native', `?target=native&code=${code}&code=${code}`, `?target=native${fragment}`]) {
    assert.equal(readAuthCallback(base + suffix).kind, 'error');
  }
});

test('새 이메일 해시 링크는 별도의 확인 화면으로 분류한다', () => {
  const callback = readAuthCallback(base + fragment);
  assert.equal(callback.kind, 'email');
  assert.deepEqual(callback.tokens, { access_token: 'synthetic.access.token', refresh_token: 'synthetic-refresh-token' });
  assert.equal('user' in callback, false);
});

test('해시와 쿼리가 섞이거나 중복된 인증 정보는 실패 화면으로 보낸다', () => {
  for (const suffix of [`?code=${code}${fragment}`, `${fragment}&access_token=another-token`, `${fragment}&error=denied`, '?access_token=synthetic-access&refresh_token=synthetic-refresh&type=magiclink']) {
    assert.equal(readAuthCallback(base + suffix).kind, 'error');
  }
});
