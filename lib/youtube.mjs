const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
]);
const EMBED_HOSTS = new Set(['youtube-nocookie.com', 'www.youtube-nocookie.com']);

function parseTimestamp(value) {
  if (value === null) return 0;
  let seconds;
  if (/^\d+$/.test(value)) {
    seconds = Number(value);
  } else {
    const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(value);
    if (!match || !match.slice(1).some(Boolean)) {
      throw new Error('시작 시간은 초 또는 1h2m30s 형식으로 입력해 주세요.');
    }
    seconds = Number(match[1] || 0) * 3600
      + Number(match[2] || 0) * 60 + Number(match[3] || 0);
  }
  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    throw new Error('시작 시간이 올바르지 않습니다.');
  }
  return seconds;
}

/** Parse supported YouTube video links without loading untrusted URLs. */
export function parseYouTubeUrl(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('유튜브 영상 링크를 붙여 넣어 주세요.');
  }
  const text = input.trim();
  if (/[\s\\]/.test(text)) {
    throw new Error('공백이나 잘못된 문자가 없는 영상 링크를 입력해 주세요.');
  }
  let parsed;
  try {
    parsed = new URL(/^[A-Za-z][A-Za-z0-9+.-]*:/.test(text) ? text : `https://${text}`);
  } catch {
    throw new Error('올바른 유튜브 영상 링크를 입력해 주세요.');
  }
  const host = parsed.hostname.toLowerCase();
  if (!['https:', 'http:'].includes(parsed.protocol)
    || parsed.username || parsed.password || parsed.port
    || !(YOUTUBE_HOSTS.has(host) || EMBED_HOSTS.has(host) || host === 'youtu.be')) {
    throw new Error('youtube.com 또는 youtu.be의 영상 링크만 사용할 수 있습니다.');
  }

  let id;
  const path = parsed.pathname;
  if (host === 'youtu.be') {
    id = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(path)?.[1];
  } else if (YOUTUBE_HOSTS.has(host) && /^\/watch\/?$/.test(path)) {
    if (parsed.searchParams.getAll('v').length !== 1) {
      throw new Error('영상 ID가 하나 포함된 유튜브 링크를 입력해 주세요.');
    }
    id = parsed.searchParams.get('v');
  } else {
    const routes = EMBED_HOSTS.has(host) ? /^\/embed\/([A-Za-z0-9_-]{11})\/?$/
      : /^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})\/?$/;
    id = routes.exec(path)?.[1];
  }
  if (!id || !VIDEO_ID.test(id)) {
    throw new Error('재생목록이나 채널 주소가 아닌 개별 영상 링크를 입력해 주세요.');
  }

  for (const key of ['start', 't']) {
    if (parsed.searchParams.getAll(key).length > 1) {
      throw new Error('시작 시간이 중복된 링크입니다. 시간을 하나만 지정해 주세요.');
    }
  }
  const fragment = new URLSearchParams(parsed.hash.slice(1));
  const timestamp = parsed.searchParams.get('start')
    ?? parsed.searchParams.get('t') ?? fragment.get('t');
  const startSeconds = parseTimestamp(timestamp);
  return {
    id,
    startSeconds,
    url: `https://www.youtube.com/watch?v=${id}${startSeconds ? `&t=${startSeconds}s` : ''}`,
  };
}

/** Display elapsed time; unavailable/invalid player values render as 0:00. */
export function formatTime(seconds) {
  const total = typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? Math.floor(seconds) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const remainder = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}`
    : `${minutes}:${remainder}`;
}
