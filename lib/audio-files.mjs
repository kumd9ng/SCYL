// Local files stay in this browser. No upload, storage, playback, or YouTube fetch.
const MAX_FILE_BYTES = 60 * 1024 * 1024;
const MAX_DURATION = 12 * 60;
const MAX_PCM_BYTES = 256 * 1024 * 1024;
const abortError = () => new DOMException('음원 불러오기를 취소했습니다.', 'AbortError');
const checkAbort = signal => { if (signal?.aborted) throw abortError(); };
const yieldTask = () => new Promise(resolve => setTimeout(resolve, 0));

function cancellable(work, signal, milliseconds, timeoutMessage) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
      error ? reject(error) : resolve(value);
    };
    const onAbort = () => finish(abortError());
    const timer = setTimeout(() => finish(new Error(timeoutMessage)), milliseconds);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }
    Promise.resolve().then(() => { checkAbort(signal); return work(); }).then(value => finish(null, value), error => finish(error));
  });
}

async function readDuration(file, signal) {
  if (typeof globalThis.Audio !== 'function' || typeof globalThis.URL?.createObjectURL !== 'function') throw new Error('이 브라우저에서는 오디오 파일 정보를 읽을 수 없습니다.');
  const audio = new Audio();
  let objectURL;
  try {
    checkAbort(signal);
    audio.preload = 'metadata'; audio.autoplay = false; audio.muted = true;
    objectURL = URL.createObjectURL(file);
    const duration = await cancellable(() => new Promise((resolve, reject) => {
      audio.onloadedmetadata = () => resolve(audio.duration);
      audio.onerror = () => reject(new Error('오디오 파일 정보를 읽지 못했습니다. 이 브라우저에서 지원하는 파일인지 확인해 주세요.'));
      audio.src = objectURL; audio.load();
    }), signal, 15000, '오디오 파일 정보를 확인하는 데 시간이 너무 오래 걸립니다.');
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('재생 길이를 확인할 수 없는 오디오 파일입니다.');
    if (duration > MAX_DURATION) throw new Error('한 곡은 12분 이하여야 합니다.');
    return duration;
  } finally {
    audio.onloadedmetadata = null; audio.onerror = null;
    try { audio.pause(); } catch {}
    try { audio.removeAttribute('src'); audio.load(); } catch {}
    if (objectURL !== undefined) URL.revokeObjectURL(objectURL);
  }
}

async function copyAnalysisPCM(buffer, signal) {
  const stride = Math.max(1, Math.ceil(buffer.sampleRate / 12000));
  const pcm = new Float32Array(Math.ceil(buffer.length / stride));
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
  if (channels.some(channel => channel.length !== buffer.length)) throw new Error('디코딩된 오디오 길이가 올바르지 않습니다.');
  for (let output = 0; output < pcm.length; output++) {
    if (output % 16384 === 0) { checkAbort(signal); await yieldTask(); checkAbort(signal); }
    const start = output * stride, end = Math.min(buffer.length, start + stride);
    let strongest = 0;
    for (let index = start; index < end; index++) {
      for (const channel of channels) {
        const sample = channel[index];
        // Preserve actual peaks without cancelling opposite-polarity stereo.
        if (Number.isFinite(sample) && Math.abs(sample) > Math.abs(strongest)) strongest = sample;
      }
    }
    pcm[output] = strongest;
  }
  checkAbort(signal);
  return { pcm, sampleRate: buffer.sampleRate / stride, sourceDuration: buffer.duration, sourceSampleRate: buffer.sampleRate };
}

async function analyzeInWorker(payload, signal) {
  let worker;
  try {
    checkAbort(signal);
    worker = new Worker(new URL('audio-analysis-worker.js', document.baseURI), { type: 'module', name: 'scyl-audio-analysis' });
    return await cancellable(() => new Promise((resolve, reject) => {
      worker.onmessage = event => {
        const result = event.data;
        if (!result?.ok) { reject(new Error(typeof result?.error === 'string' ? result.error : '음원 분석에 실패했습니다.')); return; }
        if (!result.analysis || !(result.analysis.peaks instanceof Float32Array) || result.analysis.peaks.length !== 4096 || !Number.isFinite(result.analysis.duration)) { reject(new Error('음원 분석 결과가 올바르지 않습니다.')); return; }
        resolve(result.analysis);
      };
      worker.onerror = () => reject(new Error('음원 분석 작업을 실행하지 못했습니다. 브라우저를 확인해 주세요.'));
      worker.onmessageerror = () => reject(new Error('음원 분석 결과를 읽지 못했습니다.'));
      // Only this pooled copy is transferred. AudioBuffer channel data is retained.
      worker.postMessage({ type: 'analyze', ...payload }, [payload.pcm.buffer]);
    }), signal, 45000, '음원 분석 시간이 초과됐습니다. 더 짧은 파일로 다시 시도해 주세요.');
  } finally {
    if (worker) {
      worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null;
      worker.terminate();
    }
  }
}

/**
 * Decode and analyze a local File without playing it or sending it anywhere.
 * Returns {id,title,buffer,analysis}; the caller owns/release-references to buffer.
 * Abort rejects with AbortError and stops analysis. Browser decodeAudioData itself
 * cannot be interrupted; a late result is discarded and never starts a worker.
 */
export async function loadAudioFile(file, { context, id, title, signal } = {}) {
  checkAbort(signal);
  if (!file || typeof file.arrayBuffer !== 'function' || !Number.isFinite(file.size) || file.size <= 0) throw new Error('읽을 수 있는 오디오 파일을 선택해 주세요.');
  if (file.size > MAX_FILE_BYTES) throw new Error('한 파일은 60MiB 이하여야 합니다.');
  if (!context || typeof context.decodeAudioData !== 'function' || !Number.isFinite(context.sampleRate) || context.sampleRate <= 0) throw new Error('오디오 재생 환경이 준비되지 않았습니다.');
  if (typeof globalThis.Worker !== 'function') throw new Error('이 브라우저는 별도 음원 분석 작업을 지원하지 않습니다. 최신 브라우저에서 열어 주세요.');
  const duration = await readDuration(file, signal);
  checkAbort(signal);
  // Metadata does not expose channel count. Conservatively budget for stereo
  // before decoding, then verify the actual decoded channel count and allocation.
  if (duration * context.sampleRate * 2 * Float32Array.BYTES_PER_ELEMENT > MAX_PCM_BYTES) throw new Error('이 음원의 예상 메모리가 256MiB를 넘습니다. 더 짧은 파일을 선택해 주세요.');
  const bytes = await cancellable(() => file.arrayBuffer(), signal, 15000, '오디오 파일을 읽는 시간이 초과됐습니다.');
  checkAbort(signal);
  const buffer = await cancellable(() => context.decodeAudioData(bytes), signal, 30000, '오디오 디코딩 시간이 초과됐습니다.');
  checkAbort(signal);
  if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > MAX_DURATION || !Number.isFinite(buffer.sampleRate) || buffer.sampleRate <= 0 || !Number.isSafeInteger(buffer.length) || buffer.length <= 0 || typeof buffer.getChannelData !== 'function') throw new Error('디코딩된 오디오 길이가 올바르지 않거나 12분을 넘습니다.');
  if (![1, 2].includes(buffer.numberOfChannels)) throw new Error('모노 또는 스테레오 음원만 지원합니다.');
  if (buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT > MAX_PCM_BYTES) throw new Error('디코딩된 음원의 메모리가 256MiB를 넘습니다.');
  const payload = await copyAnalysisPCM(buffer, signal);
  const analysis = await analyzeInWorker(payload, signal);
  checkAbort(signal);
  return { id: id ?? crypto.randomUUID(), title: title ?? String(file.name || 'Local audio').replace(/\.[^.]+$/, ''), buffer, analysis };
}
