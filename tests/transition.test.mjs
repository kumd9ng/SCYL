import test from 'node:test';
import assert from 'node:assert/strict';
import { TRANSITION_MODES, fadeGain, shouldStartTransition, gainForFade } from '../lib/transition.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12,
  `Expected ${actual} to be near ${expected}`);

test('transition modes contain immutable fade durations in seconds', () => {
  assert.deepEqual(TRANSITION_MODES, {
    gentle: { fadeOut: 5, fadeIn: 5 },
    balanced: { fadeOut: 3, fadeIn: 3 },
    quick: { fadeOut: 1.2, fadeIn: 1.2 },
  });
  assert.ok(Object.isFrozen(TRANSITION_MODES));
  for (const mode of Object.values(TRANSITION_MODES)) assert.ok(Object.isFrozen(mode));
});

test('cosine gain reaches exact endpoints, a midpoint and eases at its edges', () => {
  assert.equal(fadeGain(0), 0);
  assert.equal(fadeGain(1), 1);
  near(fadeGain(0.5), 0.5);
  assert.ok(fadeGain(0.1) < 0.1);
  assert.ok(fadeGain(0.9) > 0.9);
  let previous = 0;
  for (let index = 0; index <= 100; index += 1) {
    const gain = fadeGain(index / 100);
    assert.ok(gain >= previous && gain >= 0 && gain <= 1);
    previous = gain;
  }
});

test('gain clamps outside progress and handles invalid data without NaN', () => {
  for (const value of [-10, -Infinity, NaN, undefined, null, '0.5']) {
    assert.equal(fadeGain(value), 0);
  }
  assert.equal(fadeGain(10), 1);
  assert.equal(fadeGain(Infinity), 1);
});

test('starts only within the remaining fade window and before track end', () => {
  const base = { currentTime: 97, duration: 100, fadeOut: 3, hasNext: true, playing: true };
  assert.equal(shouldStartTransition(base), true);
  assert.equal(shouldStartTransition({ ...base, currentTime: 99.99 }), true);
  assert.equal(shouldStartTransition({ ...base, currentTime: 96.99 }), false);
  assert.equal(shouldStartTransition({ ...base, currentTime: 100 }), false);
  assert.equal(shouldStartTransition({ ...base, currentTime: 101 }), false);
  assert.equal(shouldStartTransition({ ...base, hasNext: false }), false);
  assert.equal(shouldStartTransition({ ...base, playing: false }), false);
  assert.equal(shouldStartTransition({ ...base, duration: 2, currentTime: 0 }), true);
  for (const field of ['currentTime', 'duration', 'fadeOut']) {
    for (const value of [NaN, Infinity, -Infinity, undefined, '3', -1]) {
      assert.equal(shouldStartTransition({ ...base, [field]: value }), false, `${field}=${value}`);
    }
  }
  assert.equal(shouldStartTransition({ ...base, duration: 0 }), false);
  assert.equal(shouldStartTransition({ ...base, fadeOut: 0 }), false);
  assert.equal(shouldStartTransition(), false);
});

test('gainForFade eases either direction and supports partial gain endpoints', () => {
  assert.equal(gainForFade({ elapsed: 0, duration: 3, from: 1, to: 0 }), 1);
  near(gainForFade({ elapsed: 1.5, duration: 3, from: 1, to: 0 }), 0.5);
  assert.equal(gainForFade({ elapsed: 3, duration: 3, from: 1, to: 0 }), 0);
  assert.equal(gainForFade({ elapsed: 0, duration: 3, from: 0, to: 1 }), 0);
  near(gainForFade({ elapsed: 1.5, duration: 3, from: 0.2, to: 0.8 }), 0.5);
  assert.equal(gainForFade({ elapsed: 3, duration: 3, from: 0, to: 1 }), 1);
  assert.equal(gainForFade({ elapsed: -1, duration: 3, from: 0.7, to: 0 }), 0.7);
  assert.equal(gainForFade({ elapsed: 5, duration: 3, from: 0.7, to: 0 }), 0);
});

test('invalid timing and endpoint data always produces a bounded finite gain', () => {
  const base = { elapsed: 1, duration: 3, from: 0.8, to: 0.2 };
  for (const value of [NaN, undefined, Infinity, -Infinity]) {
    assert.equal(gainForFade({ ...base, duration: value }), 0.8);
  }
  for (const value of [NaN, undefined, '1']) {
    assert.equal(gainForFade({ ...base, elapsed: value }), 0.8);
  }
  assert.equal(gainForFade({ ...base, duration: 0 }), 0.2);
  assert.equal(gainForFade({ ...base, duration: -1 }), 0.2);
  near(gainForFade({ ...base, elapsed: Infinity }), 0.2);
  assert.equal(gainForFade({ ...base, elapsed: -Infinity }), 0.8);
  assert.equal(gainForFade(), 0);
  for (const from of [-2, 2, NaN, Infinity, undefined]) {
    for (const to of [-2, 2, NaN, -Infinity, undefined]) {
      const gain = gainForFade({ ...base, from, to });
      assert.ok(Number.isFinite(gain) && gain >= 0 && gain <= 1);
    }
  }
});
