import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountLinkInbox, readAccountCode, nativeAccountLink } from '../lib/account-links.mjs';
const code = 'b8c68781-f143-480c-9e5c-86fabbe352a9';
test('native callback is limited to the app authentication route', () => {
  assert.equal(readAccountCode(nativeAccountLink(code), { native: true }), code);
  for (const url of [`https://other.test/auth?code=${code}`, `com.scyl.app://elsewhere?code=${code}`, `com.scyl.app://auth/extra?code=${code}`, `com.scyl.app://user@auth?code=${code}`, `com.scyl.app://auth:123?code=${code}`]) assert.equal(readAccountCode(url, { native: true }), null);
});
test('duplicate, implicit-token, malformed and injectable callback values are rejected', () => {
  for (const url of [`https://scyl.test/auth?code=${code}&code=another`, 'https://scyl.test/auth#access_token=token', `https://scyl.test/auth?code=${code}#access_token=token`, 'https://scyl.test/auth?code=%3Cscript%3E', 'https://scyl.test/auth?code=short']) assert.equal(readAccountCode(url), null);
  assert.equal(nativeAccountLink('javascript:alert(1)'), null);
  assert.equal(readAccountCode(`https://scyl.test/auth?code=${code}`), code);
  for (const url of [`ftp://localhost/auth?code=${code}`, `https://scyl.test/auth?code=${code}&error=denied`, `https://scyl.test/auth?code=${code}&access_token=private`]) assert.equal(readAccountCode(url), null);
});

const tick = () => new Promise(resolve => setTimeout(resolve, 5));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
test('callback inbox preserves a native link during initial and foreground authentication checks', async () => {
  let state = { ready: false, busy: false }, calls = 0;
  const inbox = createAccountLinkInbox({ account: { getState: () => state, async completeLink(value) { assert.equal(value, code); calls++; return { ok: true }; } } });
  inbox.receive(code); await tick(); assert.equal(calls, 0);
  state = { ready: true, busy: true }; inbox.stateChanged(); await tick(); assert.equal(calls, 0);
  state = { ready: true, busy: false }; inbox.stateChanged(); await tick(); assert.equal(calls, 1);
  inbox.dispose();
});

test('warm and cold callbacks for the same link trigger only one exchange, including while in flight', async () => {
  const held = deferred(); let calls = 0;
  const inbox = createAccountLinkInbox({ account: { getState: () => ({ ready: true, busy: false }), async completeLink() { calls++; return held.promise; } } });
  assert.equal(inbox.receive(code), true); assert.equal(inbox.receive(code), false);
  await tick(); assert.equal(inbox.receive(code), false);
  held.resolve({ ok: true }); await tick(); assert.equal(inbox.receive(code), false);
  assert.equal(calls, 1); inbox.dispose();
});

test('a busy callback exchange remains queued until state changes instead of being marked completed', async () => {
  let calls = 0;
  const inbox = createAccountLinkInbox({ account: { getState: () => ({ ready: true, busy: false }), async completeLink() { calls++; return calls === 1 ? { ok: false, code: 'busy' } : { ok: true }; } } });
  inbox.receive(code); await tick(); assert.equal(calls, 1);
  await tick(); assert.equal(calls, 1);
  inbox.stateChanged(); await tick(); assert.equal(calls, 2);
  inbox.dispose();
});

test('failed exchanges report once and disposed inboxes never apply late results', async () => {
  const held = deferred(); let reports = 0;
  const inbox = createAccountLinkInbox({ account: { getState: () => ({ ready: true, busy: false }), completeLink: () => held.promise }, onResult() { reports++; } });
  inbox.receive(code); await tick(); inbox.dispose(); held.resolve({ ok: false, code: 'otp_expired' }); await tick();
  assert.equal(reports, 0); assert.equal(inbox.receive(code), false);
});

test('an explicit logout cancels queued links and prevents their late reauthentication', async () => {
  let state = { ready: false, busy: false }, calls = 0;
  const inbox = createAccountLinkInbox({ account: { getState: () => state, async completeLink() { calls++; return { ok: true }; } } });
  inbox.receive(code); inbox.cancelPending(); state = { ready: true, busy: false }; inbox.stateChanged(); await tick();
  assert.equal(calls, 0); assert.equal(inbox.receive(code), false); inbox.dispose();
});
