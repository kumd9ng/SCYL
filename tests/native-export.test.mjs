import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeSetExporter, createNativeCacheClearer } from '../lib/native-export.mjs';

const payload = JSON.stringify({ app: 'SCYL', version: 1, tracks: [{ title: '테스트 곡', url: 'https://youtu.be/M7lc1UVf-VE' }] });
function harness(overrides = {}) {
  const events = [];
  const filesystem = {
    writeFile: async options => { events.push(['write', options]); return { uri: 'file:///cache/scyl-export/SCYL-set.json' }; },
    getUri: async options => { events.push(['uri', options]); return { uri: 'file:///cache/scyl-export/SCYL-set.json' }; },
  };
  const share = {
    canShare: async () => { events.push(['available']); return { value: true }; },
    share: async options => { events.push(['share', options]); return { activityType: 'example.receiver' }; },
  };
  overrides.filesystem && Object.assign(filesystem, overrides.filesystem);
  overrides.share && Object.assign(share, overrides.share);
  const run = createNativeSetExporter({ isNativePlatform: overrides.isNativePlatform || (() => true), filesystem, share, directory: 'CACHE', encoding: 'utf8' });
  return { events, run };
}

test('native export writes exact UTF8 JSON to one app-cache path and waits for sharing completion', async () => {
  let complete;
  const { run, events } = harness({ share: { share: options => { events.push(['share', options]); return new Promise(resolve => { complete = resolve; }); } } });
  let resolved = false;
  const pending = run(payload).then(result => { resolved = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(resolved, false);
  assert.deepEqual(events.map(event => event[0]), ['available', 'write', 'share']);
  assert.deepEqual(events[1][1], { path: 'scyl-export/SCYL-set.json', data: payload, directory: 'CACHE', encoding: 'utf8', recursive: true });
  assert.deepEqual(events[2][1].files, ['file:///cache/scyl-export/SCYL-set.json']);
  complete({ activityType: 'example.receiver' });
  assert.deepEqual(await pending, { status: 'shared' });
});

test('unavailable native sharing performs no writes and web use never calls native plugins', async () => {
  const unavailable = harness({ share: { canShare: async () => ({ value: false }) } });
  assert.deepEqual(await unavailable.run(payload), { status: 'unavailable' });
  assert.equal(unavailable.events.length, 0);
  const web = harness({ isNativePlatform: () => false });
  assert.deepEqual(await web.run(payload), { status: 'unavailable' });
  assert.equal(web.events.length, 0);
});

test('actual native cancellation is not success and does not delete the receiver file', async () => {
  const { run, events } = harness({ share: { share: async () => { throw new Error('Share canceled'); } } });
  assert.deepEqual(await run(payload), { status: 'cancelled' });
  assert.equal(events.filter(event => event[0] === 'write').length, 1);
  assert.equal(events.some(event => event[0] === 'delete'), false);
});

test('filesystem and real share failures propagate instead of claiming saved', async () => {
  const failedWrite = harness({ filesystem: { writeFile: async () => { throw new Error('disk full'); } } });
  await assert.rejects(failedWrite.run(payload), /disk full/);
  assert.equal(failedWrite.events.some(event => event[0] === 'share'), false);
  const failedShare = harness({ share: { share: async () => { throw new Error('Error sharing item'); } } });
  await assert.rejects(failedShare.run(payload), /Error sharing item/);
});

test('URI fallback requires a local file, and malformed or oversized payloads never reach storage', async () => {
  const fallback = harness({ filesystem: { writeFile: async () => ({}), getUri: async () => ({ uri: 'file:///cache/SCYL-set.json' }) } });
  assert.deepEqual(await fallback.run(payload), { status: 'shared' });
  const badUri = harness({ filesystem: { writeFile: async () => ({ uri: 'https://remote.invalid/file' }) } });
  await assert.rejects(badUri.run(payload), /위치/);
  assert.equal(badUri.events.some(event => event[0] === 'share'), false);
  const invalid = harness();
  for (const value of ['{bad', '{}', JSON.stringify({ app: 'Other', version: 1, tracks: [] }), 'a'.repeat(2_000_001)]) await assert.rejects(invalid.run(value));
  assert.equal(invalid.events.length, 0);
});

test('a second export cannot overwrite a file while its share sheet is active', async () => {
  let complete;
  const { run, events } = harness({ share: { share: () => new Promise(resolve => { complete = resolve; }) } });
  const first = run(payload);
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(run(payload), /이미/);
  assert.equal(events.filter(event => event[0] === 'write').length, 1);
  complete({}); await first;
});

test('privacy deletion touches only the owned cache file and treats absence as idempotent', async () => {
  const calls = [];
  const clear = createNativeCacheClearer({ isNativePlatform: () => true, directory: 'CACHE', filesystem: { deleteFile: async options => { calls.push(options); } } });
  assert.deepEqual(await clear(), { status: 'cleared' });
  assert.deepEqual(calls, [{ path: 'scyl-export/SCYL-set.json', directory: 'CACHE' }]);
  for (const code of ['ENOENT', 'OS-PLUG-FILE-0008']) {
    const absent = createNativeCacheClearer({ isNativePlatform: () => true, filesystem: { deleteFile: async () => { throw Object.assign(new Error('missing'), { code }); } } });
    assert.deepEqual(await absent(), { status: 'cleared' });
  }
});

test('privacy deletion propagates permission/I/O failures and does not touch native storage on web', async () => {
  const fail = createNativeCacheClearer({ isNativePlatform: () => true, filesystem: { deleteFile: async () => { throw Object.assign(new Error('denied'), { code: 'OS-PLUG-FILE-0007' }); } } });
  await assert.rejects(fail(), /denied/);
  const web = createNativeCacheClearer({ isNativePlatform: () => false, filesystem: { deleteFile: async () => { throw new Error('must not call'); } } });
  assert.deepEqual(await web(), { status: 'unavailable' });
});
