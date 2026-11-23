import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTubeUrl, formatTime } from '../lib/youtube.mjs';

const id = 'M7lc1UVf-VE';
const canonical = `https://www.youtube.com/watch?v=${id}`;

test('recognizes common copied video links and canonicalizes tracking parameters', () => {
  const links = [
    `${canonical}&si=tracking`,
    `https://youtube.com/watch?v=${id}`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}&list=playlist`,
    `https://youtu.be/${id}?si=tracking`,
    `youtu.be/${id}`,
    `  www.youtube.com/watch?v=${id}  `,
    `http://youtube.com/watch?v=${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://youtube.com/live/${id}/`,
    `https://youtube.com/embed/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `https://youtube-nocookie.com/embed/${id}`,
  ];
  for (const link of links) {
    assert.deepEqual(parseYouTubeUrl(link), { id, startSeconds: 0, url: canonical }, link);
  }
});

test('reads numeric and h/m/s timestamps and makes a stable share link', () => {
  for (const [suffix, seconds] of [
    ['&t=90', 90], ['&t=1m30s', 90], ['&t=1h2m3s', 3723],
    ['&t=3m', 180], ['&start=42', 42], ['#t=20s', 20], ['&t=0', 0],
    ['&start=12&t=99', 12],
  ]) {
    const result = parseYouTubeUrl(canonical + suffix);
    assert.equal(result.startSeconds, seconds, suffix);
    assert.equal(result.url, canonical + (seconds ? `&t=${seconds}s` : ''));
    assert.deepEqual(parseYouTubeUrl(result.url), result);
  }
});

test('rejects lookalike hosts, credentials, unexpected ports and unsafe schemes', () => {
  for (const link of [
    `https://youtube.com.evil.test/watch?v=${id}`,
    `https://evil.test/youtube.com/watch?v=${id}`,
    `https://evil.test@youtube.com/watch?v=${id}`,
    `https://youtube.com@evil.test/watch?v=${id}`,
    `https://foo.youtube.com/watch?v=${id}`,
    `https://youtube.com:444/watch?v=${id}`,
    `ftp://youtube.com/watch?v=${id}`,
    'javascript:alert(1)', 'data:text/html,hello',
    `https://youtube.com\\@evil.test/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}\n&start=1`,
  ]) assert.throws(() => parseYouTubeUrl(link), Error, link);
});

test('rejects missing/invalid IDs, ambiguous links, channels and playlists', () => {
  for (const link of [
    '', ' ', null, undefined, {},
    'https://youtube.com/playlist?list=PL123',
    'https://youtube.com/@example',
    'https://youtube.com/watch',
    'https://youtube.com/watch?v=too-short',
    `https://youtube.com/watch?v=${id}x`,
    `https://youtube.com/watch?v=${id}&v=${id}`,
    `https://youtu.be/${id}/extra`,
    `https://youtube-nocookie.com/watch?v=${id}`,
    'https://youtube.com/watch?v=abc%3Cdefghij',
  ]) assert.throws(() => parseYouTubeUrl(link), /[가-힣]/);
});

test('rejects invalid or duplicate timestamps rather than silently using wrong times', () => {
  for (const suffix of [
    '&t=', '&t=-1', '&t=1.5', '&t=1:30', '&t=hello', '&t=2s1m',
    '&t=99999999999999999999', '&start=Infinity', '&start=-10',
    '&t=20&t=40', '&start=20&start=40',
  ]) assert.throws(() => parseYouTubeUrl(canonical + suffix), /[가-힣]/, suffix);
});

test('formats player times for short and long videos and tolerates unknown duration', () => {
  for (const [input, expected] of [
    [0, '0:00'], [9, '0:09'], [90, '1:30'], [3599.9, '59:59'],
    [3600, '1:00:00'], [3723, '1:02:03'], [-1, '0:00'],
    [NaN, '0:00'], [Infinity, '0:00'], [undefined, '0:00'], ['90', '0:00'],
  ]) assert.equal(formatTime(input), expected);
});
