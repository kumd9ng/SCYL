import test from 'node:test';
import assert from 'node:assert/strict';
import { createFilePlaybackLifecycle } from '../lib/file-playback-lifecycle.mjs';
import { createNativeLifecycleController } from '../lib/native-lifecycle.mjs';
import { createAudioMixEngine } from '../lib/audio-engine.mjs';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = () => new Promise(resolve => setImmediate(resolve));
class Parameter {
  value = 0;
  setValueAtTime(value) { this.value = value; }
  setValueCurveAtTime() {}
  cancelScheduledValues() {}
  linearRampToValueAtTime(value) { this.value = value; }
}
class AudioNode {
  connect() {}
  disconnect() { this.disconnected = true; }
}
class AudioContextFake extends EventTarget {
  currentTime = 10; sampleRate = 48000; state = 'running';
  destination = new AudioNode(); sources = []; resumeCalls = 0;
  changeState(value) { this.state = value; this.dispatchEvent(new Event('statechange')); }
  resume() { this.resumeCalls++; this.changeState('running'); return Promise.resolve(); }
  createGain() { return Object.assign(new AudioNode(), { gain: new Parameter() }); }
  createBiquadFilter() { return Object.assign(new AudioNode(), { frequency: new Parameter(), Q: new Parameter() }); }
  createDelay() { return Object.assign(new AudioNode(), { delayTime: new Parameter() }); }
  createBufferSource() {
    const source = Object.assign(new AudioNode(), {
      playbackRate: new Parameter(), starts: [], stops: [], onended: null,
      start(time, offset) { this.starts.push({ time, offset }); },
      stop(time) { this.stops.push(time); },
    });
    this.sources.push(source); return source;
  }
}
const track = (id, bpm) => ({ id, buffer: { duration: 40, sampleRate: 48000, getChannelData: () => new Float32Array(1) },
  analysis: { duration: 40, bpm, beatOffset: 0, confidence: .95 } });
function fixture({ native = true, initial = async () => ({ isActive: true }) } = {}) {
  const context = new AudioContextFake(), registrations = [], removed = [], reasons = [], errors = [];
  const engine = createAudioMixEngine({ context, scheduleAhead: 0 });
  engine.setTracks([track('A', 120), track('B', 125)]);
  let hidden = false, imports = 0, intent = 0, wantsPlayback = false, pauseNotices = 0;
  const lifecycle = createFilePlaybackLifecycle({
    isNativePlatform: () => native, isHidden: () => hidden,
    createNativeController: options => createNativeLifecycleController({ ...options, loadApp: async () => {
      imports++;
      return {
        async addListener(event, callback) {
          const record = { event, callback, removed: false }; registrations.push(record);
          return { async remove() { record.removed = true; removed.push(record); } };
        },
        getState: initial,
      };
    } }),
    onInterrupt(reason) {
      reasons.push(reason); intent++; wantsPlayback = false;
      if (engine.snapshot().state === 'playing') engine.pause();
      if (engine.snapshot().state === 'paused') pauseNotices++;
    },
    onError: error => errors.push(error),
  });
  lifecycle.setContext(context);
  return {
    context, engine, lifecycle, registrations, removed, reasons, errors,
    emit(event, value) { registrations.filter(record => !record.removed && record.event === event).at(-1)?.callback(value); },
    hide(value) { hidden = value; lifecycle.visibilityChanged(); },
    play() { assert.equal(lifecycle.canPlay(), true); wantsPlayback = true; engine.play({ offset: 20 }); },
    get imports() { return imports; }, get intent() { return intent; }, get wantsPlayback() { return wantsPlayback; },
    get pauseNotices() { return pauseNotices; },
    async cleanup() { await lifecycle.dispose(); engine.dispose(); },
  };
}

test('native playback stays closed until listeners and initial state finish; web never loads App', async () => {
  const state = deferred(), native = fixture({ initial: () => state.promise });
  assert.equal(native.lifecycle.canRequestPlayback(), false);
  const first = native.lifecycle.start(), second = native.lifecycle.start();
  assert.strictEqual(first, second); await flush();
  assert.equal(native.registrations.length, 2); assert.equal(native.lifecycle.canPlay(), false);
  state.resolve({ isActive: true }); await first;
  assert.equal(native.lifecycle.canPlay(), true); assert.equal(native.imports, 1);
  assert.equal(native.context.sources.length, 0, 'Initialization must not start audio');
  await native.cleanup();
  const web = fixture({ native: false }); await web.lifecycle.start();
  assert.equal(web.lifecycle.canPlay(), true); assert.equal(web.imports, 0);
  await web.cleanup();
});

test('native background pauses an overlap at its current positions and foreground requires explicit resume', async () => {
  const f = fixture(); await f.lifecycle.start(); f.play();
  f.context.currentTime = 26.25;
  const before = f.engine.snapshot(), sources = [...f.context.sources];
  f.emit('pause');
  assert.equal(f.lifecycle.canPlay(), false); assert.equal(f.engine.snapshot().state, 'paused');
  assert.deepEqual(f.engine.snapshot().decks.map(deck => deck.position), before.decks.map(deck => deck.position));
  assert.ok(sources.every(source => source.stops.at(-1) === 26.25 && source.onended === null));
  assert.equal(f.wantsPlayback, false);
  f.emit('appStateChange', { isActive: true });
  assert.equal(f.lifecycle.canPlay(), true); assert.equal(f.engine.snapshot().state, 'paused');
  assert.equal(f.context.sources.length, 2); assert.equal(f.context.resumeCalls, 0);
  f.context.currentTime = 80; await f.context.resume(); f.engine.resume();
  assert.deepEqual(f.engine.snapshot().decks.map(deck => deck.position), before.decks.map(deck => deck.position));
  assert.equal(f.context.sources.length, 4);
  await f.cleanup();
});

test('Safari interrupted/suspended pauses preserve positions and running never resumes sources', async () => {
  for (const interruption of ['interrupted', 'suspended']) {
    const f = fixture({ native: false }); await f.lifecycle.start(); f.play();
    f.context.currentTime = 25;
    const before = f.engine.snapshot();
    f.context.changeState(interruption);
    assert.equal(f.engine.snapshot().state, 'paused'); assert.equal(f.wantsPlayback, false);
    assert.deepEqual(f.engine.snapshot().decks.map(deck => deck.position), before.decks.map(deck => deck.position));
    assert.equal(f.lifecycle.canPlay(), false);
    assert.equal(f.lifecycle.canRequestPlayback(), true, 'A visible user may request context.resume');
    const intents = f.intent;
    f.context.dispatchEvent(new Event('statechange'));
    assert.equal(f.intent, intents, 'Repeated identical state does not create another interruption');
    f.context.changeState('running'); f.context.currentTime = 100;
    assert.equal(f.engine.snapshot().state, 'paused'); assert.equal(f.context.sources.length, 2);
    assert.deepEqual(f.engine.snapshot().decks.map(deck => deck.position), before.decks.map(deck => deck.position));
    assert.equal(f.context.resumeCalls, 0); assert.equal(f.pauseNotices, 1);
    await f.cleanup();
  }
});

test('natural end and user stop are not relabelled as resumable audio interruptions', async () => {
  for (const terminalState of ['ended', 'stopped']) {
    const f = fixture({ native: false }); await f.lifecycle.start(); f.play();
    if (terminalState === 'ended') { f.context.currentTime = 100; f.engine.snapshot(); }
    else f.engine.stop();
    const sourceCount = f.context.sources.length;
    assert.equal(f.engine.snapshot().state, terminalState);
    f.context.changeState('suspended'); f.context.changeState('running');
    assert.equal(f.engine.snapshot().state, terminalState); assert.equal(f.pauseNotices, 0);
    assert.equal(f.context.sources.length, sourceCount);
    await f.cleanup();
  }
});

test('hidden state cancels a pending resume intent and showing the page does not restart audio', async () => {
  const f = fixture({ native: false }); await f.lifecycle.start(); f.play(); f.engine.pause();
  const intentBeforeAwait = f.intent;
  f.hide(true);
  assert.notEqual(f.intent, intentBeforeAwait); assert.equal(f.lifecycle.canRequestPlayback(), false);
  f.hide(false); f.context.changeState('running');
  assert.equal(f.lifecycle.canRequestPlayback(), true); assert.equal(f.engine.snapshot().state, 'paused');
  assert.equal(f.context.sources.length, 2); assert.equal(f.wantsPlayback, false);
  await f.cleanup();
});

test('pagehide releases owned listeners; persisted restore rechecks native state without autoplay', async () => {
  const f = fixture(); await f.lifecycle.start(); f.play();
  const oldCallbacks = f.registrations.map(record => record.callback);
  const contextListener = () => {};
  f.context.addEventListener('statechange', contextListener);
  await f.lifecycle.stop();
  assert.equal(f.removed.length, 2); assert.equal(f.lifecycle.canPlay(), false);
  const count = f.reasons.length;
  f.context.changeState('interrupted'); assert.equal(f.reasons.length, count, 'Stopped adapter detached its context listener');
  await f.lifecycle.start();
  assert.equal(f.registrations.length, 4);
  oldCallbacks[0]({ isActive: false }); oldCallbacks[1]();
  assert.equal(f.lifecycle.getState().isActive, true, 'Old callbacks cannot close the replacement gate');
  f.context.changeState('running');
  assert.equal(f.lifecycle.canPlay(), true); assert.equal(f.engine.snapshot().state, 'paused');
  assert.equal(f.context.sources.length, 2); assert.equal(f.context.resumeCalls, 0);
  await f.cleanup();
});

test('native startup failure is reported once and cannot enable playback', async () => {
  const failure = new Error('App state unavailable');
  const f = fixture({ initial: async () => { throw failure; } });
  await assert.rejects(f.lifecycle.start(), error => error === failure);
  assert.equal(f.lifecycle.canRequestPlayback(), false); assert.equal(f.lifecycle.getState().failed, true);
  assert.deepEqual(f.errors, [failure]); assert.equal(f.removed.length, 2);
  f.context.changeState('suspended'); f.context.changeState('running');
  assert.equal(f.lifecycle.canPlay(), false);
  await f.cleanup();
});

test('pagehide during native initialization cannot reopen playback with a late active result', async () => {
  const state = deferred(), f = fixture({ initial: () => state.promise });
  const starting = f.lifecycle.start(); const rejected = assert.rejects(starting, { name: 'AbortError' });
  await flush(); const stopping = f.lifecycle.stop(); await flush();
  state.resolve({ isActive: true }); await rejected; await stopping;
  assert.equal(f.lifecycle.canPlay(), false); assert.equal(f.lifecycle.getState().ready, false);
  assert.equal(f.removed.length, 2); assert.equal(f.context.sources.length, 0);
  await f.cleanup();
});

test('a closed context blocks user playback requests and never changes itself back to running', async () => {
  const f = fixture({ native: false }); await f.lifecycle.start(); f.play();
  f.context.changeState('closed');
  assert.equal(f.lifecycle.canRequestPlayback(), false); assert.equal(f.engine.snapshot().state, 'paused');
  assert.equal(f.context.resumeCalls, 0);
  await f.cleanup();
});
