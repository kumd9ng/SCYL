import { createDemoAudio } from './lib/demo-audio.mjs';
import { analyzeAudio } from './lib/audio-analysis.mjs';
import { createAudioMixEngine } from './lib/audio-engine.mjs';
import { loadAudioFile } from './lib/audio-files.mjs';
import { createFilePlaybackLifecycle } from './lib/file-playback-lifecycle.mjs';
import { createWaveformTransport, WAVEFORM_VIEW_SECONDS } from './lib/waveform-transport.mjs';
import { mountAccount } from './lib/account-ui.mjs';
import { mountAppleMusicPanel } from './lib/apple-music-panel.mjs';

const $ = id => document.getElementById(id);
const mixOptions = Object.freeze({ overlapRatio: .1, beatmatch: false });
let context, engine, tracks = [], fileQueue = [], queueIndex = 0;
let sourceMode = 'none', busy = false, selectedFx = 0, lastStatus = '';
let generation = 0, playbackIntent = 0, loadingNext = false, wantsPlayback = false, loading = new AbortController();
let waveTransport = null;
let playbackStarted = false;
let appleMusicPanel;
const accountGate = mountAccount({ onLock() { waveTransport?.cancel(); playbackIntent++; wantsPlayback = false; engine?.pause(); appleMusicPanel?.clear(); } });
const format = seconds => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;
function message(text) { if (text !== lastStatus) { $('engine-message').textContent = text; lastStatus = text; } }
const playbackLifecycle = createFilePlaybackLifecycle({
  onInterrupt(reason) {
    appleMusicPanel?.suspend();
    waveTransport?.cancel();
    playbackIntent++; wantsPlayback = false;
    if (!engine) return;
    if (engine.snapshot().state === 'playing') engine.pause();
    if (engine.snapshot().state !== 'paused') return;
    $('pause').disabled = false; $('pause').textContent = '이어 듣기';
    $('demo-play').textContent = '이 위치에서 재생';
    message(reason.startsWith('audio-')
      ? '기기의 오디오가 중단되어 일시정지했습니다. 이어 듣기를 누르면 같은 위치에서 재생합니다.'
      : '앱을 벗어나 일시정지했습니다. 돌아온 뒤 이어 듣기를 눌러 주세요.');
  },
  onError() { message('앱의 재생 상태를 확인하지 못했습니다. 앱을 다시 열어 주세요.'); },
});
function allowPlaybackRequest() {
  if (!accountGate.require()) return false;
  if (playbackLifecycle.canRequestPlayback()) { appleMusicPanel?.suspend(); return true; }
  const state = playbackLifecycle.getState();
  message(state.failed || state.contextState === 'closed'
    ? '재생을 준비하지 못했습니다. 앱이나 페이지를 다시 열어 주세요.'
    : '앱이 화면에 표시되고 준비된 뒤 재생을 눌러 주세요.');
  return false;
}
appleMusicPanel = mountAppleMusicPanel({
  root: $('apple-music-section'),
  canUse: () => accountGate.canUse() && playbackLifecycle.canRequestPlayback() && !document.querySelector('dialog[open]'),
  onActivate() {
    waveTransport?.cancel(); playbackIntent++; wantsPlayback = false; engine?.pause();
    if (engine) { $('pause').textContent = '이어 듣기'; $('demo-play').textContent = '이 위치에서 재생'; }
  },
});
appleMusicPanel.activate();
new MutationObserver(() => {
  if (document.querySelector('dialog[open]')) appleMusicPanel.suspend();
}).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
function getContext() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) throw new Error('이 브라우저는 Web Audio를 지원하지 않습니다.');
  if (!context) { context = new Audio(); playbackLifecycle.setContext(context); }
  return context;
}
function renderQueue() {
  $('queue-summary').textContent = `세트 · ${fileQueue.length}곡`;
  $('file-queue').replaceChildren(...fileQueue.map((item, index) => {
    const li = document.createElement('li'); li.textContent = item.title;
    if (index === queueIndex) li.setAttribute('aria-current', 'true');
    return li;
  }));
}
function renderTracks() {
  for (let index = 0; index < 2; index++) {
    const key = index ? 'b' : 'a', track = tracks[index];
    $('title-' + key).textContent = track?.title || (index ? fileQueue[queueIndex + 1]?.title || '다음 곡 없음' : '음악 파일을 선택하세요');
    $('tempo-' + key).textContent = track ? track.analysis.bpm ? `${track.analysis.bpm.toFixed(1)} BPM · 추정` : '박자 불확실' : index && loadingNext ? '분석 중' : '—';
    if (!track) { $('time-' + key).textContent = '0:00'; $('gain-' + key).textContent = '0%'; }
  }
  renderQueue();
}
function resetSession(mode) {
  waveTransport?.cancel();
  generation++; playbackIntent++; loading.abort(); loading = new AbortController();
  wantsPlayback = false; engine?.dispose(); engine = null; tracks = []; fileQueue = []; queueIndex = 0;
  sourceMode = mode; loadingNext = false; busy = false;
  playbackStarted = false;
  $('demo-play').disabled = true; $('pause').disabled = true; $('stop').disabled = true;
  $('pause').textContent = '일시정지'; $('demo-play').textContent = '세트 재생'; renderTracks();
  return generation;
}
function createEngine() {
  engine = createAudioMixEngine({ context: getContext(), masterGain: .65,
    onAdvance(event) {
      if (sourceMode !== 'files' || tracks[1]?.id !== event.to.id) return;
      waveTransport?.cancel();
      if ($('fx-sheet').open) $('fx-sheet').close();
      engine.queueNext(null); tracks = [tracks[1]];
      queueIndex = fileQueue.findIndex(item => item.id === tracks[0].id);
      renderTracks(); void attachNext(generation, engine);
    },
    onFinished() { message(loadingNext ? '다음 곡을 준비하고 있습니다.' : '세트 재생이 끝났습니다.'); },
    onError(error) { message('재생 오류: ' + error.message); },
  });
  engine.setTracks(tracks);
  engine.prepare(mixOptions);
}
async function decode(entry, token) {
  const result = await loadAudioFile(entry.file, { context: getContext(), id: entry.id, title: entry.title, signal: loading.signal });
  if (generation !== token) throw new DOMException('Cancelled', 'AbortError');
  return result;
}
async function attachNext(token, targetEngine) {
  if (loadingNext || sourceMode !== 'files') return;
  loadingNext = true; renderTracks();
  try {
    while (token === generation && fileQueue[queueIndex + 1]) {
      const entry = fileQueue[queueIndex + 1];
      let next;
      try {
        next = await decode(entry, token);
      } catch (error) {
        if (token !== generation || error.name === 'AbortError') return;
        fileQueue = fileQueue.filter(item => item.id !== entry.id);
        message(`${entry.title}: ${error.message} 다음 파일을 확인합니다.`); renderQueue();
        continue;
      }
      if (token !== generation || engine !== targetEngine) return;
      waveTransport?.cancel();
      let pendingTracks = [tracks[0], next];
      const beginNext = () => {
        pendingTracks = [next]; engine.setTracks(pendingTracks); tracks = pendingTracks;
        queueIndex = fileQueue.findIndex(item => item.id === entry.id);
        if (wantsPlayback && playbackLifecycle.canPlay()) engine.play(mixOptions);
        else { $('pause').disabled = true; $('stop').disabled = true; }
        renderTracks();
      };
      try {
        const currentState = engine.snapshot().state;
        if (currentState === 'ended') { beginNext(); continue; }
        if (currentState === 'playing' || currentState === 'paused') {
          try { engine.queueNext(next, mixOptions); }
          catch (error) {
            // The context clock can pass the end between snapshot and scheduling.
            if (engine.snapshot().state !== 'ended') throw error;
            beginNext(); continue;
          }
        } else engine.setTracks(pendingTracks);
        tracks = pendingTracks; renderTracks(); return;
      } catch (error) {
        // A scheduling failure does not make a successfully decoded file invalid.
        playbackIntent++; wantsPlayback = false;
        engine.stop(); engine.setTracks(pendingTracks); tracks = pendingTracks;
        $('pause').disabled = true; $('stop').disabled = true;
        message(`재생 준비 오류: ${error.message} 파일은 유지했습니다. 재생을 다시 눌러 주세요.`);
        renderTracks(); return;
      }
    }
  } finally { if (token === generation) { loadingNext = false; renderTracks(); } }
}
$('choose-files').addEventListener('click', () => { if (accountGate.require()) $('audio-files').click(); });
$('audio-files').addEventListener('change', async event => {
  const files = [...event.target.files]; event.target.value = '';
  if (!accountGate.require()) return;
  if (!files.length) return;
  if (files.length > 100) { message('한 번에 최대 100곡까지 선택할 수 있습니다.'); return; }
  const token = resetSession('files'); busy = true;
  fileQueue = files.map(file => ({ id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, '') || file.name, file }));
  $('source-note').textContent = '파일 음원 10% 겹침 재생 · 속도는 그대로, 음원과 분석 데이터는 이 기기에서만 처리합니다.';
  try {
    getContext();
    for (let index = 0; index < fileQueue.length && tracks.length < 2;) {
      const entry = fileQueue[index]; message(`${entry.title} · 음원과 박자를 분석하고 있습니다.`); renderQueue();
      try { tracks.push(await decode(entry, token)); index++; renderTracks(); }
      catch (error) {
        if (generation !== token || error.name === 'AbortError') return;
        fileQueue.splice(index, 1); message(`${entry.title}: ${error.message}`);
      }
    }
    if (!tracks.length) { message('재생할 수 있는 음악 파일을 찾지 못했습니다. MP3 또는 WAV 파일을 선택해 주세요.'); return; }
    createEngine(); $('demo-play').disabled = false;
    message(`${fileQueue.length}곡을 담았습니다. 현재 곡의 마지막 10%에서 다음 곡을 겹쳐 재생합니다.`); renderTracks();
  } catch (error) { if (generation === token) message(error.message); }
  finally { if (generation === token) busy = false; }
});
function makeDemoTrack(settings, id, title) {
  const data = createDemoAudio(settings), buffer = getContext().createBuffer(data.channels.length, data.channels[0].length, data.sampleRate);
  data.channels.forEach((channel, index) => buffer.copyToChannel(channel, index));
  return { id, title, buffer, analysis: analyzeAudio(data, { peakCount: 4096 }) };
}
$('demo-load').addEventListener('click', async () => {
  if (!allowPlaybackRequest()) return;
  const token = resetSession('demo'), intent = playbackIntent; busy = true;
  try {
    await getContext().resume();
    if (token !== generation || intent !== playbackIntent || !playbackLifecycle.canRequestPlayback()) return;
    if (context.state !== 'running') throw new Error('오디오를 시작하지 못했습니다. 재생 버튼을 다시 눌러 주세요.');
    tracks = [makeDemoTrack({ bpm: 120, phase: .08 }, 'demo-a', '합성 데모 · 120 BPM'), makeDemoTrack({ bpm: 126, phase: .13, voice: 1 }, 'demo-b', '합성 데모 · 126 BPM')];
    fileQueue = tracks.map(({ id, title }) => ({ id, title }));
    $('source-note').textContent = '직접 합성한 두 음원으로 믹싱을 확인하는 데모입니다. YouTube 음원이 아닙니다.';
    createEngine(); engine.seek(Math.max(0, tracks[0].buffer.duration * (1 - mixOptions.overlapRatio) - 3)); engine.resume(); wantsPlayback = true; playbackStarted = true;
    $('demo-play').disabled = false; $('demo-play').textContent = '데모 다시 듣기'; $('pause').disabled = false; $('stop').disabled = false;
    message('전환 3초 전부터 재생합니다. 마지막 10% 구간에서 속도를 바꾸지 않고 두 곡을 겹칩니다.'); renderTracks();
  } catch (error) { if (token === generation) message(error.message); }
  finally { if (token === generation) busy = false; }
});
$('demo-play').addEventListener('click', async () => {
  if (busy || !engine) return;
  if (!allowPlaybackRequest()) return;
  waveTransport?.cancel();
  const targetEngine = engine, token = generation, intent = ++playbackIntent;
  try {
    await getContext().resume();
    if (token !== generation || targetEngine !== engine || intent !== playbackIntent || !playbackLifecycle.canRequestPlayback()) return;
    if (context.state !== 'running') throw new Error('오디오를 시작하지 못했습니다. 재생 버튼을 다시 눌러 주세요.');
    if (targetEngine.snapshot().state !== 'paused') {
      targetEngine.prepare(mixOptions);
      if (sourceMode === 'demo') targetEngine.seek(Math.max(0, tracks[0].buffer.duration * (1 - mixOptions.overlapRatio) - 3));
    }
    targetEngine.resume(); wantsPlayback = true; playbackStarted = true;
    $('pause').disabled = false; $('stop').disabled = false; $('pause').textContent = '일시정지';
    $('demo-play').textContent = sourceMode === 'demo' ? '데모 다시 듣기' : '현재 곡 처음부터'; message('재생 중 · 현재 곡의 마지막 10%에서 다음 곡을 겹쳐 재생합니다.');
  } catch (error) { if (token === generation && targetEngine === engine && intent === playbackIntent) message(error.message); }
});
$('pause').addEventListener('click', async () => {
  if (!engine) return;
  waveTransport?.cancel();
  const targetEngine = engine, token = generation, intent = ++playbackIntent;
  try {
    if (targetEngine.snapshot().state === 'paused') {
      if (!allowPlaybackRequest()) return;
      await context.resume();
      if (token !== generation || targetEngine !== engine || intent !== playbackIntent || !playbackLifecycle.canRequestPlayback()) return;
      if (context.state !== 'running') throw new Error('재생 버튼을 다시 눌러 주세요.');
      targetEngine.resume(); wantsPlayback = true; playbackStarted = true; $('pause').textContent = '일시정지'; $('demo-play').textContent = '현재 곡 처음부터'; message('재생을 이어갑니다.');
    } else { wantsPlayback = false; targetEngine.pause(); $('pause').textContent = '이어 듣기'; $('demo-play').textContent = '이 위치에서 재생'; message('일시정지했습니다. 이어 듣기를 누르면 같은 위치에서 재생합니다.'); }
  } catch (error) { if (token === generation && targetEngine === engine && intent === playbackIntent) message(error.message); }
});
$('stop').addEventListener('click', () => { waveTransport?.cancel(); playbackIntent++; wantsPlayback = false; playbackStarted = false; engine?.stop(); if (engine) engine.setTracks(tracks); $('pause').disabled = true; $('stop').disabled = true; $('demo-play').textContent = '세트 재생'; message('정지했습니다.'); });
document.querySelectorAll('.lab-fx').forEach(button => button.addEventListener('click', () => {
  if (!engine || !tracks[Number(button.dataset.deck)]) { message('음악 파일이나 데모를 준비한 뒤 FX를 적용할 수 있습니다.'); return; }
  selectedFx = Number(button.dataset.deck);
  const effects = engine.snapshot().decks[selectedFx].fx;
  $('fx-title').textContent = `${tracks[selectedFx].title} / FX`;
  $('filter').value = effects.filterHz; $('echo').value = effects.echo; $('fx-sheet').showModal();
}));
for (const id of ['filter', 'echo']) $(id).addEventListener('input', () => engine?.setFx(selectedFx, { filterHz: Number($('filter').value), echo: Number($('echo').value) }));
document.addEventListener('visibilitychange', () => playbackLifecycle.visibilityChanged());
addEventListener('pagehide', () => { void playbackLifecycle.stop().catch(() => {}); });
addEventListener('pageshow', event => { if (event.persisted) void playbackLifecycle.start().catch(() => {}); });
void playbackLifecycle.start().catch(() => {});

const canvas = $('live-wave'), pen = canvas.getContext('2d');
// Read the same SCYL palette as the visible legend; keep color out of audio logic.
const themeStyle = getComputedStyle(document.documentElement);
const waveColors = Object.fromEntries(['current', 'next', 'grid'].map(role => [role, themeStyle.getPropertyValue(`--wave-${role}`).trim()]));
waveColors.ink = themeStyle.getPropertyValue('--ink').trim();
waveColors.paper = themeStyle.getPropertyValue('--paper').trim();
waveTransport = createWaveformTransport({
  element: canvas, getEngine: () => engine,
  getIdentity: () => `${generation}:${tracks.map(track => track.id).join('|')}`,
  canSeek: () => accountGate.canUse() && !busy && playbackLifecycle.canRequestPlayback(),
  prepare: target => target.prepare(mixOptions),
  onBegin() { playbackIntent++; wantsPlayback = false; },
  onChange({ seeking, cancelled, snapshot }) {
    if (!snapshot) return;
    $('pause').textContent = '이어 듣기';
    $('pause').disabled = snapshot.state !== 'paused';
    $('stop').disabled = false;
    $('demo-play').textContent = snapshot.state === 'paused' ? '이 위치에서 재생' : '현재 곡 처음부터';
    if (!cancelled) message(seeking ? `재생 위치 이동 · ${format(snapshot.position)}` : `${format(snapshot.position)} 위치로 이동했습니다.`);
  },
  async onResume(target, isCurrent) {
    const token = generation, intent = playbackIntent;
    await getContext().resume();
    if (!isCurrent() || token !== generation || intent !== playbackIntent || engine !== target || !playbackLifecycle.canPlay()) return;
    target.resume(); wantsPlayback = true; playbackStarted = true;
    $('pause').disabled = false; $('pause').textContent = '일시정지';
    $('demo-play').textContent = '현재 곡 처음부터';
    message('이동한 위치에서 두 곡을 함께 이어 듣습니다.');
  },
  onError(error) { message(`재생 위치를 옮기지 못했습니다. ${error.message}`); },
});
const curveEnvelopes = new WeakMap();
let curveClockTrack = null, curveClockAnchor = 0;
function smoothEnvelope(track) {
  if (curveEnvelopes.has(track)) return curveEnvelopes.get(track);
  const peaks = track.analysis.peaks, count = peaks.length;
  const prefix = new Float64Array(count + 1), envelope = new Float32Array(count);
  // A short RMS window turns the sampled peaks into one continuous contour.
  // It preserves silence and the recording's energy changes, without an invented oscillator.
  const radius = Math.max(1, Math.round(.18 * count / track.analysis.duration));
  for (let i = 0; i < count; i++) prefix[i + 1] = prefix[i] + peaks[i] * peaks[i];
  let maximum = 0;
  for (let i = 0; i < count; i++) {
    const first = Math.max(0, i - radius), last = Math.min(count, i + radius + 1);
    envelope[i] = Math.sqrt((prefix[last] - prefix[first]) / (last - first));
    maximum = Math.max(maximum, envelope[i]);
  }
  const result = { samples: envelope, maximum };
  curveEnvelopes.set(track, result); return result;
}
function drawWave(snapshot) {
  const width = canvas.width, height = canvas.height, center = width * .42, scale = width / WAVEFORM_VIEW_SECONDS;
  const baseline = height - 31, top = 18, amplitude = baseline - top - 12;
  pen.clearRect(0, 0, width, height);
  const firstId = snapshot?.decks?.[0]?.id;
  if (snapshot && (snapshot.state === 'playing' || firstId !== curveClockTrack)) {
    curveClockTrack = firstId; curveClockAnchor = snapshot.contextTime - snapshot.position;
  }
  // The AudioContext clock keeps running while paused; use the frozen transport instead.
  const now = snapshot ? curveClockAnchor + snapshot.position : 0;
  const plan = snapshot?.plan;
  const fadeStart = plan ? plan.startTime - now : Infinity;
  const fadeEnd = plan ? plan.endTime - now : Infinity;
  if (plan && plan.fadeDuration > 0) {
    const left = Math.max(0, center + fadeStart * scale), right = Math.min(width, center + fadeEnd * scale);
    if (right > left) {
      pen.save(); pen.fillStyle = waveColors.ink; pen.globalAlpha = .05; pen.fillRect(left, top, right - left, baseline - top); pen.restore();
      pen.strokeStyle = waveColors.grid; pen.lineWidth = 1;
      pen.beginPath(); pen.moveTo(left, top); pen.lineTo(left, baseline); pen.moveTo(right, top); pen.lineTo(right, baseline); pen.stroke();
    }
  }
  function trace(points) {
    pen.beginPath(); pen.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      const previous = points[i - 1], current = points[i];
      pen.quadraticCurveTo(previous[0], previous[1], (previous[0] + current[0]) / 2, (previous[1] + current[1]) / 2);
    }
    const last = points.at(-1); pen.lineTo(last[0], last[1]);
  }
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i], deck = snapshot?.decks?.[i], envelope = smoothEnvelope(track);
    const rate = deck?.rate || 1;
    // Pending B lives at its scheduled time on the same axis as A, rather than
    // falsely drawing its start at the playhead before it is audible.
    const position = i === 1 && plan && !deck?.started ? plan.offset - fadeStart * rate : deck?.position || 0;
    const points = [];
    for (let x = 0; x <= width; x += 5) {
      const delta = (x - center) / scale, time = position + delta * rate;
      let level = 0;
      if (time >= 0 && time < track.analysis.duration && envelope.maximum > 0) {
        const sample = time / track.analysis.duration * (envelope.samples.length - 1), index = Math.floor(sample), mix = sample - index;
        const value = envelope.samples[index] * (1 - mix) + envelope.samples[Math.min(index + 1, envelope.samples.length - 1)] * mix;
        level = Math.pow(Math.max(0, value) / envelope.maximum, .65);
        if (plan) {
          const fraction = plan.fadeDuration > 0 ? Math.max(0, Math.min(1, (delta - fadeStart) / plan.fadeDuration)) : Number(delta >= fadeStart);
          level *= i ? Math.sin(fraction * Math.PI / 2) : Math.cos(fraction * Math.PI / 2);
        } else if (i === 1) level = 0;
      }
      points.push([x, baseline - level * amplitude]);
    }
    trace(points); pen.lineTo(width, baseline); pen.lineTo(0, baseline); pen.closePath();
    pen.save(); pen.fillStyle = i ? waveColors.next : waveColors.current; pen.globalAlpha = i ? .4 : .44; pen.fill(); pen.restore();
    trace(points); pen.strokeStyle = i ? waveColors.next : waveColors.current; pen.lineWidth = 2.2; pen.lineJoin = 'round'; pen.lineCap = 'round';
    pen.stroke();
  }
  pen.strokeStyle = waveColors.paper; pen.lineWidth = 5;
  pen.beginPath(); pen.moveTo(center, top - 4); pen.lineTo(center, baseline); pen.stroke();
  pen.strokeStyle = waveColors.ink; pen.lineWidth = 1.5;
  pen.beginPath(); pen.moveTo(center, top - 4); pen.lineTo(center, baseline); pen.stroke();
}
function frame() {
  const snapshot = engine?.snapshot();
  drawWave(snapshot);
  canvas.setAttribute('aria-disabled', String(!snapshot?.duration || busy || !playbackLifecycle.canRequestPlayback()));
  canvas.setAttribute('aria-valuemax', String(Number((snapshot?.duration || 0).toFixed(2))));
  canvas.setAttribute('aria-valuenow', String(Number((snapshot?.position || 0).toFixed(2))));
  canvas.setAttribute('aria-valuetext', `${format(snapshot?.position || 0)} / ${format(snapshot?.duration || 0)}`);
  if (snapshot) {
    snapshot.decks.forEach((deck, index) => { const key = index ? 'b' : 'a'; $('time-' + key).textContent = format(deck.position); $('gain-' + key).textContent = `${Math.round(deck.gain * 100)}%`; $('dial-' + key).style.setProperty('--angle', (deck.position / (tracks[index]?.analysis.beatInterval || .5) * 36) + 'deg'); });
    const two = snapshot.decks.filter(deck => deck.started && !deck.ended && deck.gain > .005).length === 2;
    if (waveTransport.isSeeking()) $('mix-state').textContent = '위치 이동 중';
    else if (snapshot.state === 'paused') $('mix-state').textContent = playbackStarted ? '일시정지' : snapshot.position > 0 ? '위치 선택' : '재생 준비';
    else if (two) $('mix-state').textContent = '겹침 · 2곡 재생';
    else if (snapshot.state === 'playing' && snapshot.plan && snapshot.contextTime < snapshot.plan.startTime) $('mix-state').textContent = `${Math.max(0, snapshot.plan.startTime - snapshot.contextTime).toFixed(1)}초 후 전환`;
    else $('mix-state').textContent = snapshot.state === 'playing' ? '재생 중' : snapshot.state === 'ended' ? '완료' : '정지';
    const plan = snapshot.plan;
    $('wave-detail').textContent = plan
      ? `마지막 10% · ${plan.fadeDuration.toFixed(1)}초 겹침 · 원래 속도${plan.reason === 'incoming-short' ? ' (짧은 다음 곡에 맞춤)' : plan.reason === 'late-start' ? ' (남은 구간에 맞춤)' : ''}`
      : '현재 곡의 마지막 10%에서 다음 곡을 겹쳐 재생합니다. 속도는 바꾸지 않습니다.';
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
