import { parseAppleMusicLink } from './apple-music-links.mjs';
import { searchAppleMusic } from './apple-music-search.mjs';

const normalized = value => typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US') : '';
const catalogId = value => /^[1-9]\d{0,19}$/.test(String(value ?? '')) ? String(value) : '';
const abortError = () => Object.assign(new Error('다음 곡 검색이 취소되었습니다.'), { name: 'AbortError' });
const titleKey = track => JSON.stringify([normalized(track?.artist), normalized(track?.title)]);

function verifiedSong(track) {
  if (!track || !normalized(track.artist) || !normalized(track.title)) return false;
  try {
    const parsed = parseAppleMusicLink(track.url);
    return parsed.type === 'song' && parsed.id === catalogId(track.id)
      && (!track.key || track.key === parsed.key);
  } catch { return false; }
}

/** Other songs by the same named artist, never personalized Apple recommendations. */
export function selectRelatedAppleMusicTracks(seed, rows, { collected = [], limit = 6 } = {}) {
  if (!verifiedSong(seed) || !Array.isArray(rows)) return [];
  const maximum = Number.isFinite(limit) ? Math.min(6, Math.max(0, Math.floor(limit))) : 6;
  if (!maximum) return [];
  const artist = normalized(seed.artist), ids = new Set(), keys = new Set(), titles = new Set();
  for (const track of [seed, ...(Array.isArray(collected) ? collected : [])]) {
    if (typeof track === 'string' || typeof track === 'number') {
      if (catalogId(track)) ids.add(catalogId(track));
      else if (typeof track === 'string') keys.add(track);
      continue;
    }
    if (catalogId(track?.id)) ids.add(catalogId(track.id));
    if (typeof track?.key === 'string') keys.add(track.key);
    if (normalized(track?.artist) && normalized(track?.title)) titles.add(titleKey(track));
  }
  const selected = [];
  for (const track of rows) {
    if (!verifiedSong(track) || normalized(track.artist) !== artist) continue;
    const id = catalogId(track.id), title = titleKey(track);
    if (ids.has(id) || keys.has(track.key) || titles.has(title)) continue;
    ids.add(id); if (track.key) keys.add(track.key); titles.add(title);
    // Public-store fallback supplies metadata only, without promotional artwork.
    selected.push({ ...track, artworkUrl: track.source === 'musickit' ? track.artworkUrl || '' : '' });
    if (selected.length === maximum) break;
  }
  return selected;
}

/** Fetch only after selecting a song; callers may supply the authenticated catalog search. */
export async function getRelatedAppleMusicTracks(seed, { collected = [], limit = 6, signal, search = searchAppleMusic, country = 'us' } = {}) {
  if (signal?.aborted) throw abortError();
  if (!verifiedSong(seed)) return [];
  const artist = seed.artist.trim().replace(/\s+/g, ' ');
  if (artist.length > 200) return [];
  if (typeof search !== 'function') throw new Error('다음 곡 검색을 시작하지 못했습니다.');
  let onAbort;
  try {
    const rows = await new Promise((resolve, reject) => {
      onAbort = () => reject(abortError());
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) { onAbort(); return; }
      Promise.resolve().then(() => {
        if (signal?.aborted) throw abortError();
        return search(artist, { signal, country });
      }).then(resolve, reject);
    });
    if (signal?.aborted) throw abortError();
    return selectRelatedAppleMusicTracks(seed, rows, { collected, limit });
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
