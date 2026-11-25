import { parseAppleMusicLink } from './apple-music-links.mjs';

const SDK_URL = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
const sdkLoads = new WeakMap(), configuredInstances = new WeakMap();
const buildConfig = typeof __SCYL_APPLE_MUSIC_CONFIG__ !== 'undefined' ? __SCYL_APPLE_MUSIC_CONFIG__ : null;
function failure(code, message) { return Object.assign(new Error(message), { code }); }
function cancelled() { return failure('CANCELLED', 'Apple Music 연결을 취소했습니다.'); }

function loadSDK(win, doc, timeoutMs) {
  if (win.MusicKit?.configure) return Promise.resolve(win.MusicKit);
  if (sdkLoads.has(win)) return sdkLoads.get(win);
  let task;
  task = new Promise((resolve, reject) => {
    let done = false;
    const script = doc.createElement('script');
    script.src = SDK_URL; script.async = true;
    const finish = error => {
      if (done) return;
      if (!error && !win.MusicKit?.configure) return;
      done = true; win.clearTimeout(timer);
      doc.removeEventListener('musickitloaded', ready);
      script.onload = null; script.onerror = null;
      if (error) { script.remove(); reject(error); } else resolve(win.MusicKit);
    };
    const ready = () => finish();
    const timer = win.setTimeout(() => finish(failure('SDK_TIMEOUT', 'Apple Music 연결이 지연됐습니다. 다시 시도해 주세요.')), timeoutMs);
    script.onload = ready;
    script.onerror = () => finish(failure('SDK_LOAD_FAILED', 'Apple Music에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.'));
    doc.addEventListener('musickitloaded', ready);
    doc.head.append(script);
  }).catch(error => { if (sdkLoads.get(win) === task) sdkLoads.delete(win); throw error; });
  sdkLoads.set(win, task); return task;
}

async function instanceFor(win, doc, config, timeoutMs) {
  const current = configuredInstances.get(win);
  if (current) {
    if (current.token !== config.developerToken) throw failure('CONFIG_CONFLICT', 'Apple Music 연결 설정이 변경됐습니다. 화면을 새로고침해 주세요.');
    return current.promise;
  }
  const holder = { token: config.developerToken, promise: null };
  holder.promise = loadSDK(win, doc, timeoutMs).then(sdk => sdk.configure({
    developerToken: config.developerToken,
    app: { name: 'SCYL', build: config.build || '0.4.14' },
  })).then(music => {
    const value = music || win.MusicKit.getInstance?.();
    if (!value?.authorize || !value?.api?.music) throw failure('SDK_UNAVAILABLE', 'Apple Music 연결을 준비하지 못했습니다. 다시 시도해 주세요.');
    return value;
  }).catch(error => {
    if (configuredInstances.get(win) === holder) configuredInstances.delete(win);
    throw error?.code?.startsWith?.('SDK_') || error?.code === 'CONFIG_CONFLICT' ? error : failure('SDK_CONFIG_FAILED', 'Apple Music 연결 설정을 확인해야 합니다.');
  });
  configuredInstances.set(win, holder); return holder.promise;
}

function artworkUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value.replaceAll('{w}', '200').replaceAll('{h}', '200').replaceAll('{f}', 'jpg'));
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && /(^|\.)mzstatic\.com$/.test(url.hostname) ? url.href : '';
  } catch { return ''; }
}
export function normalizeMusicKitSongs(response) {
  const rows = response?.data?.results?.songs?.data;
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  return rows.slice(0, 25).flatMap(row => {
    const attr = row?.attributes;
    if (row?.type !== 'songs' || !attr || typeof attr.name !== 'string' || typeof attr.artistName !== 'string') return [];
    try {
      const track = parseAppleMusicLink(attr.url);
      if (track.type !== 'song' || seen.has(track.key)) return [];
      seen.add(track.key);
      return [{ ...track, title: attr.name.slice(0, 300), artist: attr.artistName.slice(0, 200), album: String(attr.albumName || '').slice(0, 300),
        artworkUrl: artworkUrl(attr.artwork?.url), durationMs: Number.isFinite(attr.durationInMillis) ? Math.max(0, attr.durationInMillis) : 0,
        source: 'musickit', storeUrl: '' }];
    } catch { return []; }
  });
}

/** Tokens remain inside MusicKit. Returned state never contains user or developer tokens. */
export function createAppleMusicAccount({ config = buildConfig, window: win = globalThis.window, document: doc = globalThis.document, onState = () => {}, timeoutMs = 15000 } = {}) {
  const configured = Boolean(config && typeof config.developerToken === 'string' && config.developerToken.trim());
  let music = null, preparation = null, pendingAuth = null, pendingLogout = null, disposed = false, generation = 0, lastError = null;
  let playbackGeneration = 0, playbackQueue = Promise.resolve();
  const state = () => Object.freeze({ configured, ready: Boolean(music), authorized: Boolean(music?.isAuthorized), busy: Boolean(preparation || pendingAuth || pendingLogout), playing: Boolean(music?.isPlaying), errorCode: lastError });
  function emit() { if (!disposed) onState(state()); }
  function available() {
    if (disposed) throw failure('DISPOSED', 'Apple Music 연결 화면이 닫혔습니다.');
    if (!configured) throw failure('NOT_CONFIGURED', 'Apple Music 로그인 연결을 준비 중입니다. 서비스의 개발자 설정이 필요합니다.');
  }
  function onAuthorization() { if (!pendingAuth && !pendingLogout) emit(); }
  function prepare() {
    try { available(); } catch (error) { lastError = error.code; emit(); return Promise.reject(error); }
    if (music) return Promise.resolve(state());
    if (preparation) return preparation.then(state);
    const request = generation;
    preparation = instanceFor(win, doc, config, timeoutMs).then(value => {
      if (disposed || request !== generation) throw cancelled();
      music = value; lastError = null;
      music.addEventListener?.('authorizationStatusDidChange', onAuthorization);
      music.addEventListener?.('playbackStateDidChange', emit);
    }).catch(error => { lastError = error.code || 'SDK_CONFIG_FAILED'; throw error; }).finally(() => { preparation = null; emit(); });
    emit(); return preparation.then(state);
  }
  // Call prepare() before enabling the button. This method deliberately invokes
  // MusicKit.authorize() before any await so the original click opens the popup.
  function authorize() {
    try {
      available();
      if (!music) throw failure('NOT_READY', 'Apple Music 연결을 준비하고 있습니다. 잠시 후 로그인해 주세요.');
      if (pendingAuth || pendingLogout) throw failure('AUTH_BUSY', 'Apple Music 연결을 처리하고 있습니다.');
    } catch (error) { lastError = error.code; emit(); return Promise.reject(error); }
    const request = generation;
    let authorization;
    try { authorization = music.authorize(); } catch { lastError = 'AUTH_FAILED'; emit(); return Promise.reject(failure('AUTH_FAILED', 'Apple Music 로그인을 완료하지 못했습니다. 다시 시도해 주세요.')); }
    pendingAuth = Promise.resolve(authorization).then(async () => {
      if (disposed || request !== generation) {
        // No second authorization can begin until this attempt settles.
        await music.unauthorize();
        throw cancelled();
      }
      if (!music.isAuthorized) throw failure('AUTH_FAILED', 'Apple Music 로그인이 완료되지 않았습니다.');
      lastError = null; return state();
    }).catch(error => {
      const safe = error?.code === 'CANCELLED' || error?.code === 'AUTH_FAILED' ? error : failure('AUTH_FAILED', 'Apple Music 로그인을 완료하지 못했습니다. 다시 시도해 주세요.');
      lastError = safe.code; throw safe;
    }).finally(() => { pendingAuth = null; emit(); });
    emit(); return pendingAuth.then(state);
  }
  function pause() {
    playbackGeneration++;
    try { Promise.resolve(music?.pause?.()).catch(() => { lastError = 'PAUSE_FAILED'; emit(); }); }
    catch { lastError = 'PAUSE_FAILED'; }
    emit();
  }
  function suspend() { generation++; if (pendingAuth) lastError = 'CANCELLED'; pause(); }
  function unauthorize() {
    generation++; pause();
    if (pendingLogout) return pendingLogout;
    pendingLogout = (async () => {
      try { await pendingAuth; } catch { /* A cancelled authorization removes its own late token. */ }
      if (music) await music.unauthorize();
      lastError = null;
    })().catch(() => { lastError = 'LOGOUT_FAILED'; throw failure('LOGOUT_FAILED', 'Apple Music 연결 해제를 완료하지 못했습니다. 다시 시도해 주세요.'); }).finally(() => { pendingLogout = null; emit(); });
    emit(); return pendingLogout.then(state);
  }
  function play(track) {
    let parsed;
    try {
      available();
      if (!music) throw failure('NOT_READY', 'Apple Music 연결을 먼저 준비해 주세요.');
      if (!music.isAuthorized) throw failure('AUTH_REQUIRED', 'Apple Music 로그인 후 재생해 주세요.');
      parsed = parseAppleMusicLink(track?.url);
      if (parsed.type !== 'song' || parsed.id !== String(track?.id)) throw failure('INVALID_TRACK', '재생할 곡을 다시 선택해 주세요.');
    } catch (error) { return Promise.reject(error?.code ? error : failure('INVALID_TRACK', '재생할 곡을 다시 선택해 주세요.')); }
    const request = ++playbackGeneration;
    const operation = playbackQueue.catch(() => {}).then(async () => {
      if (disposed || request !== playbackGeneration) throw cancelled();
      await music.setQueue({ song: parsed.id, startPlaying: false });
      if (disposed || request !== playbackGeneration) throw cancelled();
      await music.play();
      if (disposed || request !== playbackGeneration) { await music.pause(); throw cancelled(); }
      lastError = null; emit(); return state();
    }).catch(error => {
      if (error?.code === 'CANCELLED') throw error;
      lastError = 'PLAYBACK_FAILED'; emit();
      throw failure('PLAYBACK_FAILED', '이 곡을 재생하지 못했습니다. Apple Music 구독과 제공 지역을 확인해 주세요.');
    });
    playbackQueue = operation; return operation;
  }
  async function search(query, { signal } = {}) {
    available();
    const term = typeof query === 'string' ? query.trim() : '';
    if (!term || term.length > 200) throw failure('INVALID_QUERY', '곡명이나 아티스트를 200자 이내로 입력해 주세요.');
    if (signal?.aborted) throw cancelled();
    const request = generation;
    await prepare();
    if (signal?.aborted || request !== generation || disposed) throw cancelled();
    let response;
    try { response = await music.api.music('/v1/catalog/{{storefrontId}}/search', { term, types: 'songs', limit: 25 }); }
    catch { throw failure('SEARCH_FAILED', 'Apple Music 검색에 실패했습니다. 다시 시도해 주세요.'); }
    if (signal?.aborted || request !== generation || disposed) throw cancelled();
    return normalizeMusicKitSongs(response);
  }
  return {
    configured, state, status: state, get isAuthorized() { return state().authorized; }, prepare, authorize, unauthorize, disconnect: unauthorize, search, play, pause, suspend,
    destroy() { suspend(); disposed = true; music?.removeEventListener?.('authorizationStatusDidChange', onAuthorization); music?.removeEventListener?.('playbackStateDidChange', emit); },
  };
}
