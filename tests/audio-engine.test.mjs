import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioMixEngine } from '../lib/audio-engine.mjs';

class Parameter {
  value = 0;
  events = [];
  setValueAtTime(value, time) { this.value = value; this.events.push({ type: 'set', value, time }); }
  linearRampToValueAtTime(value, time) { this.value = value; this.events.push({ type: 'ramp', value, time }); }
  setValueCurveAtTime(values, time, duration) { this.events.push({ type: 'curve', values, time, duration }); }
  cancelScheduledValues(time) { this.events.push({ type: 'cancel', time }); }
}
class Node {
  connections = [];
  disconnected = false;
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.disconnected = true; this.connections = []; }
}
class Source extends Node {
  playbackRate = new Parameter();
  starts = [];
  stops = [];
  onended = null;
  constructor(context) { super(); this.context = context; }
  start(time, offset) {
    if (this.context.failStart) { this.context.failStart = false; throw new Error('Injected start failure'); }
    assert.equal(this.starts.length, 0, 'An AudioBufferSourceNode cannot restart');
    this.starts.push({ time, offset });
  }
  stop(time) { this.stops.push(time); }
}
function fakeContext() {
  return {
    currentTime: 10, sampleRate: 48000, state: 'running', destination: new Node(),
    sources: [], gains: [], filters: [], delays: [],
    createBufferSource() { const node = new Source(this); this.sources.push(node); return node; },
    createGain() { const node = Object.assign(new Node(), { gain: new Parameter() }); this.gains.push(node); return node; },
    createBiquadFilter() { const node = Object.assign(new Node(), { frequency: new Parameter(), Q: new Parameter() }); this.filters.push(node); return node; },
    createDelay() { const node = Object.assign(new Node(), { delayTime: new Parameter() }); this.delays.push(node); return node; },
    resume() { assert.fail('The caller owns context resume'); },
    suspend() { assert.fail('The caller owns context suspension'); },
    close() { assert.fail('The caller owns context disposal'); },
  };
}
function track(id, bpm = 120, duration = 40, confidence = .95) {
  return { id, title: id, buffer: { duration, sampleRate: 48000, getChannelData: () => new Float32Array(1) },
    analysis: { duration, bpm, beatOffset: 0, confidence } };
}
function setup(options = {}) {
  const context = fakeContext();
  const engine = createAudioMixEngine({ context, scheduleAhead: 0, ...options });
  engine.setTracks([track('A'), track('B', 125)]);
  engine.play({ offset: 20, fadeDuration: 8 });
  return { context, engine };
}
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const tenPercent = Object.freeze({ overlapRatio: .1, beatmatch: false });

test('10% mode schedules two original-speed sources and an equal-power 18-second overlap for a 3-minute file', () => {
  const context = fakeContext(), engine = createAudioMixEngine({ context, scheduleAhead: 0 });
  engine.setTracks([track('A', 120, 180), track('B', 126, 120)]);
  const started = engine.play(tenPercent);
  near(started.plan.outgoingPosition, 162); near(started.plan.fadeDuration, 18);
  assert.deepEqual(context.sources[0].starts, [{ time: 10, offset: 0 }]);
  assert.deepEqual(context.sources[1].starts, [{ time: 172, offset: 0 }]);
  assert.ok(context.sources.every(source => source.playbackRate.value === 1));
  const curves = context.gains.flatMap(node => node.gain.events.filter(event => event.type === 'curve'));
  assert.equal(curves.length, 2);
  assert.ok(curves.every(curve => curve.time === 172 && curve.duration === 18));
  near(curves[0].values[64] ** 2 + curves[1].values[64] ** 2, 1, 1e-6);
  context.currentTime = 181;
  const before = engine.snapshot();
  near(before.decks[0].position, 171); near(before.decks[1].position, 9);
  before.decks.forEach(deck => near(deck.gain, Math.SQRT1_2));
  engine.pause(); context.currentTime = 300;
  const resumed = engine.resume();
  resumed.decks.forEach((deck, index) => {
    near(deck.position, before.decks[index].position); near(deck.rate, 1);
    near(deck.gain, Math.SQRT1_2);
    near(context.sources[index + 2].starts[0].offset, before.decks[index].position);
  });
  near(context.sources[2].stops[0], 309);
  engine.pause(); const preview = engine.seek(160);
  assert.equal(preview.decks[1].started, false);
  context.currentTime = 400; engine.resume();
  assert.deepEqual(context.sources.at(-1).starts, [{ time: 402, offset: 0 }]);
  engine.dispose();
});

test('10% queue promotion retains the live source and uses each new current file full duration', () => {
  const context = fakeContext(), engine = createAudioMixEngine({ context, scheduleAhead: 0 });
  engine.setTracks([track('A', 120, 180), track('B', 126, 120)]); engine.play(tenPercent);
  const retained = context.sources[1], priorStops = retained.stops.length;
  context.currentTime = 190;
  const promoted = engine.queueNext(null);
  near(promoted.decks[0].position, 18); near(promoted.decks[0].rate, 1);
  assert.equal(retained.starts.length, 1); assert.equal(retained.stops.length, priorStops);
  context.currentTime = 195;
  const queued = engine.queueNext(track('C', 80, 90), tenPercent);
  near(queued.plan.outgoingPosition, 108); near(queued.plan.fadeDuration, 12);
  near(queued.plan.startTime, 280); near(queued.plan.endTime, 292);
  assert.deepEqual(context.sources[2].starts, [{ time: 280, offset: 0 }]);
  near(context.sources[2].playbackRate.value, 1);
  assert.equal(retained.starts.length, 1); assert.equal(retained.disconnected, false);
  engine.dispose();
});

test('10% mode handles a late queued file and a very short next file without overrunning the outgoing source', () => {
  const context = fakeContext(), engine = createAudioMixEngine({ context, scheduleAhead: 0 });
  engine.setTracks([track('A', 120, 180)]); engine.play({ ...tenPercent, offset: 170 });
  context.currentTime = 12;
  const late = engine.queueNext(track('B', 126, 120), tenPercent);
  assert.equal(late.plan.reason, 'late-start'); near(late.plan.fadeDuration, 8);
  near(late.plan.startTime, 12); near(late.plan.endTime, 20);
  near(context.sources[0].stops.at(-1), 20); near(context.sources[1].playbackRate.value, 1);
  engine.setTracks([track('C', 120, 180), track('D', 126, 2)]);
  const short = engine.play(tenPercent);
  assert.equal(short.plan.reason, 'incoming-short'); near(short.plan.fadeDuration, 2);
  near(short.plan.outgoingPosition, 178); near(short.plan.endTime, 192);
  context.currentTime = 192;
  const promoted = engine.queueNext(null);
  assert.equal(promoted.state, 'ended'); near(promoted.decks[0].position, 2);
  engine.setTracks([track('E')]); assert.equal(engine.play(tenPercent).state, 'playing');
  engine.dispose();
});

test('invalid overlap ratios do not disrupt a playing pair', () => {
  const { context, engine } = setup();
  assert.throws(() => engine.prepare({ overlapRatio: NaN }), /ratio/);
  assert.throws(() => engine.queueNext(track('C'), { overlapRatio: 2 }), /ratio/);
  assert.equal(engine.snapshot().state, 'playing');
  assert.ok(context.sources.every(source => !source.disconnected));
  engine.dispose();
});

test('schedules actual simultaneous sources, playback rate and equal-power gain curves', () => {
  const { context, engine } = setup();
  assert.deepEqual(context.sources[0].starts, [{ time: 10, offset: 20 }]);
  assert.deepEqual(context.sources[1].starts, [{ time: 22, offset: 0 }]);
  near(context.sources[1].playbackRate.value, .96);
  assert.equal(context.sources[0].stops[0], 30);
  const curves = context.gains.flatMap(node => node.gain.events.filter(event => event.type === 'curve'));
  assert.equal(curves.length, 2);
  assert.ok(curves.every(curve => curve.time === 22 && curve.duration === 8));
  near(curves[0].values[64] ** 2 + curves[1].values[64] ** 2, 1, 1e-6);
  context.currentTime = 26;
  const snapshot = engine.snapshot();
  near(snapshot.decks[0].position, 36); near(snapshot.decks[1].position, 3.84);
  near(snapshot.decks[0].gain, Math.SQRT1_2); near(snapshot.decks[1].gain, Math.SQRT1_2);
  assert.equal(snapshot.pitchPreserved, false);
  engine.dispose();
});

test('pause/resume midway through overlap preserves source positions, rates and remaining curves', () => {
  const { context, engine } = setup();
  context.currentTime = 26.25;
  const before = engine.snapshot();
  const old = [...context.sources];
  const paused = engine.pause();
  assert.equal(paused.state, 'paused');
  assert.ok(paused.decks.every(deck => deck.gain === 0));
  assert.ok(old.every(source => source.stops.at(-1) === 26.25 && source.disconnected && source.onended === null));
  context.currentTime = 80;
  assert.deepEqual(engine.snapshot().decks.map(deck => deck.position), before.decks.map(deck => deck.position));
  const resumed = engine.resume();
  assert.equal(resumed.state, 'playing');
  assert.equal(context.sources.length, 4);
  resumed.decks.forEach((deck, index) => {
    near(deck.position, before.decks[index].position);
    near(context.sources[index + 2].starts[0].offset, before.decks[index].position);
    near(deck.rate, before.decks[index].rate);
    near(deck.envelopeGain, before.decks[index].envelopeGain);
  });
  near(context.sources[2].stops[0], 83.75);
  engine.resume(); assert.equal(context.sources.length, 4, 'Resume is idempotent while playing');
  engine.dispose();
});

test('seeking cancels scheduled incoming source and recreates only still-live decks', () => {
  const { context, engine } = setup();
  const oldIncoming = context.sources[1];
  context.currentTime = 15;
  const moved = engine.seek(16);
  assert.equal(oldIncoming.stops.at(-1), 15); assert.equal(oldIncoming.onended, null);
  near(moved.decks[0].position, 36); near(moved.decks[1].position, 3.84);
  engine.pause(); engine.seek(25);
  const count = context.sources.length;
  context.currentTime = 60; engine.resume();
  assert.equal(context.sources.length, count + 1, 'Ended outgoing deck must not restart');
  near(context.sources.at(-1).starts[0].offset, 12.48);
  near(context.sources.at(-1).playbackRate.value, .96);
  engine.dispose();
});

test('preparing and scrubbing a pair is silent until explicit resume starts the selected overlap', () => {
  const context = fakeContext(); context.state = 'suspended';
  const engine = createAudioMixEngine({ context, scheduleAhead: 0 });
  engine.setTracks([track('A'), track('B', 125)]);
  const ready = engine.prepare({ fadeDuration: 8 });
  assert.equal(ready.state, 'paused'); assert.equal(context.sources.length, 0);
  assert.ok(ready.duration > 40);
  const midpoint = ready.plan.startTime - context.currentTime + ready.plan.fadeDuration / 2;
  const preview = engine.seek(midpoint);
  assert.equal(context.sources.length, 0); assert.equal(preview.state, 'paused');
  near(preview.decks[0].position, 36); near(preview.decks[1].position, 3.84);
  assert.ok(preview.decks.every(deck => deck.gain === 0));
  context.state = 'running'; context.currentTime = 80;
  const resumed = engine.resume();
  assert.equal(context.sources.length, 2);
  resumed.decks.forEach((deck, index) => {
    near(context.sources[index].starts[0].offset, preview.decks[index].position);
    near(deck.rate, preview.decks[index].rate); near(deck.gain, Math.SQRT1_2);
  });
  engine.dispose();
});

test('seeking across the transition while paused promotes exactly once on explicit resume', () => {
  const context = fakeContext(); let advances = 0;
  const engine = createAudioMixEngine({ context, scheduleAhead: 0, onAdvance() { advances++; engine.queueNext(null); } });
  engine.setTracks([track('A'), track('B', 125)]); engine.prepare();
  const plan = engine.snapshot().plan;
  const target = plan.endTime - context.currentTime + 2;
  const preview = engine.seek(target);
  assert.equal(advances, 0); assert.equal(context.sources.length, 0);
  assert.equal(preview.decks.length, 2); assert.equal(preview.decks[0].ended, true);
  const incomingPosition = preview.decks[1].position;
  context.currentTime = 100; const resumed = engine.resume();
  assert.equal(advances, 1); assert.equal(resumed.decks.length, 1);
  assert.equal(resumed.decks[0].id, 'B'); near(resumed.decks[0].position, incomingPosition);
  assert.equal(context.sources.length, 1); assert.equal(context.sources[0].starts.length, 1);
  engine.snapshot(); engine.pause(); engine.resume(); engine.snapshot();
  assert.equal(advances, 1);
  engine.dispose();
});

test('promotion retains B source without stop/start and C inherits its audible tempo', () => {
  const { context, engine } = setup();
  const outgoing = context.sources[0], incoming = context.sources[1];
  context.currentTime = 30;
  const starts = incoming.starts.length, stops = incoming.stops.length;
  const promoted = engine.queueNext(null);
  assert.equal(promoted.decks.length, 1); assert.equal(promoted.decks[0].id, 'B');
  near(promoted.decks[0].position, 7.68); near(promoted.decks[0].rate, .96);
  assert.equal(incoming.starts.length, starts); assert.equal(incoming.stops.length, stops);
  assert.equal(incoming.disconnected, false); assert.equal(outgoing.disconnected, true);
  context.currentTime = 35;
  const previous = engine.snapshot().decks[0].position;
  const queued = engine.queueNext(track('C', 110));
  near(queued.decks[0].position, previous); near(queued.decks[0].rate, .96);
  assert.equal(context.sources.length, 3); assert.equal(incoming.starts.length, 1);
  assert.ok(incoming.stops.at(-1) > context.currentTime, 'Only a future B stop may be rescheduled');
  near(context.sources[2].playbackRate.value, 120 / 110);
  context.currentTime = (queued.plan.startTime + queued.plan.endTime) / 2;
  const overlap = engine.snapshot();
  near(overlap.decks[0].gain, Math.SQRT1_2); near(overlap.decks[1].gain, Math.SQRT1_2);
  engine.dispose();
});

test('a queued successor while paused starts only on resume with current offset and rate preserved', () => {
  const { context, engine } = setup();
  context.currentTime = 31; engine.queueNext(null);
  context.currentTime = 34; const paused = engine.pause();
  const count = context.sources.length;
  context.currentTime = 100;
  const queued = engine.queueNext(track('C', 110));
  assert.equal(queued.state, 'paused'); assert.equal(context.sources.length, count);
  near(queued.decks[0].position, paused.decks[0].position);
  const resumed = engine.resume();
  near(resumed.decks[0].position, paused.decks[0].position);
  near(context.sources[count].starts[0].offset, paused.decks[0].position);
  near(context.sources[count].playbackRate.value, .96);
  near(context.sources[count + 1].playbackRate.value, 120 / 110);
  engine.dispose();
});

test('the promoted track can rewind to its beginning while its successor stays aligned', () => {
  const { context, engine } = setup();
  context.currentTime = 31; engine.queueNext(null); engine.queueNext(track('C', 110));
  const before = engine.pause();
  assert.ok(before.decks[0].position > 8);
  const sourceCount = context.sources.length;
  const rewound = engine.seek(0);
  assert.equal(rewound.state, 'paused'); near(rewound.decks[0].position, 0);
  assert.equal(context.sources.length, sourceCount); assert.equal(rewound.decks[1].started, false);
  context.currentTime = 100; const resumed = engine.resume();
  near(resumed.decks[0].position, 0); near(context.sources[sourceCount].starts[0].offset, 0);
  near(resumed.decks[0].rate, .96);
  context.currentTime = (resumed.plan.startTime + resumed.plan.endTime) / 2;
  const overlap = engine.snapshot();
  near(overlap.decks[0].gain, Math.SQRT1_2); near(overlap.decks[1].gain, Math.SQRT1_2);
  engine.dispose();
});

test('onAdvance may promote synchronously without stale completion or duplicate callbacks', () => {
  let advances = 0, finishes = 0, engine;
  const result = setup({ onAdvance: () => { advances++; engine.queueNext(null); }, onFinished: () => finishes++ });
  engine = result.engine;
  result.context.currentTime = 30;
  const snapshot = engine.snapshot();
  assert.equal(advances, 1); assert.equal(finishes, 0); assert.equal(snapshot.state, 'playing');
  assert.equal(snapshot.decks[0].id, 'B');
  engine.snapshot(); assert.equal(advances, 1);
  result.context.currentTime = 100; engine.snapshot(); engine.snapshot();
  assert.equal(finishes, 1); assert.equal(engine.snapshot().state, 'ended');
  engine.dispose();
});

test('a short incoming track that ends with overlap promotes safely as ended', () => {
  const context = fakeContext();
  const engine = createAudioMixEngine({ context, scheduleAhead: 0 });
  engine.setTracks([track('A', 120, 10, 0), track('B', 120, 2, 0)]);
  const started = engine.play(); assert.equal(started.plan.fadeDuration, 2);
  context.currentTime = 20;
  const promoted = engine.queueNext(null);
  assert.equal(promoted.state, 'ended'); assert.equal(promoted.decks[0].id, 'B');
  near(promoted.decks[0].position, 2);
  engine.setTracks([track('C')]); assert.equal(engine.play().state, 'playing');
  engine.dispose();
});

test('failed queued source is cleaned without stopping or restarting current audio', () => {
  const { context, engine } = setup();
  context.currentTime = 30; engine.queueNext(null);
  const incoming = context.sources[1], previous = engine.snapshot();
  context.failStart = true;
  assert.throws(() => engine.queueNext(track('C')), /Injected start failure/);
  const failed = context.sources.at(-1), snapshot = engine.snapshot();
  assert.equal(failed.disconnected, true); assert.equal(failed.onended, null);
  assert.equal(incoming.disconnected, false); assert.equal(incoming.starts.length, 1);
  assert.ok(incoming.stops.at(-1) > context.currentTime);
  assert.equal(snapshot.state, 'playing'); assert.equal(snapshot.decks.length, 1);
  near(snapshot.decks[0].position, previous.decks[0].position);
  engine.dispose();
});

test('early queue and invalid settings reject without disrupting the current pair', () => {
  const { context, engine } = setup();
  assert.throws(() => engine.queueNext(null), /Finish the current overlap/);
  assert.throws(() => engine.queueNext(track('C'), { fadeDuration: NaN }), /finite/);
  assert.throws(() => engine.setTracks([track('A'), track('B'), track('C')]), /at most two/);
  assert.equal(engine.snapshot().state, 'playing'); assert.equal(context.sources.length, 2);
  assert.ok(context.sources.every(source => !source.disconnected));
  engine.dispose();
});

test('FX have independent real filter and feedback-delay graphs; dispose owns only its nodes', () => {
  const { context, engine } = setup();
  const foreign = context.createGain();
  engine.setFx(0, { filterHz: 900, echo: .5, echoFeedback: .4 });
  near(context.filters[0].frequency.value, 900); near(context.filters[1].frequency.value, 20000);
  assert.ok(context.delays[0].connections.length === 2, 'Delay feeds wet gain and feedback gain');
  assert.ok(context.delays[0].connections.some(node => node.connections.includes(context.delays[0])));
  assert.equal(engine.snapshot().decks[1].fx.echo, 0);
  engine.stop(); assert.equal(engine.snapshot().state, 'stopped');
  assert.ok(context.sources.every(source => source.disconnected && source.onended === null));
  engine.dispose(); engine.dispose();
  assert.equal(context.gains[0].disconnected, true); assert.equal(foreign.disconnected, false);
  assert.equal(context.state, 'running');
  assert.throws(() => engine.play(), /disposed/);
});
