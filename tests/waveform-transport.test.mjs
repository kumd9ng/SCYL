import test from 'node:test';
import assert from 'node:assert/strict';
import { createWaveformTransport, waveformDragPosition, waveformKeyPosition } from '../lib/waveform-transport.mjs';
import { createAudioMixEngine } from '../lib/audio-engine.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
class Parameter {
  value = 0;
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  setValueCurveAtTime() {}
  cancelScheduledValues() {}
}
class AudioNode { connect() {} disconnect() { this.disconnected = true; } }
function fakeContext() {
  return {
    currentTime: 10, sampleRate: 48000, state: 'running', destination: new AudioNode(), sources: [],
    createGain() { return Object.assign(new AudioNode(), { gain: new Parameter() }); },
    createBiquadFilter() { return Object.assign(new AudioNode(), { frequency: new Parameter(), Q: new Parameter() }); },
    createDelay() { return Object.assign(new AudioNode(), { delayTime: new Parameter() }); },
    createBufferSource() {
      const source = Object.assign(new AudioNode(), { playbackRate: new Parameter(), starts: [], stops: [], onended: null,
        start(time, offset) { this.starts.push({ time, offset }); }, stop(time) { this.stops.push(time); } });
      this.sources.push(source); return source;
    },
  };
}
class WaveElement extends EventTarget {
  classList = { values: new Set(), add(value) { this.values.add(value); }, remove(value) { this.values.delete(value); } };
  captures = new Set();
  getBoundingClientRect() { return { width: 240 }; }
  focus() {}
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); this.pointer('lostpointercapture', 0, 0, id); }
  pointer(type, x = 100, y = 20, pointerId = 1) {
    const event = Object.assign(new Event(type, { cancelable: true }), { clientX: x, clientY: y, pointerId, pointerType: 'touch', isPrimary: true, button: 0 });
    this.dispatchEvent(event); return event;
  }
  key(key) { const event = Object.assign(new Event('keydown', { cancelable: true }), { key }); this.dispatchEvent(event); return event; }
}
const track = (id, bpm) => ({ id, buffer: { duration: 40, sampleRate: 48000, getChannelData: () => new Float32Array(1) }, analysis: { duration: 40, bpm, beatOffset: 0, confidence: .95 } });
function fixture({ playing = false, resumeGate = null, onAdvance } = {}) {
  const context = fakeContext(), element = new WaveElement(), errors = [], changes = [], resumes = [];
  const engine = createAudioMixEngine({ context, scheduleAhead: 0, onAdvance });
  engine.setTracks([track('A', 120), track('B', 125)]);
  if (playing) { engine.play({ offset: 20 }); context.currentTime = 26; }
  let identity = 'A-B', allowed = true, begins = 0;
  const transport = createWaveformTransport({
    element, getEngine: () => engine, getIdentity: () => identity, canSeek: () => allowed,
    prepare: target => target.prepare(), onBegin: () => { begins++; },
    onChange: value => changes.push(value), onError: error => errors.push(error),
    async onResume(target, isCurrent) {
      const record = { current: false }; resumes.push(record);
      if (resumeGate) await resumeGate.promise;
      if (isCurrent()) { record.current = true; target.resume(); }
    },
  });
  return { context, element, engine, transport, errors, changes, resumes,
    get begins() { return begins; }, replaceIdentity() { identity = 'new-pair'; }, block() { allowed = false; transport.cancel(); },
    dispose() { transport.dispose(); engine.dispose(); } };
}
function drag(f, delta, id = 1) {
  f.element.pointer('pointerdown', 100, 20, id);
  f.element.pointer('pointermove', 100 + delta, 20, id);
  f.element.pointer('pointerup', 100 + delta, 20, id);
}

test('left/right movement uses the visible CSS width and the same 24-second view as the curve', () => {
  near(waveformDragPosition({ position: 10, deltaX: -50, width: 240, duration: 70 }), 15);
  near(waveformDragPosition({ position: 10, deltaX: 50, width: 240, duration: 70 }), 5);
  near(waveformDragPosition({ position: 10, deltaX: -100, width: 480, duration: 70 }), 15);
  near(waveformDragPosition({ position: 2, deltaX: 500, width: 240, duration: 70 }), 0);
  near(waveformDragPosition({ position: 68, deltaX: -500, width: 240, duration: 70 }), 70);
  assert.throws(() => waveformDragPosition({ position: 1, deltaX: 1, width: 0, duration: 10 }), RangeError);
});

test('keyboard steps five seconds and Home/End stay within the pair timeline', () => {
  assert.equal(waveformKeyPosition({ key: 'ArrowRight', position: 3, duration: 40 }), 8);
  assert.equal(waveformKeyPosition({ key: 'ArrowLeft', position: 3, duration: 40 }), 0);
  assert.equal(waveformKeyPosition({ key: 'Home', position: 25, duration: 40 }), 0);
  assert.equal(waveformKeyPosition({ key: 'End', position: 25, duration: 40 }), 40);
  assert.equal(waveformKeyPosition({ key: 'Enter', position: 25, duration: 40 }), null);
});

test('dragging before first playback prepares and seeks real engine positions without creating sources', async () => {
  const f = fixture();
  drag(f, -50); await flush();
  near(f.engine.snapshot().position, 5); near(f.engine.snapshot().decks[0].position, 5);
  assert.equal(f.engine.snapshot().state, 'paused'); assert.equal(f.context.sources.length, 0);
  drag(f, 20); await flush();
  near(f.engine.snapshot().position, 3); assert.equal(f.context.sources.length, 0); assert.equal(f.resumes.length, 0);
  assert.deepEqual(f.errors, []); f.dispose();
});

test('overlap drag seeks both real source offsets together and resumes their original tempo ratio', async () => {
  const f = fixture({ playing: true });
  const before = f.engine.snapshot(), old = [...f.context.sources];
  f.element.pointer('pointerdown'); f.element.pointer('pointermove', 80);
  const preview = f.engine.snapshot();
  assert.equal(preview.state, 'paused'); near(preview.position, before.position + 2);
  near(preview.decks[0].position, before.decks[0].position + 2);
  near(preview.decks[1].position, before.decks[1].position + 2 * .96);
  assert.ok(preview.decks.every(deck => deck.gain === 0)); assert.equal(f.transport.isSeeking(), true);
  assert.ok(old.every(source => source.disconnected));
  f.element.pointer('pointerup', 80); await flush();
  const resumed = f.engine.snapshot();
  assert.equal(resumed.state, 'playing'); near(resumed.position, preview.position);
  near(f.context.sources[2].starts[0].offset, preview.decks[0].position);
  near(f.context.sources[3].starts[0].offset, preview.decks[1].position);
  near(f.context.sources[3].playbackRate.value, .96);
  assert.ok(resumed.decks.every(deck => deck.gain > 0));
  drag(f, 10); await flush();
  near(f.engine.snapshot().position, preview.position - 1); assert.equal(f.engine.snapshot().state, 'playing');
  assert.deepEqual(f.errors, []); f.dispose();
});

test('vertical scrolling and sub-threshold movement do not pause or seek audio', () => {
  const f = fixture({ playing: true }), before = f.engine.snapshot();
  f.element.pointer('pointerdown');
  assert.equal(f.element.pointer('pointermove', 104, 22).defaultPrevented, false);
  assert.equal(f.element.pointer('pointermove', 104, 40).defaultPrevented, false);
  f.element.pointer('pointerup', 104, 40);
  assert.equal(f.begins, 0); assert.equal(f.engine.snapshot().state, 'playing');
  near(f.engine.snapshot().position, before.position); assert.equal(f.context.sources.length, 2);
  f.dispose();
});

test('pointer cancellation leaves the selected position paused and ignores a late pointerup', async () => {
  const f = fixture({ playing: true });
  f.element.pointer('pointerdown'); f.element.pointer('pointermove', 80);
  const selected = f.engine.snapshot().position;
  f.element.pointer('pointercancel'); f.element.pointer('pointerup', 40); await flush();
  assert.equal(f.engine.snapshot().state, 'paused'); near(f.engine.snapshot().position, selected);
  assert.equal(f.resumes.length, 0); assert.equal(f.transport.isSeeking(), false);
  f.dispose();
});

test('stop or native/visibility interruption invalidates an outstanding gesture resume', async () => {
  for (const stop of [true, false]) {
    const gate = deferred(), f = fixture({ playing: true, resumeGate: gate });
    drag(f, -10); assert.equal(f.resumes.length, 1);
    if (stop) { f.transport.cancel(); f.engine.stop(); }
    else f.block();
    gate.resolve(); await flush();
    assert.equal(f.resumes[0].current, false); assert.equal(f.context.sources.length, 2);
    assert.equal(f.engine.snapshot().state, stop ? 'stopped' : 'paused'); f.dispose();
  }
});

test('replacing the track identity during dragging prevents late seeks or playback', async () => {
  const f = fixture({ playing: true });
  f.element.pointer('pointerdown'); f.element.pointer('pointermove', 80);
  const selected = f.engine.snapshot().position;
  f.replaceIdentity(); f.element.pointer('pointermove', 40); f.element.pointer('pointerup', 40); await flush();
  near(f.engine.snapshot().position, selected); assert.equal(f.engine.snapshot().state, 'paused');
  assert.equal(f.resumes.length, 0); assert.equal(f.transport.isSeeking(), false); f.dispose();
});

test('a second fast drag retains playback intent but only its final resume may run', async () => {
  const gate = deferred(), f = fixture({ playing: true, resumeGate: gate });
  drag(f, -10); drag(f, 10, 2);
  assert.equal(f.resumes.length, 2); near(f.engine.snapshot().position, 16);
  gate.resolve(); await flush();
  assert.deepEqual(f.resumes.map(record => record.current), [false, true]);
  assert.equal(f.context.sources.length, 4); assert.equal(f.engine.snapshot().state, 'playing'); f.dispose();
});

test('keyboard seeking stays silent while paused; End stops and Home returns without autoplay', async () => {
  const f = fixture();
  assert.equal(f.element.key('ArrowRight').defaultPrevented, true); await flush();
  near(f.engine.snapshot().position, 5); assert.equal(f.context.sources.length, 0);
  f.element.key('End'); await flush(); assert.equal(f.engine.snapshot().state, 'ended');
  near(f.engine.snapshot().position, f.engine.snapshot().duration);
  f.element.key('Home'); await flush(); near(f.engine.snapshot().position, 0);
  assert.equal(f.engine.snapshot().state, 'paused'); assert.equal(f.resumes.length, 0); f.dispose();
});

test('seeking beyond the fade while paused promotes only once after an explicit playing gesture resumes', async () => {
  let advances = 0;
  const f = fixture({ playing: true, onAdvance: () => { advances++; } });
  drag(f, -50); await flush();
  assert.equal(f.engine.snapshot().state, 'playing'); near(f.engine.snapshot().position, 21);
  assert.equal(advances, 1); f.engine.snapshot(); assert.equal(advances, 1);
  assert.equal(f.engine.snapshot().decks[0].ended, true); assert.equal(f.engine.snapshot().decks[1].playing, true);
  f.dispose();
});
