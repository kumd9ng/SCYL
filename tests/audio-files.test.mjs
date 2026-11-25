import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAudioFile } from '../lib/audio-files.mjs';

// Exercise the actual worker entry with browser message boundaries simulated.
// structuredClone transfers really detach the pooled copy, as Worker does.
let workerMessage;
const originalSelf = globalThis.self;
globalThis.self = { addEventListener(type, handler) { if (type === 'message') workerMessage = handler; } };
await import('../audio-analysis-worker.mjs');
if (originalSelf === undefined) delete globalThis.self; else globalThis.self = originalSelf;

function audioBuffer({ duration = 8, sampleRate = 48000, channelCount = 2 } = {}) {
  const length = Math.round(duration * sampleRate);
  const first = new Float32Array(length);
  for (let beat = .08; beat < duration; beat += .5) {
    const start = Math.round(beat * sampleRate);
    for (let sample = 0; sample < sampleRate * .008 && start + sample < length; sample++) first[start + sample] = .8 * Math.exp(-sample / sampleRate * 500);
  }
  const channels = Array.from({ length: channelCount }, (_, index) => index % 2 ? Float32Array.from(first, sample => -sample) : first.slice());
  return { duration, length, sampleRate, numberOfChannels: channelCount, getChannelData: index => channels[index] };
}

function environment(t, options = {}) {
  const buffer = options.buffer || audioBuffer();
  const state = { created: [], revoked: [], workers: [], plays: 0, pauses: 0, decodes: 0, reads: 0 };
  const keys = ['Audio', 'Worker', 'document', 'self'];
  const descriptors = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const createObjectURL = URL.createObjectURL, revokeObjectURL = URL.revokeObjectURL;
  t.after(() => {
    for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
    URL.createObjectURL = createObjectURL; URL.revokeObjectURL = revokeObjectURL;
  });
  URL.createObjectURL = () => { const url = `blob:scyl-test-${state.created.length}`; state.created.push(url); return url; };
  URL.revokeObjectURL = url => state.revoked.push(url);
  globalThis.document = { baseURI: 'https://scyl.example/player/' };
  globalThis.Audio = class {
    duration = options.metadataDuration ?? buffer.duration;
    load() {
      if (!this.src || options.holdMetadata) return;
      queueMicrotask(() => options.metadataError ? this.onerror?.() : this.onloadedmetadata?.());
    }
    pause() { state.pauses++; }
    play() { state.plays++; throw new Error('Metadata loading must not play audio.'); }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
  };
  globalThis.Worker = class {
    constructor(url, config) { this.url = String(url); this.config = config; state.workers.push(this); }
    postMessage(payload, transfers) {
      this.transferredBuffer = transfers[0];
      this.payload = structuredClone(payload, { transfer: transfers });
      options.onPost?.(this);
      if (options.holdWorker) return;
      queueMicrotask(() => {
        if (this.terminated) return;
        if (options.workerError) { this.onerror?.(); return; }
        const previous = globalThis.self;
        globalThis.self = { postMessage: (message, transfer = []) => {
          const clone = structuredClone(message, { transfer });
          queueMicrotask(() => this.onmessage?.({ data: clone }));
        } };
        try { workerMessage({ data: this.payload }); } finally { globalThis.self = previous; }
      });
    }
    terminate() { this.terminated = true; }
  };
  const file = { name: 'Private local song.wav', size: 4096, async arrayBuffer() { state.reads++; return new ArrayBuffer(32); } };
  const context = { sampleRate: options.contextSampleRate || buffer.sampleRate, decodeAudioData(bytes) { state.decodes++; assert.equal(bytes.byteLength, 32); return options.decode ? options.decode(bytes) : Promise.resolve(buffer); } };
  return { state, file, context, buffer };
}

test('loads local PCM through real analysis without playing, cancelling stereo, or detaching original audio', async t => {
  const { state, file, context, buffer } = environment(t);
  const original = buffer.getChannelData(0);
  const bytesBefore = original.buffer.byteLength;
  const result = await loadAudioFile(file, { context, id: 'track-one', title: 'My track' });
  assert.equal(result.id, 'track-one'); assert.equal(result.title, 'My track'); assert.equal(result.buffer, buffer);
  assert.equal(result.analysis.duration, buffer.duration); assert.equal(result.analysis.sampleRate, 48000);
  assert.equal(result.analysis.analysisSampleRate, 12000); assert.equal(result.analysis.peaks.length, 4096);
  assert.ok(Math.abs(result.analysis.bpm - 120) < .8);
  assert.ok(result.analysis.confidence > .55); assert.ok(result.analysis.peaks.some(peak => peak > .7));
  assert.equal(original.buffer.byteLength, bytesBefore);
  assert.ok(Math.abs(original[Math.round(.08 * buffer.sampleRate)] - .8) < 1e-6);
  assert.deepEqual(state.revoked, state.created); assert.equal(state.plays, 0); assert.equal(state.decodes, 1);
  assert.equal(state.workers.length, 1);
  const worker = state.workers[0];
  assert.equal(worker.url, 'https://scyl.example/player/audio-analysis-worker.js');
  assert.equal(worker.config.type, 'module'); assert.equal(worker.terminated, true);
  assert.notEqual(worker.transferredBuffer, original.buffer); assert.equal(worker.transferredBuffer.byteLength, 0);
  assert.equal(worker.payload.sampleRate, 12000); assert.equal(worker.payload.pcm.length, buffer.length / 4);
});

test('oversized files are rejected before metadata or decoding', async t => {
  const { state, file, context } = environment(t);
  file.size = 60 * 1024 * 1024 + 1;
  await assert.rejects(loadAudioFile(file, { context }), /60MiB/);
  assert.equal(state.created.length, 0); assert.equal(state.reads, 0); assert.equal(state.decodes, 0);
});

test('overlong or indefinite metadata is rejected and its object URL is revoked', async t => {
  const { state, file, context } = environment(t, { metadataDuration: 721 });
  await assert.rejects(loadAudioFile(file, { context }), /12분/);
  assert.deepEqual(state.revoked, state.created); assert.equal(state.decodes, 0);
  globalThis.Audio.prototype.duration = Infinity;
  const OriginalAudio = globalThis.Audio;
  globalThis.Audio = class extends OriginalAudio { duration = Infinity; };
  await assert.rejects(loadAudioFile(file, { context }), /재생 길이/);
  assert.deepEqual(state.revoked, state.created); assert.equal(state.decodes, 0);
});

test('metadata errors release the local URL without decoding', async t => {
  const { state, file, context } = environment(t, { metadataError: true });
  await assert.rejects(loadAudioFile(file, { context }), /파일 정보/);
  assert.deepEqual(state.revoked, state.created); assert.equal(state.decodes, 0);
});

test('estimated PCM memory is bounded before decoding', async t => {
  const { state, file, context } = environment(t, { metadataDuration: 700, contextSampleRate: 96000 });
  await assert.rejects(loadAudioFile(file, { context }), /예상 메모리.*256MiB/);
  assert.equal(state.decodes, 0); assert.equal(state.reads, 0);
  assert.deepEqual(state.revoked, state.created);
});

test('surround and unexpectedly large decoded PCM are rejected before a worker is started', async t => {
  const { state, file, context } = environment(t, { buffer: audioBuffer({ duration: 1, channelCount: 3 }) });
  await assert.rejects(loadAudioFile(file, { context }), /모노 또는 스테레오/);
  assert.equal(state.workers.length, 0);
  context.decodeAudioData = async () => ({ duration: 60, sampleRate: 48000, length: 256 * 1024 * 1024 / 4 + 1, numberOfChannels: 1, getChannelData() { throw new Error('Must not allocate analysis PCM'); } });
  await assert.rejects(loadAudioFile(file, { context }), /메모리가 256MiB/);
  assert.equal(state.workers.length, 0);
});

test('cancelling metadata revokes the URL and does not proceed to decode', async t => {
  const { state, file, context } = environment(t, { holdMetadata: true });
  const controller = new AbortController();
  const pending = loadAudioFile(file, { context, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.deepEqual(state.revoked, state.created); assert.equal(state.decodes, 0); assert.equal(state.workers.length, 0);
});

test('cancelling an uninterruptible decoder discards its late result', async t => {
  let resolveDecode;
  const controller = new AbortController();
  const { state, file, context, buffer } = environment(t, { decode() {
    controller.abort(); return new Promise(resolve => { resolveDecode = resolve; });
  } });
  await assert.rejects(loadAudioFile(file, { context, signal: controller.signal }), { name: 'AbortError' });
  resolveDecode(buffer); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(state.decodes, 1); assert.equal(state.workers.length, 0); assert.deepEqual(state.revoked, state.created);
});

test('worker cancellation terminates analysis while original PCM stays intact', async t => {
  const controller = new AbortController();
  const { state, file, context, buffer } = environment(t, { holdWorker: true, onPost() { controller.abort(); } });
  await assert.rejects(loadAudioFile(file, { context, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(state.workers[0].terminated, true);
  assert.ok(buffer.getChannelData(0).buffer.byteLength > 0);
  assert.deepEqual(state.revoked, state.created);
});

test('worker failure is surfaced and the worker is terminated', async t => {
  const { state, file, context } = environment(t, { workerError: true });
  await assert.rejects(loadAudioFile(file, { context }), /음원 분석 작업/);
  assert.equal(state.workers[0].terminated, true); assert.deepEqual(state.revoked, state.created);
});

test('missing worker support fails explicitly instead of analyzing on the UI thread', async t => {
  const { state, file, context } = environment(t);
  globalThis.Worker = undefined;
  await assert.rejects(loadAudioFile(file, { context }), /별도 음원 분석/);
  assert.equal(state.decodes, 0); assert.equal(state.created.length, 0);
});
