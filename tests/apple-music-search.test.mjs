import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAppleMusicSearch, searchAppleMusic } from '../lib/apple-music-search.mjs';

const sample = { wrapperType: 'track', kind: 'song', trackId: 1561837008,
  trackName: 'Shy Away', artistName: 'twenty one pilots', collectionName: 'Scaled and Icy',
  trackViewUrl: 'https://music.apple.com/us/album/scaled-and-icy/1561836997?i=1561837008&uo=4',
  artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/cover/100x100bb.jpg',
  trackTimeMillis: 175000, previewUrl: 'https://example.com/raw-audio.m4a' };
const response = results => ({ ok: true, json: async () => ({ results }) });

test('Apple search preserves verified metadata and official song identity without retaining preview audio', () => {
  const [track] = normalizeAppleMusicSearch({ results: [sample, sample] });
  assert.equal(track.title, 'Shy Away'); assert.equal(track.artist, 'twenty one pilots');
  assert.equal(track.album, 'Scaled and Icy'); assert.equal(track.id, '1561837008');
  assert.equal(track.embedUrl, 'https://embed.music.apple.com/us/album/scaled-and-icy/1561836997?i=1561837008');
  assert.equal(new URL(track.storeUrl).searchParams.get('app'), 'itunes');
  assert.equal(track.durationSeconds, 175); assert.equal('previewUrl' in track, false);
  assert.equal(normalizeAppleMusicSearch({ results: [sample, sample] }).length, 1);
});

test('search rejects wrong media, inconsistent IDs, unknown destination and unsafe artwork URLs', () => {
  const invalid = [
    { ...sample, kind: 'music-video' }, { ...sample, trackId: 12 },
    { ...sample, trackId: Number.MAX_SAFE_INTEGER + 1 }, { ...sample, artistName: '' },
    { ...sample, trackViewUrl: 'https://music.apple.com.evil.test/us/song/x/1561837008' },
    { ...sample, trackViewUrl: 'https://music.apple.com/kr/song/x/1561837008' },
  ];
  assert.deepEqual(normalizeAppleMusicSearch({ results: invalid }), []);
  for (const artworkUrl100 of ['https://mzstatic.com.evil.test/image.png', 'http://is1.mzstatic.com/image.png', 'https://user:pass@is1.mzstatic.com/image.png']) {
    assert.equal(normalizeAppleMusicSearch({ results: [{ ...sample, artworkUrl100 }] })[0].artworkUrl, '');
  }
  assert.throws(() => normalizeAppleMusicSearch({ errorMessage: 'failed' }));
});

test('explicit search safely encodes terms and uses a bounded Apple CORS request without credentials', async () => {
  let request;
  const tracks = await searchAppleMusic('  봄날  BTS & IU  ', { useCache: false, fetchImpl: async (url, options) => {
    request = { url: new URL(url), options }; return response([sample]);
  } });
  assert.equal(tracks.length, 1); assert.equal(request.url.origin, 'https://itunes.apple.com');
  assert.equal(request.url.searchParams.get('term'), '봄날 BTS & IU');
  assert.equal(request.url.searchParams.get('entity'), 'song'); assert.equal(request.url.searchParams.get('limit'), '20');
  assert.equal(request.options.credentials, 'omit');
  await assert.rejects(searchAppleMusic(' '));
  await assert.rejects(searchAppleMusic('x'.repeat(201)));
  await assert.rejects(searchAppleMusic('song', { country: 'us&callback=evil' }));
});

test('aborted search rejects promptly even if the response ignores abort and never caches late results', async () => {
  const controller = new AbortController(); let finish;
  const pending = searchAppleMusic('abort-case', { signal: controller.signal, fetchImpl: () => new Promise(r => { finish = r; }) });
  await Promise.resolve(); controller.abort();
  await assert.rejects(pending, { name: 'AbortError' }); finish(response([sample]));
  await Promise.resolve();
  let calls = 0;
  assert.deepEqual(await searchAppleMusic('abort-case', { fetchImpl: async () => { calls++; return response([]); } }), []);
  assert.equal(calls, 1);
  const already = new AbortController(); already.abort();
  await assert.rejects(searchAppleMusic('abc', { signal: already.signal, fetchImpl: () => { throw Error('must not fetch'); } }), { name: 'AbortError' });
});

test('timeouts, provider throttling and invalid responses fail without fabricating search results', async () => {
  await assert.rejects(searchAppleMusic('timeout', { useCache: false, timeoutMs: 5, fetchImpl: () => new Promise(() => {}) }), /늦어지고/);
  await assert.rejects(searchAppleMusic('limited', { useCache: false, fetchImpl: async () => ({ ok: false, status: 429 }) }), /요청이 많/);
  await assert.rejects(searchAppleMusic('broken', { useCache: false, fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }), /읽지 못/);
  let calls = 0;
  const fetchImpl = async () => { calls++; return response([sample]); };
  const one = await searchAppleMusic('cache-case', { fetchImpl }); one.pop();
  assert.equal((await searchAppleMusic('cache-case', { fetchImpl })).length, 1); assert.equal(calls, 1);
});
