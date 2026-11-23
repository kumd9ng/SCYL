import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeLifecycleController } from '../lib/native-lifecycle.mjs';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture({ getState = async () => ({ isActive: true }), add, remove } = {}) {
  const records = { registrations: [], removed: [], active: [], pauses: [], errors: [], loads: 0, stateReads: 0 };
  const app = {
    async addListener(event, callback) {
      const entry = { event, callback, index: records.registrations.length };
      records.registrations.push(entry);
      const handle = { async remove() { records.removed.push(entry.index); await remove?.(entry); } };
      return add ? await add(entry, handle) : handle;
    },
    async getState() { records.stateReads++; return await getState(); },
    removeAllListeners() { throw new Error('Global listener removal is forbidden'); },
  };
  const controller = createNativeLifecycleController({
    isNativePlatform: () => true,
    loadApp: async () => { records.loads++; return app; },
    onActiveChange: value => { records.active.push(value); },
    onPause: reason => { records.pauses.push(reason); },
    onError: error => { records.errors.push(error); },
  });
  const emit = (event, value) => records.registrations.filter(entry => entry.event === event).at(-1)?.callback(value);
  return { controller, records, emit, app };
}

test('web lifecycle never imports the native plugin or calls native callbacks', async () => {
  const forbidden = () => { throw new Error('Unexpected native work'); };
  const controller = createNativeLifecycleController({ isNativePlatform: () => false, loadApp: forbidden, onActiveChange: forbidden, onPause: forbidden });
  assert.equal(controller.getState().ready, false);
  assert.deepEqual(await controller.start(), { status: 'web', ready: true, isActive: true });
  assert.deepEqual(await controller.dispose(), { status: 'disposed', ready: false, isActive: false });
});

test('native startup is gated until subscriptions and state finish, without duplicate listeners', async () => {
  const state = deferred();
  const { controller, records, emit } = fixture({ getState: () => state.promise });
  const first = controller.start(), second = controller.start();
  assert.strictEqual(first, second);
  await flush();
  assert.deepEqual(records.registrations.map(entry => entry.event), ['appStateChange', 'pause']);
  assert.deepEqual(controller.getState(), { status: 'pending', ready: false, isActive: false });
  state.resolve({ isActive: true }); await first;
  assert.deepEqual(controller.getState(), { status: 'ready', ready: true, isActive: true });
  emit('appStateChange', { isActive: false });
  emit('pause');
  assert.equal(controller.getState().isActive, false);
  assert.deepEqual(records.pauses, ['appStateChange', 'pause']);
  emit('appStateChange', { isActive: true });
  assert.deepEqual(records.active, [true, false, true]);
  assert.deepEqual(records.pauses, ['appStateChange', 'pause'], 'foregrounding never requests playback');
  await controller.start();
  assert.equal(records.loads, 1); assert.equal(records.registrations.length, 2);
  await controller.dispose();
  assert.deepEqual(records.removed, [0, 1]);
});

test('a pause arriving during getState wins over an older active snapshot', async () => {
  const state = deferred();
  const { controller, records, emit } = fixture({ getState: () => state.promise });
  const starting = controller.start(); await flush();
  emit('pause'); state.resolve({ isActive: true });
  assert.deepEqual(await starting, { status: 'ready', ready: true, isActive: false });
  assert.deepEqual(records.active, [false]); assert.deepEqual(records.pauses, ['pause']);
  await controller.dispose();
});

test('partial registration failure rejects, cleans owned handles, and permits a fresh retry', async () => {
  const failure = new Error('Native listener registration failed');
  const { controller, records, emit } = fixture({ add: async (entry, handle) => {
    if (entry.index === 1) throw failure;
    return handle;
  } });
  await assert.rejects(controller.start(), error => error === failure);
  assert.deepEqual(records.errors, [failure], 'initialization failure is reported once as well as rejected');
  assert.deepEqual(controller.getState(), { status: 'failed', ready: false, isActive: false });
  assert.deepEqual(records.removed, [0]); assert.equal(records.stateReads, 0);
  const retired = records.registrations[0].callback;
  await controller.start();
  retired({ isActive: false });
  assert.equal(controller.getState().isActive, true, 'failed attempt cannot change the replacement state');
  emit('pause'); assert.equal(controller.getState().isActive, false);
  await controller.dispose();
  assert.deepEqual(records.removed, [0, 2, 3]);
});

test('failed or invalid initial state cannot open playback and removes both subscriptions', async () => {
  for (const getState of [async () => { throw new Error('Bridge unavailable'); }, async () => ({ isActive: 'yes' })]) {
    const { controller, records } = fixture({ getState });
    await assert.rejects(controller.start());
    assert.equal(records.errors.length, 1);
    assert.deepEqual(controller.getState(), { status: 'failed', ready: false, isActive: false });
    assert.deepEqual(records.removed, [0, 1]);
    records.registrations[0].callback({ isActive: true });
    assert.equal(controller.getState().isActive, false);
  }
});

test('initialization and cleanup failures are surfaced together without a false ready result', async () => {
  const first = new Error('Initial state failed'), second = new Error('Remove failed');
  const { controller, records } = fixture({
    getState: async () => { throw first; },
    remove: async entry => { if (entry.index === 0) throw second; },
  });
  await assert.rejects(controller.start(), error => error instanceof AggregateError && error.errors[0] === first && error.errors[1] === second);
  assert.equal(records.errors.length, 1);
  assert(records.errors[0] instanceof AggregateError);
  assert.deepEqual(controller.getState(), { status: 'failed', ready: false, isActive: false });
});

test('disposal during asynchronous registration removes the late handle and does not continue startup', async () => {
  const registration = deferred();
  const { controller, records } = fixture({ add: async (_entry, handle) => { await registration.promise; return handle; } });
  const starting = controller.start();
  const rejected = assert.rejects(starting, { name: 'AbortError' });
  await flush();
  const disposing = controller.dispose();
  assert.strictEqual(controller.dispose(), disposing);
  assert.equal(controller.getState().ready, false);
  registration.resolve(); await rejected; await disposing;
  assert.deepEqual(records.removed, [0]); assert.equal(records.registrations.length, 1); assert.equal(records.stateReads, 0);
  records.registrations[0].callback({ isActive: true });
  assert.deepEqual(controller.getState(), { status: 'disposed', ready: false, isActive: false });
  await assert.rejects(controller.start(), { name: 'AbortError' });
});

test('listener removal failures are reported and retired callbacks remain inert', async () => {
  const { controller, records } = fixture({ remove: async entry => { if (entry.index === 0) throw new Error('Removal failed'); } });
  await controller.start();
  await assert.rejects(controller.dispose(), error => error instanceof AggregateError && error.errors[0].message === 'Removal failed');
  assert.deepEqual(records.removed, [0, 1]);
  records.registrations[0].callback({ isActive: true });
  assert.deepEqual(controller.getState(), { status: 'disposed', ready: false, isActive: false });
});

test('malformed native events fail closed and surface an error instead of enabling playback', async () => {
  const { controller, records, emit } = fixture();
  await controller.start(); emit('appStateChange', {}); await flush();
  assert.deepEqual(controller.getState(), { status: 'failed', ready: false, isActive: false });
  assert.equal(records.errors.length, 1); assert.match(records.errors[0].message, /invalid activity state/);
  assert(records.pauses.includes('error')); assert.deepEqual(records.removed, [0, 1]);
});

test('a consumer callback rejection is caught and closes the native gate', async () => {
  let callback, reported;
  const failure = new Error('Consumer failed');
  const controller = createNativeLifecycleController({
    isNativePlatform: () => true,
    loadApp: async () => ({
      async addListener(event, listener) { if (event === 'appStateChange') callback = listener; return { async remove() {} }; },
      async getState() { return { isActive: false }; },
    }),
    onActiveChange: active => active ? Promise.reject(failure) : undefined,
    onError: error => { reported = error; },
  });
  await controller.start(); callback({ isActive: true }); await flush();
  assert.strictEqual(reported, failure);
  assert.deepEqual(controller.getState(), { status: 'failed', ready: false, isActive: false });
  await controller.dispose();
});
