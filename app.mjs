import { parseYouTubeUrl, formatTime } from './lib/youtube.mjs';
import { TRANSITION_MODES } from './lib/transition.mjs';
import { createYouTubeOverlapController } from './lib/youtube-overlap.mjs';
import { createNativeLifecycleController } from './lib/native-lifecycle.mjs';
import { mountAccount } from './lib/account-ui.mjs';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'scyl.session.v1';
const PLAYING = 1, PAUSED = 2, BUFFERING = 3, CUED = 5, ENDED = 0;
const slots = [0, 1].map(index => ({ index, player: null, ready: false, key: null, gain: 1, failed: false }));
let queue = [], currentKey = null, activeSlot = 0, repeat = false, mode = 'balanced', volume = 80;
let playedIds = new Set(), switching = false, generation = 0;
let seeking = false, playing = false, status = '플레이어 연결 중', apiFailed = false;
let seekValue = 0, jogDrag = null;
let exporting = false;
let toastTimer, playWaitTimer, storageWarned = false, lastTime = null;
let apiTimeout, youtubeConsent = false, youtubeStarted = false, storageCleared = false;
let needsNativePlay = false, apiScript = null;
try { youtubeConsent = localStorage.getItem('scyl.privacy.v1') === 'accepted'; } catch {}
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const nativePlatform = Boolean(window.Capacitor?.isNativePlatform?.());
let nativeReady = !nativePlatform, nativeActive = !nativePlatform, nativeStateFailed = false;
let nativeLifecycle = null;
let accountGate;
const canUseMusic = () => accountGate?.canUse() && !document.hidden && nativeReady && nativeActive && !document.querySelector('dialog[open]');
const playbackAllowed = () => canUseMusic();
const modes = TRANSITION_MODES;
const keyFor = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const trackFor = key => queue.find(track => track.key === key);
const currentTrack = () => trackFor(currentKey);
const currentIndex = () => queue.findIndex(track => track.key === currentKey);
function nextTrack() {
  const index = currentIndex();
  return queue[index + 1] || (repeat && queue.length ? queue[0] : null);
}
function playerState(slot) { try { return slot.player?.getPlayerState?.() ?? -1; } catch { return -1; } }
function readPlayer(slot, method, fallback = 0) { try { return slot.player?.[method]?.() ?? fallback; } catch { return fallback; } }
function setStatus(message, error = false) {
  status = message; $('engine-status').textContent = message; $('engine-status').classList.toggle('error', error);
}
function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}
function inputMessage(message, error = false) {
  $('input-message').textContent = message; $('input-message').classList.toggle('error', error);
}
function closeSheets() {
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
}
function openSheet(id, { focusInput = false } = {}) {
  const dialog = $(id);
  if (!dialog) return false;
  // A sheet must not obscure a playing YouTube video. Returning never auto-resumes.
  if (switching || slots.some(slot => [PLAYING, BUFFERING].includes(playerState(slot)))) pausePlayback('플레이어로 돌아와 재생을 눌러 주세요.');
  closeSheets(); dialog.showModal();
  if (focusInput) $('url-input').focus();
  renderPlayback();
  return true;
}
function selectTrack(key) {
  closeSheets();
  if (overlap.snapshot()?.incoming.key === key && overlap.snapshot()?.confirmed && overlap.finish()) return;
  void switchTo(key, { autoplay: youtubeConsent, nativePreview: ios });
  if (!youtubeConsent) openSheet('connect-dialog');
}
function persist() {
  if (storageCleared) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, queue, currentKey, repeat, mode, volume, playedIds: [...playedIds].slice(0, 14) }));
  } catch {
    if (!storageWarned) { toast('브라우저 저장공간을 사용할 수 없습니다. 세트 저장 버튼으로 보관해 주세요.'); storageWarned = true; }
  }
}
function restore() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!data || data.version !== 1 || !Array.isArray(data.queue)) return;
    const keys = new Set();
    queue = data.queue.slice(0, 500).flatMap(item => {
      try {
        const parsed = parseYouTubeUrl(item.url);
        const key = typeof item.key === 'string' && !keys.has(item.key) ? item.key : keyFor(); keys.add(key);
        return [{ ...parsed, key, title: typeof item.title === 'string' ? item.title.slice(0, 300) : `YouTube · ${parsed.id}`, author: typeof item.author === 'string' ? item.author.slice(0, 200) : 'YouTube' }];
      } catch { return []; }
    });
    currentKey = queue.some(t => t.key === data.currentKey) ? data.currentKey : queue[0]?.key || null;
    repeat = data.repeat === true;
    mode = Object.hasOwn(modes, data.mode) ? data.mode : 'balanced';
    volume = Number.isFinite(data.volume) ? Math.max(0, Math.min(100, data.volume)) : 80;
    playedIds = new Set(Array.isArray(data.playedIds) ? data.playedIds.filter(id => typeof id === 'string' && /^[\w-]{11}$/.test(id)).slice(0, 14) : []);
  } catch { inputMessage('이전에 저장한 세트를 읽지 못했습니다. 링크를 새로 추가해 주세요.'); }
}
function setGain(slot, gain) {
  slot.gain = Math.max(0, Math.min(1, gain));
  if (slot.ready) { try { slot.player.setVolume(Math.round(volume * slot.gain)); } catch { /* Ready may race navigation. */ } }
}
function applyVolume() { slots.forEach(slot => setGain(slot, slot.gain)); }
const overlap = createYouTubeOverlapController({
  context: () => ({
    current: currentTrack() ? { ...currentTrack(), slot: activeSlot } : null,
    next: nextTrack() ? { ...nextTrack(), slot: 1 - activeSlot } : null,
    allowed: playbackAllowed(), seeking, switching,
  }),
  read(index) {
    const slot = slots[index], data = readPlayer(slot, 'getVideoData', {});
    return { key: slot.key, ready: slot.ready, failed: slot.failed,
      state: playerState(slot), time: readPlayer(slot, 'getCurrentTime'),
      duration: readPlayer(slot, 'getDuration'), videoId: data.video_id,
      isLive: data.isLive === true || data.isLiveContent === true };
  },
  start(index, track) {
    const slot = slots[index];
    try { slot.player.setPlaybackRate?.(1); } catch { /* A cued player already defaults to normal speed. */ }
    const time = readPlayer(slot, 'getCurrentTime');
    if (Math.abs(time - track.startSeconds) > .25 || playerState(slot) === ENDED) {
      slot.player.loadVideoById({ videoId: track.id, startSeconds: track.startSeconds });
    } else slot.player.playVideo();
  },
  pause: index => pauseSlot(slots[index]),
  gain: (index, value) => setGain(slots[index], value),
  reveal: (_outgoing, incoming) => showSource(slots[incoming]),
  promote(_outgoing, incoming) {
    generation++; activeSlot = incoming.slot; currentKey = incoming.key;
    playing = true; switching = false; needsNativePlay = false;
    clearTimeout(playWaitTimer);
    const track = currentTrack();
    if (track && playedIds.size < 14) playedIds.add(track.id);
    $('source-help-' + activeSlot).hidden = true;
    persist(); render(); prepareNext();
  },
  changed(state) {
    if ($('source-section')) {
      $('source-section').dataset.overlap = String(!!state);
      $('source-section').dataset.overlapProgress = String(state?.progress || 0);
    }
    document.body.dataset.youtubeOverlap = String(!!state);
    renderSources(); renderPlayback();
  },
  notice(reason) {
    const messages = {
      waiting: '마지막 10% · 다음 곡 연결 중', mixing: '마지막 10% · 두 곡 겹침 재생 중', promoted: '재생 중',
      'autoplay-blocked': '다음 곡 자동 재생이 차단됐어요. 현재 곡은 계속 재생합니다.',
      'incoming-timeout': '다음 곡 연결이 지연돼 현재 곡을 계속 재생합니다.',
      'incoming-unavailable': '다음 곡을 재생하지 못해 현재 곡을 계속 재생합니다.',
      'not-visible': '현재 곡을 계속 재생합니다. 다음 곡을 누르면 이어 들을 수 있어요.',
      'outgoing-error': '현재 곡 재생 오류로 겹침 재생을 멈췄습니다.',
      'ended-unavailable': '현재 곡 재생 완료 · 다음 곡을 눌러 이어 들으세요.',
    };
    if (reason === 'ended-unavailable') playing = false;
    if (messages[reason]) setStatus(messages[reason]);
    renderPlayback();
  },
});
function cancelFade({ restoreGain = true } = {}) {
  overlap.cancel(); lastTime = null;
  clearTimeout(playWaitTimer);
  if (restoreGain) slots.forEach(slot => setGain(slot, slot.index === activeSlot ? 1 : 0));
}
function pauseSlot(slot) { if (slot.ready) { try { slot.player.pauseVideo(); } catch { /* A failed player is reported by its error event. */ } } }
function showSource(slot) {
  if (document.querySelector('dialog[open]')) return false;
  const section = $('source-section');
  if (section) section.hidden = false;
  const together = overlap.snapshot();
  document.querySelectorAll('.source-card[data-source]').forEach(card => {
    const index = Number(card.dataset.source);
    card.hidden = together ? ![together.outgoing.slot, together.incoming.slot].includes(index) : index !== slot.index;
  });
  // Automatic starts require at least half of the real YouTube player on screen.
  const shell = document.querySelectorAll('.player-shell')[slot.index];
  if (!shell) return false;
  const ratio = () => {
    const r = shell.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    return r.width > 0 && r.height > 0 ? w * h / (r.width * r.height) : 0;
  };
  if (ratio() < .5) shell.scrollIntoView({ block: 'center', behavior: 'auto' });
  return ratio() >= .5;
}
function guideNativePlay(slot, message = '아래 원본 영상의 ▶를 직접 눌러 시작해 주세요.') {
  needsNativePlay = true; setStatus(message);
  const help = $('source-help-' + slot.index);
  help.textContent = message; help.hidden = false;
  showSource(slot); renderPlayback();
}
function recoverBlockedPlayback(slot) {
  const track = currentTrack();
  if (!slot.ready || !track || slot.key !== track.key || playerState(slot) === PLAYING) return;
  const time = readPlayer(slot, 'getCurrentTime', track.startSeconds);
  const startSeconds = Number.isFinite(time) ? Math.max(track.startSeconds, time) : track.startSeconds;
  cancelFade(); playing = false;
  // A rejected play request can leave YouTube in BUFFERING with no native Play
  // overlay. Re-cue only a confirmed rejection or an explicit recovery click.
  guideNativePlay(slot);
  slot.player.cueVideoById({ videoId: track.id, startSeconds });
}
function pausePlayback(message = '일시정지') {
  cancelJog();
  generation++; switching = false; slots.forEach(pauseSlot); cancelFade({ restoreGain: false }); playing = false;
  setStatus(message); renderPlayback();
}
function updateMetadataFromPlayer(slot) {
  const track = trackFor(slot.key), data = readPlayer(slot, 'getVideoData', {});
  if (!track || data.video_id !== track.id || !data.title) return;
  if (track.title === data.title && (!data.author || track.author === data.author)) return;
  track.title = data.title; if (data.author) track.author = data.author;
  persist(); render();
}
function cue(slot, track) {
  if (!slot.ready || !track || slot.key === track.key) return;
  slot.key = track.key; slot.failed = false; setGain(slot, 1);
  slot.player.cueVideoById({ videoId: track.id, startSeconds: track.startSeconds });
}
function prepareNext() {
  if (switching || overlap.snapshot()) return;
  const other = slots[1 - activeSlot], next = nextTrack();
  if (!other.ready) return;
  if (next && next.key !== currentKey) cue(other, next);
  else if (other.key) {
    pauseSlot(other); other.key = null; other.failed = false;
    try { other.player.stopVideo(); other.player.clearVideo(); } catch { /* Empty state remains safe. */ }
  }
  renderSources();
}
function prepareCurrent() {
  const track = currentTrack(), slot = slots[activeSlot];
  if (track && slot.ready) cue(slot, track);
  prepareNext(); renderPlayback();
}
function stopped(slot) {
  const state = playerState(slot);
  return !slot.ready || (state !== PLAYING && state !== BUFFERING);
}
async function waitForStop(token) {
  const deadline = performance.now() + 4000;
  while (slots.some(slot => !stopped(slot))) {
    if (generation !== token) return false;
    if (performance.now() > deadline) throw new Error('이전 영상의 일시정지를 확인하지 못했습니다. 다시 재생해 주세요.');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return generation === token;
}
async function switchTo(key, { autoplay = true, nativePreview = false } = {}) {
  const target = trackFor(key);
  if (!target) return;
  cancelJog();
  if (!slots.some(slot => slot.ready)) {
    currentKey = key; persist(); render();
    setStatus(apiFailed ? 'YouTube 연결 실패 · 새로고침 후 다시 시도' : 'YouTube 플레이어 준비 중'); return;
  }
  const token = ++generation;
  switching = true; overlap.reset(); cancelFade({ restoreGain: false }); playing = false;
  // Confirm the old playback has actually stopped before commanding a new one.
  slots.forEach(pauseSlot); setStatus('다음 곡 준비 중'); renderPlayback();
  try {
    if (!await waitForStop(token) || !trackFor(key)) return;
    let slot = slots.find(candidate => candidate.ready && candidate.key === key);
    if (!slot) slot = slots[1 - activeSlot].ready ? slots[1 - activeSlot] : slots[activeSlot];
    slots.forEach(candidate => setGain(candidate, 1));
    currentKey = key; activeSlot = slot.index; slot.key = key; slot.failed = false;
    overlap.release(slot.index);
    switching = false; lastTime = null;
    if (autoplay && !nativePreview && playbackAllowed() && showSource(slot)) {
      setGain(slot, 1);
      try { slot.player.setPlaybackRate?.(1); } catch { /* A new video defaults to normal speed. */ }
      slot.player.loadVideoById({ videoId: target.id, startSeconds: target.startSeconds });
      armPlayWait(key);
      setStatus('재생 준비 중');
    } else {
      setGain(slot, 1);
      slot.player.cueVideoById({ videoId: target.id, startSeconds: target.startSeconds });
      if (nativePreview && playbackAllowed()) guideNativePlay(slot, '아래 원본 영상 안의 ▶를 눌러 음악을 시작해 주세요.');
      else setStatus('재생을 눌러 시작하세요');
    }
    persist(); render(); prepareNext();
  } catch (error) {
    if (generation !== token) return;
    switching = false; cancelFade(); setStatus(error.message, true); toast(error.message); renderPlayback();
  }
}
function armPlayWait(key) {
  clearTimeout(playWaitTimer);
  playWaitTimer = setTimeout(() => {
    if (currentKey !== key || playerState(slots[activeSlot]) === PLAYING) return;
    setGain(slots[activeSlot], 1);
    const slot = slots[activeSlot];
    guideNativePlay(slot, playerState(slot) === BUFFERING
      ? '영상 로딩이 지연되고 있어요. 재생 화면 다시 열기를 누른 뒤 원본 영상의 ▶로 시작해 주세요.'
      : '아래 원본 영상의 ▶를 직접 눌러 시작해 주세요.');
  }, 12000);
}
function advance() {
  if (overlap.snapshot()?.confirmed && overlap.finish()) return;
  const next = nextTrack();
  if (next) void switchTo(next.key, { autoplay: true });
  else { cancelFade(); playing = false; setStatus('세트 재생 완료'); renderPlayback(); }
}
function onState(slot, state) {
  // A delayed PLAYING event can arrive after the page was hidden and paused.
  // Never let that event revive either source in the background.
  if (state === PLAYING && !playbackAllowed()) {
    pausePlayback('플레이어로 돌아와 재생을 눌러 이어 들으세요.');
    return;
  }
  updateMetadataFromPlayer(slot);
  if (switching) {
    if (state === PLAYING) pauseSlot(slot);
    return;
  }
  if (overlap.state(slot.index, state)) { renderPlayback(); return; }
  if (state === PLAYING) {
    // Native YouTube controls are supported. A user-started source becomes current.
    if (!trackFor(slot.key)) { pauseSlot(slot); return; }
    if (slot.index !== activeSlot || slot.key !== currentKey) {
      generation++; cancelFade(); activeSlot = slot.index; currentKey = slot.key;
      slots.filter(other => other !== slot).forEach(pauseSlot); setGain(slot, 1); persist(); render();
    } else slots.filter(other => other !== slot).forEach(pauseSlot);
    clearTimeout(playWaitTimer); slot.failed = false; playing = true; needsNativePlay = false;
    $('source-help-' + slot.index).hidden = true;
    const track = currentTrack();
    if (track && playedIds.size < 14 && !playedIds.has(track.id)) { playedIds.add(track.id); persist(); renderTrial(); }
    setStatus('재생 중');
    prepareNext(); renderPlayback();
  } else if (slot.index === activeSlot) {
    if (state === PAUSED) {
      playing = false; cancelFade(); setStatus(needsNativePlay ? $('source-help-' + slot.index).textContent : '일시정지'); renderPlayback();
    } else if (state === ENDED) {
      playing = false; cancelFade(); advance();
    } else if (state === BUFFERING) {
      playing = false; setStatus('영상 버퍼링 중'); renderPlayback();
    } else if (state === CUED) {
      playing = false; setStatus(needsNativePlay ? $('source-help-' + slot.index).textContent : '재생을 눌러 시작하세요'); renderPlayback();
    }
  }
}
function onError(slot, code) {
  slot.failed = true;
  const incomingFailed = overlap.failure(slot.index);
  const messages = { 2: '영상 주소를 확인해 주세요.', 5: '영상 플레이어 오류입니다. 다시 재생해 주세요.', 100: '삭제되었거나 비공개인 영상입니다.', 101: '이 영상은 외부 앱 재생을 허용하지 않습니다.', 150: '이 영상은 외부 앱 재생을 허용하지 않습니다.', 153: 'YouTube가 앱의 출처를 확인하지 못했습니다. HTTP 주소에서 다시 열어 주세요.' };
  const message = messages[code] || `YouTube 재생 오류 (${code})입니다.`;
  if (slot.index === activeSlot && !incomingFailed) { generation++; switching = false; cancelFade(); playing = false; setStatus(message, true); renderPlayback(); }
  toast(`${slot.index === activeSlot ? '현재 곡' : '다음 곡'}: ${message} 다른 곡을 선택할 수 있습니다.`);
}
function renderSources() {
  slots.forEach(slot => {
    const track = trackFor(slot.key);
    $('source-label-' + slot.index).textContent = track ? `YouTube · ${track.title}` : 'YouTube · 영상 대기';
    const link = $('source-open-' + slot.index);
    link.hidden = !track;
    if (track) link.href = track.url;
  });
  const together = overlap.snapshot();
  document.querySelectorAll('.source-card[data-source]').forEach(card => {
    const index = Number(card.dataset.source);
    card.hidden = together ? ![together.outgoing.slot, together.incoming.slot].includes(index) : index !== activeSlot;
  });
}
function renderTrial() { $('trial-count').textContent = `${Math.min(14, playedIds.size)} / 14`; }
function renderArtwork(name, track) {
  const image = $(name + '-art'), placeholder = $(name + '-art-placeholder');
  if (!image || !placeholder) return;
  const message = placeholder.querySelector('[data-art-message]') || placeholder;
  const showPlaceholder = (state, text) => {
    image.hidden = true; placeholder.hidden = false;
    placeholder.dataset.state = state; message.textContent = text;
  };
  image.alt = track ? `${track.title} YouTube 썸네일` : '';
  // The original video and its artwork share the same explicit connection consent.
  // No request to Google's image servers is made before that consent.
  if (!track || !youtubeConsent || !/^[\w-]{11}$/.test(track.id)) {
    delete image.dataset.videoId;
    image.removeAttribute('src'); image.onload = null; image.onerror = null;
    showPlaceholder(track ? 'consent' : 'empty', track ? 'YouTube 연결 후 이미지 표시' : name === 'current' ? '첫 곡을 추가하세요' : '다음 곡을 추가하세요');
    return;
  }
  if (image.dataset.videoId === track.id) return;
  const videoId = track.id;
  image.dataset.videoId = videoId;
  showPlaceholder('loading', '이미지 불러오는 중');
  image.referrerPolicy = 'no-referrer'; image.decoding = 'async';
  image.onload = () => {
    if (image.dataset.videoId !== videoId) return;
    image.hidden = false; placeholder.hidden = true;
  };
  image.onerror = () => {
    if (image.dataset.videoId !== videoId) return;
    showPlaceholder('unavailable', '이미지를 불러오지 못했어요');
  };
  image.src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
function renderPlayback() {
  const slot = slots[activeSlot], loaded = !!currentTrack(), actualPlaying = loaded && playerState(slot) === PLAYING && !switching;
  const buffering = loaded && playerState(slot) === BUFFERING && !switching;
  // Play explains the next step, including on a fresh visit before consent.
  $('play').disabled = switching;
  $('play').textContent = actualPlaying || buffering ? 'Ⅱ' : '▶'; $('play').setAttribute('aria-label', actualPlaying || buffering ? '일시정지' : '재생');
  const together = overlap.snapshot();
  const nextPlaying = !!together && playerState(slots[together.incoming.slot]) === PLAYING && together.confirmed;
  $('current-record').classList.toggle('playing', actualPlaying); $('next-record').classList.toggle('playing', nextPlaying);
  document.body.dataset.playing = String(actualPlaying);
  if ($('now-badge')) $('now-badge').textContent = actualPlaying ? 'PLAYING' : buffering ? 'LOADING' : loaded ? 'READY' : 'NOW';
  if ($('next-badge')) $('next-badge').textContent = nextPlaying ? 'PLAYING' : nextTrack() ? 'UP NEXT' : 'NEXT';
  if ($('next-preview')) {
    $('next-preview').disabled = switching;
    $('next-preview').dataset.empty = String(!nextTrack());
    $('next-preview').setAttribute('aria-label', nextTrack() ? '다음 곡 재생' : '다음 곡 추가');
    $('next-preview').title = nextTrack() ? '다음 곡으로 이동' : 'YouTube 링크 추가';
  }
  $('next').disabled = !nextTrack() || switching || !slots.some(s => s.ready);
  $('previous').disabled = !loaded || switching || !slot.ready || !playbackAllowed();
  renderSeekAvailability();
  $('retry-youtube').hidden = !apiFailed;
  slots.forEach(source => { $('source-retry-' + source.index).hidden = !(needsNativePlay && source.index === activeSlot && source.ready && loaded && source.key === currentKey && !switching); });
  $('playback-hint').textContent = !loaded ? '좋아하는 곡의 YouTube 링크로 시작하세요.'
    : nativeStateFailed ? '앱의 재생 상태를 확인하지 못했습니다. 앱을 다시 열어 주세요.'
    : !nativeReady ? '기기의 재생 상태를 확인하고 있어요.'
    : !youtubeConsent ? 'YouTube 연결에 동의하면 재생할 수 있어요.'
    : apiFailed ? 'YouTube에 연결하지 못했습니다. 연결 다시 시도를 눌러 주세요.'
    : !slot.ready ? 'YouTube에 연결하고 있어요.'
    : buffering ? '영상 불러오는 중 · 원본 영상의 안내를 확인해 주세요. Ⅱ를 누르면 멈춥니다.'
    : needsNativePlay ? '원본 영상 안의 ▶를 눌러 시작하세요.'
    : nextPlaying ? '마지막 10%에서 두 곡을 원래 속도로 겹쳐 재생합니다.'
    : actualPlaying ? '재생 중 · 마지막 10%에서 다음 곡을 연결합니다.'
    : '하단의 ▶를 눌러 시작하세요.';
}
function renderQueue() {
  const fragment = document.createDocumentFragment();
  queue.forEach((track, index) => {
    const li = document.createElement('li'); li.classList.toggle('active', track.key === currentKey);
    const number = document.createElement('span'); number.className = 'track-number'; number.textContent = String(index + 1).padStart(2, '0'); li.append(number);
    const pick = document.createElement('button'); pick.type = 'button'; pick.className = 'track-text'; pick.title = `${track.title} 재생`;
    const name = document.createElement('span'); name.className = 'track-title'; name.textContent = track.title;
    const author = document.createElement('span'); author.className = 'track-author'; author.textContent = track.author || 'YouTube';
    pick.append(name, author); pick.addEventListener('click', () => selectTrack(track.key)); li.append(pick);
    const actions = document.createElement('div'); actions.className = 'queue-actions';
    for (const [label, symbol, delta] of [['위로 이동', '↑', -1], ['아래로 이동', '↓', 1]]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = symbol; button.setAttribute('aria-label', `${track.title} ${label}`);
      button.disabled = index + delta < 0 || index + delta >= queue.length || switching;
      button.addEventListener('click', () => { if (switching) return; const at = queue.findIndex(t => t.key === track.key); const to = at + delta; if (at < 0 || to < 0 || to >= queue.length) return; [queue[at], queue[to]] = [queue[to], queue[at]]; cancelFade(); persist(); render(); prepareNext(); }); actions.append(button);
    }
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `${track.title} 삭제`); remove.disabled = track.key === currentKey || switching;
    remove.title = track.key === currentKey ? '현재 곡은 다른 곡으로 이동한 뒤 삭제할 수 있습니다.' : '세트에서 삭제';
    remove.addEventListener('click', () => { if (track.key === currentKey || switching) return; queue = queue.filter(t => t.key !== track.key); cancelFade(); persist(); render(); prepareNext(); });
    actions.append(remove); li.append(actions); fragment.append(li);
  });
  $('queue').replaceChildren(fragment);
}
function render() {
  const track = currentTrack(), next = nextTrack();
  renderArtwork('current', track); renderArtwork('next', next);
  $('current-title').textContent = track?.title || '첫 곡을 골라주세요';
  $('current-author').textContent = track?.author || 'YouTube 링크 하나로 시작';
  $('next-title').textContent = next?.title || (track ? '다음 곡을 추가하세요' : '이어질 곡을 골라주세요');
  $('next-author').textContent = next?.author || '당신의 다음 무드';
  if ($('current-position')) $('current-position').textContent = track ? `${String(currentIndex() + 1).padStart(2, '0')} / ${String(queue.length).padStart(2, '0')}` : '— / —';
  if ($('next-position')) $('next-position').textContent = next ? `${String(queue.indexOf(next) + 1).padStart(2, '0')} / ${String(queue.length).padStart(2, '0')}` : '— / —';
  $('queue-count').textContent = String(queue.length).padStart(2, '0'); $('empty-state').hidden = queue.length > 0;
  $('repeat').setAttribute('aria-pressed', String(repeat)); $('volume').value = String(volume);
  if ($('volume-value')) $('volume-value').textContent = ios ? '기기 볼륨' : `${volume}%`;
  $('transition-description').textContent = '마지막 10% 겹침 재생 · 원래 속도 유지';
  document.querySelectorAll('[data-mode]').forEach(button => { const chosen = button.dataset.mode === mode; button.classList.toggle('selected', chosen); button.setAttribute('aria-pressed', String(chosen)); });
  $('export').disabled = queue.length === 0 || exporting;
  renderTrial(); renderSources(); renderQueue(); renderPlayback();
}
function tick() {
  const slot = slots[activeSlot], track = currentTrack();
  if (!slot.ready || !track || switching) return;
  const time = readPlayer(slot, 'getCurrentTime'), duration = readPlayer(slot, 'getDuration');
  if (!seeking) renderSeekPosition(duration > 0 ? time / duration * 1000 : 0, duration);
  $('duration').textContent = duration > 0 ? formatTime(duration) : '—:——';
  renderSeekAvailability();
  overlap.tick();
}
async function addTrack(event) {
  event.preventDefault();
  try {
    const parsed = parseYouTubeUrl($('url-input').value);
    if (queue.length >= 500) throw new Error('한 세트에는 최대 500곡을 담을 수 있습니다.');
    const track = { ...parsed, key: keyFor(), title: `YouTube · ${parsed.id}`, author: '영상 정보 불러오는 중' };
    queue.push(track); if (!currentKey) currentKey = track.key;
    $('url-input').value = ''; inputMessage('세트에 추가했습니다. 영상 정보를 확인하고 있어요.');
    persist(); render(); prepareCurrent();
    try {
      if (!youtubeConsent || window.Capacitor?.isNativePlatform?.()) throw new Error('player-metadata');
      const response = await fetch(`/api/metadata?id=${encodeURIComponent(track.id)}`, { signal: AbortSignal.timeout(9000) });
      if (!response.ok) throw new Error('metadata'); const data = await response.json();
      if (typeof data.title === 'string') track.title = data.title.slice(0, 300);
      track.author = typeof data.author === 'string' ? data.author.slice(0, 200) : 'YouTube';
      if (queue.includes(track)) { persist(); render(); }
      inputMessage('추가했습니다. 재생을 눌러 세트를 시작하세요.');
    } catch {
      if (track.author === '영상 정보 불러오는 중') track.author = 'YouTube · 재생 시 제목 확인';
      if (queue.includes(track)) { persist(); render(); }
      inputMessage('곡은 추가됐습니다. 영상 제목은 재생 시 다시 확인합니다.');
    }
  } catch (error) { inputMessage(error.message, true); $('url-input').focus(); }
}
$('add-form').addEventListener('submit', addTrack);
slots.forEach(slot => $('source-retry-' + slot.index).addEventListener('click', () => {
  if (!needsNativePlay || switching || slot.index !== activeSlot || slot.key !== currentKey) return;
  recoverBlockedPlayback(slot);
}));
$('play').addEventListener('click', () => {
  const slot = slots[activeSlot], track = currentTrack();
  if (!track) {
    inputMessage('듣고 싶은 곡의 YouTube 링크를 붙여 넣고 ＋를 눌러 주세요.');
    openSheet('queue-dialog', { focusInput: true });
    $('url-input').scrollIntoView({ block: 'center', behavior: 'auto' }); $('url-input').focus();
    setStatus('YouTube 링크를 먼저 추가해 주세요'); return;
  }
  if (!youtubeConsent) {
    openSheet('connect-dialog');
    $('youtube-consent').scrollIntoView({ block: 'center', behavior: 'auto' }); $('connect-youtube').focus();
    setStatus('YouTube 연결에 동의하면 재생할 수 있어요'); return;
  }
  if (!playbackAllowed()) { setStatus(nativeStateFailed ? '앱을 다시 열어 재생해 주세요' : '앱이 화면에 표시되고 준비된 뒤 재생해 주세요'); return; }
  if (apiFailed) { connectYouTube({ retry: true }); return; }
  if (!slot.ready) { showSource(slot); setStatus('YouTube 연결 중 · 잠시 후 재생을 눌러 주세요'); return; }
  if (playerState(slot) === PLAYING || playerState(slot) === BUFFERING) { pausePlayback(); return; }
  cancelFade();
  if (slot.failed || playerState(slot) === ENDED) { void switchTo(track.key, { nativePreview: ios }); return; }
  if (ios && [CUED, -1].includes(playerState(slot))) {
    slots.filter(other => other !== slot).forEach(pauseSlot); setGain(slot, 1);
    guideNativePlay(slot, '아래 원본 영상 안의 ▶를 눌러 음악을 시작해 주세요.'); return;
  }
  if (!showSource(slot)) { guideNativePlay(slot); return; }
  slots.filter(s => s !== slot).forEach(pauseSlot); setGain(slot, 1); slot.player.playVideo(); armPlayWait(track.key); setStatus('재생 준비 중');
});
$('next-preview')?.addEventListener('click', () => {
  if (switching) return;
  const next = nextTrack();
  if (next) selectTrack(next.key);
  else openSheet('queue-dialog', { focusInput: true });
});
$('next').addEventListener('click', () => advance());
$('previous').addEventListener('click', () => {
  if (!playbackAllowed()) return;
  const index = currentIndex(); if (index < 0) return;
  const slot = slots[activeSlot];
  if (readPlayer(slot, 'getCurrentTime') - (currentTrack()?.startSeconds || 0) > 3 || index === 0) {
    cancelFade(); slot.player.seekTo(currentTrack().startSeconds, true); setStatus(playerState(slot) === PLAYING ? '재생 중' : '일시정지');
  } else void switchTo(queue[index - 1].key);
});
$('repeat').addEventListener('click', () => { repeat = !repeat; cancelFade(); persist(); render(); prepareNext(); });
$('volume').addEventListener('input', () => {
  volume = Number($('volume').value); applyVolume(); persist();
  if ($('volume-value')) $('volume-value').textContent = `${volume}%`;
});
function canSeek() {
  const slot = slots[activeSlot], duration = readPlayer(slot, 'getDuration');
  return !!currentTrack() && slot.ready && slot.key === currentKey && Number.isFinite(duration) && duration > 0 && !switching && playbackAllowed();
}
function renderSeekAvailability() {
  const available = canSeek(), surface = $('dial-seek');
  surface.setAttribute('aria-disabled', String(!available));
  surface.tabIndex = available ? 0 : -1;
  if (!available) cancelJog();
}
function renderSeekPosition(value, duration = readPlayer(slots[activeSlot], 'getDuration')) {
  duration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  seekValue = Math.max(0, Math.min(1000, Number.isFinite(value) ? value : 0));
  const seconds = duration > 0 ? seekValue / 1000 * duration : 0, surface = $('dial-seek');
  $('current-record').style.setProperty('--jog-angle', `${seekValue / 1000 * 360}deg`);
  $('elapsed').textContent = formatTime(seconds);
  surface.setAttribute('aria-valuemax', String(Math.max(0, duration)));
  surface.setAttribute('aria-valuenow', String(Math.min(duration, Math.round(seconds))));
  surface.setAttribute('aria-valuetext', `${formatTime(seconds)} / ${formatTime(duration)}`);
}
function commitSeek() {
  if (!canSeek()) { seeking = false; return; }
  const slot = slots[activeSlot], duration = readPlayer(slot, 'getDuration');
  cancelFade();
  slot.player.seekTo(seekValue / 1000 * duration, true);
  seeking = false; lastTime = null;
  setStatus(playerState(slot) === PLAYING ? '재생 중' : '일시정지');
}
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => { mode = button.dataset.mode; cancelFade(); persist(); render(); }));
// The upper dial is an actual seek control. Buttons inside it keep their own taps.
// A full rotation spans the current track; wrapping past twelve o'clock is smooth.
const jog = $('current-record');
function jogAngle(event) {
  const rect = jog.getBoundingClientRect();
  return Math.atan2(event.clientY - rect.top - rect.height / 2, event.clientX - rect.left - rect.width / 2);
}
function finishJog(event, commit) {
  if (!jogDrag || event.pointerId !== jogDrag.pointerId) return;
  const drag = jogDrag; jogDrag = null;
  jog.classList.remove('dragging');
  if (jog.hasPointerCapture?.(event.pointerId)) jog.releasePointerCapture(event.pointerId);
  if (!drag.moved) return;
  if (commit && drag.key === currentKey && drag.generation === generation && canSeek()) commitSeek();
  else {
    seeking = false; lastTime = null;
    const slot = slots[activeSlot], duration = readPlayer(slot, 'getDuration');
    renderSeekPosition(duration > 0 ? readPlayer(slot, 'getCurrentTime') / duration * 1000 : 0, duration);
  }
}
function cancelJog() { if (jogDrag) finishJog({ pointerId: jogDrag.pointerId }, false); }
jog.addEventListener('pointerdown', event => {
  if (event.button !== 0 || jogDrag || !canSeek() || event.target.closest('button,input,a')) return;
  const rect = jog.getBoundingClientRect();
  const distance = Math.hypot(event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2);
  if (distance < rect.width * .29 || distance > rect.width * .52) return;
  jogDrag = { pointerId: event.pointerId, key: currentKey, generation, angle: jogAngle(event), value: seekValue, accumulated: 0, moved: false };
  jog.setPointerCapture(event.pointerId);
});
jog.addEventListener('pointermove', event => {
  if (!jogDrag || event.pointerId !== jogDrag.pointerId) return;
  if (jogDrag.key !== currentKey || jogDrag.generation !== generation || !canSeek()) { finishJog(event, false); return; }
  const angle = jogAngle(event);
  let delta = angle - jogDrag.angle;
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  jogDrag.angle = angle; jogDrag.accumulated += delta;
  if (!jogDrag.moved && Math.abs(jogDrag.accumulated) < .07) return;
  jogDrag.moved = true; event.preventDefault(); jog.classList.add('dragging');
  seeking = true; cancelFade();
  renderSeekPosition(jogDrag.value + jogDrag.accumulated / (Math.PI * 2) * 1000);
});
jog.addEventListener('pointerup', event => finishJog(event, true));
jog.addEventListener('pointercancel', event => finishJog(event, false));
jog.addEventListener('lostpointercapture', event => finishJog(event, false));
$('dial-seek').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || !canSeek()) return;
  event.preventDefault(); cancelJog();
  const slot = slots[activeSlot], duration = readPlayer(slot, 'getDuration'), current = readPlayer(slot, 'getCurrentTime');
  const seconds = event.key === 'Home' ? 0 : event.key === 'End' ? duration
    : current + (['ArrowRight', 'ArrowUp'].includes(event.key) ? 5 : -5);
  renderSeekPosition(seconds / duration * 1000, duration); commitSeek();
});

for (const [button, dialog] of [['help-button', 'help-dialog'], ['plan-button', 'plan-dialog'], ['open-settings', 'settings-dialog'], ['fx-button', 'fx-dialog']]) $(button)?.addEventListener('click', () => {
  if (button === 'fx-button' && $('fx-track-name')) $('fx-track-name').textContent = 'YouTube 모드';
  openSheet(dialog);
});
for (const name of ['current', 'next']) $(`fx-${name}`)?.addEventListener('click', () => {
  const track = name === 'current' ? currentTrack() : nextTrack();
  if ($('fx-track-name')) $('fx-track-name').textContent = track?.title || (name === 'current' ? '현재 곡' : '다음 곡');
  openSheet('fx-dialog');
});
document.querySelectorAll('[data-open-queue]').forEach(button => button.addEventListener('click', () => openSheet('queue-dialog', { focusInput: button.dataset.openQueue === 'add' })));
document.querySelectorAll('[data-open-settings]').forEach(button => button.addEventListener('click', () => openSheet('settings-dialog')));
document.querySelectorAll('dialog .close-dialog, #help-done, .close-plan').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('close', renderPlayback);
  dialog.addEventListener('click', event => { if (event.target === dialog) { const b = dialog.getBoundingClientRect(); if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) dialog.close(); } });
});
$('export').addEventListener('click', async () => {
  if (exporting || !queue.length) return;
  exporting = true; $('export').disabled = true;
  const jsonText = JSON.stringify({ app: 'SCYL', version: 1, title: '나의 SCYL 세트', exportedAt: new Date().toISOString(), transitionMode: 'overlap-10-percent', overlapFraction: .1, playbackRate: 1, tracks: queue.map(({ url, title, author }) => ({ url, title, author })) }, null, 2);
  try {
    if (window.Capacitor?.isNativePlatform?.()) {
      pausePlayback('세트를 공유하는 동안 일시정지');
      const { exportNativeSet } = await import('./lib/native-export.mjs');
      const result = await exportNativeSet(jsonText);
      if (result.status === 'unavailable') toast('이 기기에서 파일 공유를 사용할 수 없습니다.');
      else if (result.status === 'cancelled') toast('파일 공유를 취소했습니다.');
      else toast('공유 창에서 선택한 앱의 저장 결과를 확인해 주세요.');
    } else {
      const blob = new Blob([jsonText], { type: 'application/json' });
      const link = document.createElement('a'), url = URL.createObjectURL(blob);
      link.href = url; link.download = 'SCYL-set.json'; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('다운로드를 요청했습니다. 브라우저의 다운로드 목록을 확인해 주세요.');
    }
  } catch { toast('파일 내보내기에 실패했습니다. 다시 시도해 주세요.'); }
  finally { exporting = false; $('export').disabled = queue.length === 0; }
});
document.addEventListener('keydown', event => {
  if (event.code !== 'Space' || event.target.closest('input,textarea,button,dialog,a,[contenteditable=true]')) return;
  event.preventDefault(); if (!$('play').disabled) $('play').click();
});
window.addEventListener('offline', () => { pausePlayback('인터넷 연결이 끊겼습니다. 연결 후 재생을 눌러 주세요.'); });
window.addEventListener('online', () => { setStatus(apiFailed ? '연결이 복구됐습니다. 새로고침해 주세요.' : '연결이 복구됐습니다. 재생을 눌러 주세요.'); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pausePlayback('화면 비활성화로 일시정지 · 재생을 눌러 이어 들으세요.'); });
window.addEventListener('pagehide', () => {
  pausePlayback('화면을 벗어나 일시정지했습니다.'); persist();
  if (nativePlatform) {
    const previous = nativeLifecycle; nativeLifecycle = null;
    nativeReady = false; nativeActive = false;
    void previous?.dispose().catch(() => {});
  }
});
window.addEventListener('pageshow', event => { if (nativePlatform && event.persisted) startNativeLifecycle(); });
window.addEventListener('storage', event => {
  if ([STORAGE_KEY, 'scyl.privacy.v1'].includes(event.key) && event.newValue === null) {
    storageCleared = true;
    pausePlayback('이 기기의 SCYL 데이터가 삭제되었습니다.');
    location.reload();
  }
});

function initializePlayers() {
  if (nativePlatform && !nativeReady) return;
  if (!window.YT?.Player) return;
  apiFailed = false;
  slots.forEach(slot => {
    if (slot.player) return;
    const attempt = slot.attempt = (slot.attempt || 0) + 1;
    slot.player = new YT.Player(`youtube-${slot.index}`, {
      width: '100%', height: '100%', host: 'https://www.youtube.com',
      playerVars: { playsinline: 1, controls: 1, origin: location.origin, enablejsapi: 1, autoplay: 0 },
      events: {
        onReady: () => {
          if (slot.attempt !== attempt) return;
          slot.ready = true; apiFailed = false; setGain(slot, 1);
          // Either visible source can be first to initialize on a slow connection.
          if (!slots[activeSlot].ready) activeSlot = slot.index;
          if (slots[activeSlot].ready) clearTimeout(apiTimeout);
          if (slot.index === activeSlot) prepareCurrent(); else prepareNext();
          if (!playing) setStatus(currentTrack() ? '재생을 눌러 시작하세요' : '링크를 추가해 시작하세요'); render();
        },
        onStateChange: event => { if (slot.attempt === attempt) onState(slot, event.data); },
        onError: event => { if (slot.attempt === attempt) onError(slot, event.data); },
        onAutoplayBlocked: () => {
          if (slot.attempt !== attempt || overlap.blocked(slot.index)) return;
          if (slot.index === activeSlot) recoverBlockedPlayback(slot);
        },
      },
    });
  });
}
restore(); render();
function nativeLifecycleFailure() {
  nativeStateFailed = true; nativeReady = false; nativeActive = false;
  pausePlayback('앱의 재생 상태를 확인하지 못했습니다. 앱을 다시 열어 주세요.');
}
function startNativeLifecycle() {
  nativeStateFailed = false;
  const controller = createNativeLifecycleController({
    isNativePlatform: () => nativePlatform,
    onActiveChange: active => { if (nativeLifecycle === controller) { nativeActive = active; renderPlayback(); } },
    onPause: () => { if (nativeLifecycle === controller) pausePlayback('앱을 벗어나 일시정지했습니다. 돌아온 후 재생을 눌러 주세요.'); },
    onError: () => { if (nativeLifecycle === controller) nativeLifecycleFailure(); },
  });
  nativeLifecycle = controller;
  void controller.start().then(() => {
    if (nativeLifecycle !== controller) return;
    const current = controller.getState();
    nativeReady = current.ready && !nativeStateFailed; nativeActive = current.isActive && nativeReady;
    if (nativePlatform && nativeReady && youtubeStarted) initializePlayers();
    renderPlayback();
  }).catch(() => { if (nativeLifecycle === controller && !nativeStateFailed) nativeLifecycleFailure(); });
}
startNativeLifecycle();
if (ios) {
  $('volume').disabled = true; $('volume').title = '기기의 음량 버튼을 사용하세요.';
}
function connectYouTube({ retry = false } = {}) {
  $('connect-dialog')?.close();
  if (youtubeStarted && !retry) return;
  if (retry) {
    clearTimeout(apiTimeout); apiScript?.remove(); apiScript = null;
    for (const slot of slots) {
      if (slot.ready) continue;
      slot.attempt = (slot.attempt || 0) + 1;
      try { slot.player?.destroy(); } catch {}
      slot.player = null; slot.key = null;
      const shell = document.querySelectorAll('.player-shell')[slot.index];
      const placeholder = document.createElement('div'); placeholder.id = `youtube-${slot.index}`;
      shell.replaceChildren(placeholder);
    }
  }
  youtubeStarted = true; youtubeConsent = true;
  try { localStorage.setItem('scyl.privacy.v1', 'accepted'); } catch {}
  $('youtube-consent').hidden = true;
  renderArtwork('current', currentTrack()); renderArtwork('next', nextTrack());
  apiFailed = false; setStatus('YouTube 연결 중'); renderPlayback();
  apiTimeout = setTimeout(() => { if (slots[activeSlot].ready) return; apiFailed = true; setStatus('YouTube 연결 지연 · 연결 다시 시도를 눌러 주세요', true); renderPlayback(); }, 15000);
  window.onYouTubeIframeAPIReady = initializePlayers;
  if (window.YT?.Player) initializePlayers();
  else {
    const script = document.createElement('script'); apiScript = script; script.src = 'https://www.youtube.com/iframe_api'; script.async = true;
    script.onerror = () => { if (apiScript !== script) return; clearTimeout(apiTimeout); apiFailed = true; setStatus('YouTube 연결 실패 · 연결 다시 시도를 눌러 주세요', true); renderPlayback(); };
    document.head.append(script);
  }
}
$('connect-youtube').addEventListener('click', connectYouTube);
$('retry-youtube').addEventListener('click', () => connectYouTube({ retry: true }));
accountGate = mountAccount({ onLock() { pausePlayback('계정 인증 후 재생할 수 있습니다.'); } });
if (youtubeConsent) connectYouTube();
else setStatus('YouTube 연결 동의 후 재생할 수 있어요');
setInterval(tick, 100);
