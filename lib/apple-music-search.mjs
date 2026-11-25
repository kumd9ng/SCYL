import { parseAppleMusicLink } from './apple-music-links.mjs';

const ENDPOINT = 'https://itunes.apple.com/search';
const RESULT_LIMIT = 20;
const cache = new Map();
const CACHE_AGE = 2 * 60 * 1000;
const text = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const id = value => Number.isSafeInteger(value) && value > 0 ? String(value) : null;

function artwork(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /^(?:[a-z0-9-]+\.)*mzstatic\.com$/.test(url.hostname)
      && !url.port && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

/** Public Apple store results, not a subscriber's private MusicKit library. */
export function normalizeAppleMusicSearch(payload, { country = 'us' } = {}) {
  if (!payload || !Array.isArray(payload.results)) throw new Error('음악 검색 결과를 읽지 못했습니다. 다시 검색해 주세요.');
  const tracks = [], seen = new Set();
  for (const item of payload.results.slice(0, 200)) {
    if (item?.kind !== 'song' || item.wrapperType !== 'track' || !id(item.trackId)) continue;
    const title = text(item.trackName), artist = text(item.artistName);
    if (!title || !artist) continue;
    let parsed;
    try {
      const link = new URL(item.trackViewUrl);
      if (link.hostname === 'itunes.apple.com') link.hostname = 'music.apple.com';
      parsed = parseAppleMusicLink(link.href);
    } catch { continue; }
    if (parsed.type !== 'song' || parsed.id !== id(item.trackId) || parsed.storefront !== country || seen.has(parsed.key)) continue;
    const store = new URL(parsed.url); store.searchParams.set('app', 'itunes');
    seen.add(parsed.key);
    tracks.push(Object.freeze({ ...parsed, title, artist, album: text(item.collectionName),
      artworkUrl: artwork(item.artworkUrl100), storeUrl: store.href,
      durationSeconds: Number.isFinite(item.trackTimeMillis) && item.trackTimeMillis > 0 ? item.trackTimeMillis / 1000 : null,
      searchProvider: 'apple-public-store',
    }));
    if (tracks.length >= RESULT_LIMIT) break;
  }
  return tracks;
}

const abortError = () => Object.assign(new Error('음악 검색이 취소되었습니다.'), { name: 'AbortError' });

/** Call only after explicit search submission. Audio preview URLs are never retained. */
export async function searchAppleMusic(query, { country = 'us', signal, fetchImpl = globalThis.fetch, timeoutMs = 12000, useCache = true } = {}) {
  const term = typeof query === 'string' ? query.trim().replace(/\s+/g, ' ') : '';
  if (!term || term.length > 200) throw new Error('곡명이나 가수 이름을 200자 이내로 입력해 주세요.');
  if (!/^[a-z]{2}$/.test(country)) throw new Error('검색 지역을 확인해 주세요.');
  if (signal?.aborted) throw abortError();
  if (typeof fetchImpl !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('이 브라우저에서 음악 검색을 시작하지 못했습니다.');
  const key = `${country}:${term.toLocaleLowerCase('en-US')}`;
  const previous = cache.get(key);
  if (useCache && previous && Date.now() - previous.createdAt < CACHE_AGE) return [...previous.tracks];
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({ term, country, media: 'music', entity: 'song', limit: String(RESULT_LIMIT) });
  const controller = new AbortController();
  let timer, stop, settled = false;
  const request = new Promise((resolve, reject) => {
    stop = error => {
      if (settled) return;
      settled = true; controller.abort(); reject(error);
    };
    timer = setTimeout(() => stop(new Error('검색 응답이 늦어지고 있습니다. 잠시 후 다시 검색해 주세요.')), timeoutMs);
    Promise.resolve().then(() => fetchImpl(url.href, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })).then(async response => {
      if (settled) return;
      if (!response.ok) throw new Error(response.status === 429 ? '검색 요청이 많습니다. 잠시 후 다시 검색해 주세요.' : '음악을 검색하지 못했습니다. 연결 상태를 확인하고 다시 검색해 주세요.');
      const payload = await response.json();
      if (settled) return;
      const tracks = normalizeAppleMusicSearch(payload, { country });
      settled = true; resolve(tracks);
    }).catch(error => {
      if (settled) return;
      settled = true;
      reject(error instanceof TypeError ? new Error('음악 검색에 연결하지 못했습니다. 인터넷 연결 후 다시 시도해 주세요.') : error);
    });
  });
  const abort = () => stop(abortError());
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  try {
    const tracks = await request;
    if (signal?.aborted) throw abortError();
    if (useCache) {
      if (cache.size >= 20) cache.delete(cache.keys().next().value);
      cache.set(key, { tracks, createdAt: Date.now() });
    }
    return [...tracks];
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
