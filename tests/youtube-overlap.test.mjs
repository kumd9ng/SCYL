import test from 'node:test';
import assert from 'node:assert/strict';
import { createYouTubeOverlapController, youtubeOverlapWindow, youtubeOverlapGains } from '../lib/youtube-overlap.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
function fixture({ startSeconds = 0, duration = 100, nextReady = true, reveal = true } = {}) {
  let clock = 0;
  const current = { key: 'a', id: 'aaaaaaaaaaa', slot: 0, startSeconds };
  const next = { key: 'b', id: 'bbbbbbbbbbb', slot: 1, startSeconds: 7 };
  const ctx = { current, next, allowed: true, seeking: false, switching: false };
  const players = [
    { key: 'a', videoId: current.id, ready: true, state: 1, time: startSeconds, duration, gain: 1, starts: 0, pauses: 0 },
    { key: 'b', videoId: next.id, ready: nextReady, state: 5, time: 7, duration: 80, gain: 0, starts: 0, pauses: 0 },
  ];
  const notices = [], promotions = [], changes = [];
  let throwStart = false;
  const controller = createYouTubeOverlapController({
    context: () => ctx, read: slot => players[slot], now: () => clock,
    start(slot, track) {
      players[slot].starts++;
      if (throwStart) throw new Error('source failed');
      players[slot].time = track.startSeconds;
      players[slot].state = 3;
    },
    pause(slot) { players[slot].pauses++; players[slot].state = 2; },
    gain(slot, value) { players[slot].gain = value; }, reveal: () => reveal,
    changed: state => changes.push(state), notice: reason => notices.push(reason),
    promote(outgoing, incoming) { promotions.push({ outgoing, incoming }); ctx.current = incoming; ctx.next = null; },
  });
  const tick = (time = players[ctx.current.slot].time, elapsed) => {
    const player = players[ctx.current.slot];
    clock += elapsed ?? Math.max(100, Math.abs(time - player.time) * 1000);
    player.time = time;
    controller.tick();
  };
  const event = (slot, state) => { players[slot].state = state; return controller.state(slot, state); };
  const begin = () => { const at = youtubeOverlapWindow({ duration, startSeconds }).start; tick(at - 1); tick(at); };
  const mix = () => { begin(); event(1, 1); };
  return { controller, ctx, players, notices, promotions, changes, tick, event, begin, mix, failStart: () => { throwStart = true; } };
}

test('the last 10% excludes a YouTube link start offset', () => {
  assert.deepEqual(youtubeOverlapWindow({ duration: 200, startSeconds: 100 }), { start: 190, end: 200, seconds: 10 });
  assert.deepEqual(youtubeOverlapWindow({ duration: 100 }), { start: 90, end: 100, seconds: 10 });
});

test('unknown/live/invalid and sub-quarter-second windows do not schedule overlap', () => {
  for (const duration of [0, -1, NaN, Infinity, undefined, '100', 2]) assert.equal(youtubeOverlapWindow({ duration }), null);
  for (const startSeconds of [-1, NaN, Infinity, 100, 101]) assert.equal(youtubeOverlapWindow({ duration: 100, startSeconds }), null);
  assert.equal(youtubeOverlapWindow({ duration: 100, isLive: true }), null);
  const f = fixture({ duration: 2 }); f.tick(1.9); assert.equal(f.players[1].starts, 0);
});

test('equal-power gains preserve squared amplitude, endpoints, and finite output', () => {
  assert.deepEqual(youtubeOverlapGains(0), { outgoing: 1, incoming: 0 });
  assert.deepEqual(youtubeOverlapGains(1), { outgoing: 0, incoming: 1 });
  for (let i = 0; i <= 100; i++) {
    const { outgoing, incoming } = youtubeOverlapGains(i / 100);
    near(outgoing ** 2 + incoming ** 2, 1);
  }
  assert.deepEqual(youtubeOverlapGains(NaN), youtubeOverlapGains(0));
});

test('starts the prepared next player once at 90%, keeping current full until real PLAYING', () => {
  const f = fixture(); f.tick(89.9); assert.equal(f.players[1].starts, 0); f.tick(90);
  assert.equal(f.players[1].starts, 1); assert.equal(f.players[1].time, 7);
  assert.equal(f.players[0].gain, 1); assert.equal(f.players[1].gain, 0);
  assert.equal(f.controller.snapshot().phase, 'waiting');
  f.tick(90.5); f.tick(91); assert.equal(f.players[1].starts, 1);
  f.event(1, 1); assert.equal(f.controller.snapshot().phase, 'mixing');
  f.tick(95.5); near(f.players[0].gain, Math.SQRT1_2); near(f.players[1].gain, Math.SQRT1_2);
});

test('promotion keeps the incoming playback time and does not issue another play/load', () => {
  const f = fixture(); f.mix(); f.players[1].time = 17; f.tick(100);
  assert.equal(f.promotions.length, 1); assert.equal(f.ctx.current.key, 'b');
  assert.equal(f.players[1].time, 17); assert.equal(f.players[1].starts, 1);
  assert.equal(f.players[0].state, 2); assert.equal(f.players[0].gain, 0); assert.equal(f.players[1].gain, 1);
  assert.equal(f.controller.snapshot(), null);
});

test('duplicate PLAYING and ENDED events do not reset a fade or promote twice', () => {
  const f = fixture(); f.mix(); f.tick(95); f.event(1, 1); f.event(0, 1);
  near(f.players[0].gain, Math.SQRT1_2); assert.equal(f.controller.snapshot().mixStart, 90);
  f.event(0, 0); f.controller.state(0, 0);
  assert.equal(f.promotions.length, 1); assert.equal(f.players[1].starts, 1);
});

test('manual next promotes an already playing incoming source without restarting', () => {
  const f = fixture(); f.mix(); f.players[1].time = 8.2;
  assert.equal(f.controller.finish(), true); assert.equal(f.players[1].time, 8.2); assert.equal(f.players[1].starts, 1);
});

test('autoplay rejection preserves current playback and suppresses a delayed incoming PLAYING', () => {
  const f = fixture(); f.begin(); assert.equal(f.controller.blocked(1), true);
  assert.equal(f.players[0].state, 1); assert.equal(f.players[0].gain, 1);
  f.event(1, 1); assert.equal(f.players[1].state, 2); assert.equal(f.players[1].gain, 0);
  f.tick(95); assert.equal(f.players[1].starts, 1);
  assert.equal(f.event(0, 0), true); assert.equal(f.players[1].starts, 1);
  assert.equal(f.notices.at(-1), 'ended-unavailable');
});

test('explicit manual selection can release a cancelled player', () => {
  const f = fixture(); f.begin(); f.controller.blocked(1);
  f.controller.reset(); f.controller.release(1); f.ctx.current = f.ctx.next; f.ctx.next = null;
  assert.equal(f.event(1, 1), false); assert.equal(f.players[1].state, 1);
});

test('late buffering confirmation shortens the overlap without abruptly silencing the current song', () => {
  const f = fixture(); f.begin(); f.tick(93); assert.equal(f.players[0].gain, 1);
  f.event(1, 1); near(f.players[0].gain, 1); near(f.players[1].gain, 0);
  f.tick(96.5); near(f.players[0].gain, Math.SQRT1_2); near(f.players[1].gain, Math.SQRT1_2);
  assert.equal(f.players[1].starts, 1);
});

test('buffering timeout stops only incoming and does not retry every timer tick', () => {
  const f = fixture(); f.begin(); f.tick(98, 8001);
  assert.equal(f.controller.snapshot(), null); assert.equal(f.players[0].state, 1); assert.equal(f.players[0].gain, 1);
  f.tick(99); f.tick(99.8); assert.equal(f.players[1].starts, 1);
  assert.ok(f.notices.includes('incoming-timeout'));
});

test('buffering during a mix restores current gain and continues without replaying next', () => {
  const f = fixture(); f.mix(); f.tick(94); f.event(1, 3);
  assert.equal(f.players[0].gain, 1); assert.equal(f.players[1].gain, 0);
  f.tick(95); f.event(1, 1); f.tick(97.5);
  near(f.players[0].gain, Math.SQRT1_2); assert.equal(f.players[1].starts, 1);
});

test('outgoing pause cancels overlap; resume cannot revive the abandoned incoming request', () => {
  const f = fixture(); f.mix(); f.tick(95); assert.equal(f.event(0, 2), false);
  assert.equal(f.controller.snapshot(), null); assert.equal(f.players[1].state, 2);
  f.event(1, 1); assert.equal(f.players[1].state, 2);
  f.event(0, 1); f.tick(96); assert.equal(f.players[1].starts, 1);
});

test('background/account lock cancels and pauses both sources with no automatic resumption', () => {
  const f = fixture(); f.mix(); f.ctx.allowed = false; f.tick(93);
  assert.equal(f.players[0].state, 2); assert.equal(f.players[1].state, 2);
  f.event(1, 1); assert.equal(f.players[1].state, 2);
  f.ctx.allowed = true; f.tick(93.1); assert.equal(f.players[0].state, 2); assert.equal(f.players[1].starts, 1);
});

test('seek drag cancels incoming and restores the active song', () => {
  const f = fixture(); f.mix(); f.tick(94); f.ctx.seeking = true; f.tick(94.1);
  assert.equal(f.controller.snapshot(), null); assert.equal(f.players[0].gain, 1); assert.equal(f.players[1].state, 2);
});

test('a native seek discontinuity cancels the old overlap and a new pass can rearm', () => {
  const f = fixture(); f.mix(); f.tick(94); f.tick(20, 100);
  assert.equal(f.controller.snapshot(), null); f.event(1, 1); assert.equal(f.players[1].state, 2);
  f.tick(89); f.tick(90); assert.equal(f.players[1].starts, 2);
});

test('queue changes invalidate the old incoming key and cannot revive its late event', () => {
  const f = fixture(); f.mix(); f.ctx.next = { ...f.ctx.next, key: 'c', id: 'ccccccccccc' }; f.tick(93);
  assert.equal(f.controller.snapshot(), null); f.event(1, 1); assert.equal(f.players[1].state, 2);
  assert.equal(f.players[0].gain, 1);
});

test('a replaced source cannot claim playback from an old video event', () => {
  const f = fixture(); f.begin(); f.controller.cancel();
  f.ctx.next = { ...f.ctx.next, key: 'c', id: 'ccccccccccc' };
  f.players[1].key = 'c';
  assert.equal(f.event(1, 1), true);
  assert.equal(f.players[1].state, 2); assert.equal(f.ctx.current.key, 'a');
});

test('incoming source errors or start exceptions never stop the current song', () => {
  for (const kind of ['event', 'throw']) {
    const f = fixture(); if (kind === 'throw') f.failStart(); f.begin();
    if (kind === 'event') { f.players[1].failed = true; assert.equal(f.controller.failure(1), true); }
    assert.equal(f.controller.snapshot(), null); assert.equal(f.players[0].state, 1); assert.equal(f.players[0].gain, 1);
    f.tick(95); assert.equal(f.players[1].starts, 1);
  }
});

test('outgoing errors or buffering cancel the incoming song', () => {
  for (const kind of ['error', 'buffering']) {
    const f = fixture(); f.mix();
    if (kind === 'error') { f.players[0].failed = true; f.controller.failure(0); }
    else f.event(0, 3);
    assert.equal(f.controller.snapshot(), null); assert.equal(f.players[1].state, 2);
  }
});

test('EOF before the incoming player starts stops the pending request instead of fabricating success', () => {
  const f = fixture(); f.begin(); assert.equal(f.event(0, 0), true);
  assert.equal(f.promotions.length, 0); assert.equal(f.players[1].state, 2); assert.equal(f.controller.snapshot(), null);
  f.event(1, 1); assert.equal(f.players[1].state, 2);
});

test('a stale media clock never advances gain from elapsed wall time alone', () => {
  const f = fixture(); f.mix(); f.tick(90, 5000);
  assert.equal(f.players[0].gain, 1); assert.equal(f.players[1].gain, 0); assert.equal(f.promotions.length, 0);
});

test('unready, mismatched, unavailable next source and single-track repeat do not overlap', () => {
  for (const kind of ['unready', 'mismatch', 'failed', 'same', 'absent']) {
    const f = fixture();
    if (kind === 'unready') f.players[1].ready = false;
    if (kind === 'mismatch') f.players[1].videoId = 'other';
    if (kind === 'failed') f.players[1].failed = true;
    if (kind === 'same') f.ctx.next = f.ctx.current;
    if (kind === 'absent') f.ctx.next = null;
    f.begin(); assert.equal(f.players[1].starts, 0, kind);
  }
});

test('an invisible incoming frame is not started and the current song remains audible', () => {
  const f = fixture({ reveal: false }); f.begin(); f.tick(95);
  assert.equal(f.players[1].starts, 0); assert.equal(f.players[0].gain, 1); assert.equal(f.players[0].state, 1);
});
