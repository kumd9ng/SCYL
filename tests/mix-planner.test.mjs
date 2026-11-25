import test from 'node:test';
import assert from 'node:assert/strict';
import { planMix, equalPowerGains } from '../lib/mix-planner.mjs';

const current = { duration: 120, bpm: 120, beatOffset: .12, confidence: .93 };
const next = { duration: 100, bpm: 128, beatOffset: .31, confidence: .91 };
const near = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} should be near ${expected}`);
const onGrid = (position, track) => near((position - track.beatOffset) / (60 / track.bpm), Math.round((position - track.beatOffset) / (60 / track.bpm)));

test('aligns both sources despite different BPM and beat phase', () => {
  const plan = planMix({ current, next, currentPosition: 90, now: 40, fadeDuration: 8 });
  assert.equal(plan.mode, 'beatmatched');
  near(plan.rate, 120 / 128);
  near(plan.offset, .31);
  near(plan.startTime, 40 + plan.delay);
  near(plan.outgoingPosition, 90 + plan.delay);
  assert.ok(plan.startTime >= 40 && plan.fadeDuration >= 2 * plan.beatPeriod);
  assert.ok(plan.endTime <= 40 + 30);
  assert.ok(plan.offset + plan.fadeDuration * plan.rate <= next.duration);
  for (let beat = 0; beat <= 2; beat++) {
    onGrid(plan.outgoingPosition + beat * plan.beatPeriod, current);
    onGrid(plan.offset + beat * plan.beatPeriod * plan.rate, next);
  }
});

test('uses effective outgoing tempo when the current source is already rate-adjusted', () => {
  const currentRate = 1.1;
  const plan = planMix({ current, next, currentPosition: 90, now: 9, currentRate });
  assert.equal(plan.mode, 'beatmatched');
  near(plan.rate * next.bpm, currentRate * current.bpm);
  near(plan.outgoingPosition, 90 + plan.delay * currentRate);
  onGrid(plan.outgoingPosition, current);
  onGrid(plan.outgoingPosition + plan.beatPeriod * currentRate, current);
  assert.ok(plan.endTime <= 9 + 30 / currentRate + 1e-8);
});

test('uncertain grids and incompatible tempos explicitly use unsynced crossfades', () => {
  for (const changed of [{ ...next, confidence: .2 }, { ...next, bpm: null }, { ...next, bpm: 70 }]) {
    const plan = planMix({ current, next: changed, currentPosition: 90, now: 40 });
    assert.equal(plan.mode, 'crossfade');
    assert.equal(plan.beatPeriod, null);
    assert.equal(plan.rate, 1);
    assert.equal(plan.offset, 0);
    near(plan.startTime, 62);
    near(plan.endTime, 70);
    near(plan.fadeDuration, 8);
  }
});

test('short remaining audio never schedules past either source or labels one beat as sync', () => {
  const plan = planMix({ current, next, currentPosition: 119.4, now: 7 });
  assert.equal(plan.mode, 'crossfade');
  near(plan.startTime, 7);
  near(plan.fadeDuration, .6);
  near(plan.endTime, 7.6);
  const tinyNext = planMix({ current, next: { ...next, duration: .8 }, currentPosition: 90, now: 0 });
  assert.equal(tinyNext.mode, 'crossfade');
  near(tinyNext.fadeDuration, .8);
  assert.ok(tinyNext.endTime <= 30);
});

test('an awkward late beat falls back instead of making an insufficient synchronized overlap', () => {
  const plan = planMix({ current: { duration: 5, bpm: 60, beatOffset: .99, confidence: .9 }, next: { duration: 20, bpm: 60, beatOffset: .1, confidence: .9 }, currentPosition: 3, now: 2, fadeDuration: 2 });
  assert.equal(plan.mode, 'crossfade');
  assert.equal(plan.reason, 'not-enough-aligned-beats');
  near(plan.fadeDuration, 2);
  near(plan.startTime, 2);
});

test('ended tracks and zero-fade settings produce concrete nonnegative cut schedules', () => {
  const ended = planMix({ current, next, currentPosition: 121, now: 7 });
  assert.equal(ended.mode, 'cut');
  near(ended.startTime, 7); near(ended.endTime, 7); near(ended.outgoingPosition, 120);
  const cut = planMix({ current, next, currentPosition: 90, now: 7, fadeDuration: 0 });
  assert.equal(cut.mode, 'cut');
  near(cut.startTime, 37); near(cut.endTime, 37);
  assert.throws(() => planMix({ current, next, currentPosition: 0, currentRate: 0 }), /valid/);
  assert.throws(() => planMix({ current, next, currentPosition: 0, fadeDuration: -1 }), /settings/);
});

test('equal-power fades have silent endpoints, continuous direction, and unit summed power', () => {
  assert.deepEqual(equalPowerGains(0), { outgoing: 1, incoming: 0 });
  assert.deepEqual(equalPowerGains(1), { outgoing: 0, incoming: 1 });
  assert.deepEqual(equalPowerGains(-1), { outgoing: 1, incoming: 0 });
  assert.deepEqual(equalPowerGains(2), { outgoing: 0, incoming: 1 });
  let previous = equalPowerGains(0);
  for (let step = 1; step <= 100; step++) {
    const gains = equalPowerGains(step / 100);
    near(gains.outgoing ** 2 + gains.incoming ** 2, 1);
    assert.ok(gains.outgoing <= previous.outgoing && gains.incoming >= previous.incoming);
    previous = gains;
  }
  assert.throws(() => equalPowerGains(NaN), /finite/);
});
