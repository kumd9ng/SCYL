const TYPES = Object.freeze({ song: '곡', album: '앨범', playlist: '플레이리스트' });
const catalogId = value => /^[1-9]\d{0,19}$/.test(value || '');

/** Parse only public Apple Music share links. No network or account token is used. */
export function parseAppleMusicLink(input) {
  if (typeof input !== 'string' || input.length > 4096) throw new Error('Apple Music 공유 링크를 붙여넣어 주세요.');
  let source;
  try { source = new URL(input.trim()); } catch { throw new Error('Apple Music 공유 링크 형식을 확인해 주세요.'); }
  if (source.protocol !== 'https:' || source.hostname !== 'music.apple.com' || source.port || source.username || source.password) {
    throw new Error('https://music.apple.com 으로 시작하는 공유 링크를 사용해 주세요.');
  }
  const parts = source.pathname.replace(/\/$/, '').split('/').slice(1);
  const [storefront, sourceType] = parts;
  if (!/^[a-z]{2}$/.test(storefront || '') || !Object.hasOwn(TYPES, sourceType) || ![3, 4].includes(parts.length)) {
    throw new Error('Apple Music의 곡·앨범·플레이리스트 공유 링크를 사용해 주세요.');
  }
  const sourceId = parts.at(-1);
  if (sourceType === 'playlist' ? !/^pl\.[A-Za-z0-9-]{1,160}$/.test(sourceId) : !catalogId(sourceId)) {
    throw new Error('공유 링크의 음악 번호를 확인해 주세요.');
  }
  const trackIds = source.searchParams.getAll('i');
  if (trackIds.length > 1 || (trackIds.length && (sourceType !== 'album' || !catalogId(trackIds[0])))) {
    throw new Error('공유 링크의 곡 번호를 확인해 주세요.');
  }
  const type = trackIds.length ? 'song' : sourceType;
  const id = trackIds[0] || sourceId;
  let slug = '';
  if (parts.length === 4) {
    try { slug = decodeURIComponent(parts[2]); } catch { throw new Error('공유 링크의 이름이 올바르지 않습니다.'); }
    if (!slug || /[\u0000-\u001f\u007f/\\]/.test(slug)) throw new Error('공유 링크의 이름이 올바르지 않습니다.');
  }
  // Keep the album path for ?i= song links: its final path ID is the album ID,
  // while the selected item and deduplication key must use the song ID.
  const canonical = new URL(source.origin + '/' + parts.join('/'));
  if (trackIds.length) canonical.searchParams.set('i', id);
  const embed = new URL(canonical);
  embed.hostname = 'embed.music.apple.com';
  // An album slug does not tell us the title of its selected ?i= song.
  const title = trackIds.length ? `곡 ${id}` : slug.replaceAll('-', ' ').slice(0, 160) || `${TYPES[type]} ${id}`;
  return Object.freeze({
    key: `${storefront}:${type}:${id}`, storefront, type, id,
    kindLabel: TYPES[type], title, url: canonical.href, embedUrl: embed.href,
    embedHeight: type === 'song' ? 175 : 450,
  });
}
