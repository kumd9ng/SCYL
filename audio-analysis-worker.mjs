import { analyzeAudio } from './lib/audio-analysis.mjs';

self.addEventListener('message', event => {
  try {
    const { type, pcm, sampleRate, sourceDuration, sourceSampleRate } = event.data || {};
    if (type !== 'analyze' || !(pcm instanceof Float32Array) || !Number.isFinite(sampleRate) || sampleRate <= 0 || sampleRate > 12000 || !Number.isFinite(sourceDuration) || sourceDuration <= 0 || !Number.isFinite(sourceSampleRate) || sourceSampleRate <= 0) throw new Error('분석할 오디오 데이터가 올바르지 않습니다.');
    const analysis = analyzeAudio({ channels: [pcm], sampleRate }, { peakCount: 4096 });
    analysis.analysisSampleRate = sampleRate;
    analysis.sampleRate = sourceSampleRate;
    analysis.duration = sourceDuration;
    self.postMessage({ ok: true, analysis }, [analysis.peaks.buffer]);
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : '음원 분석에 실패했습니다.' });
  }
});
