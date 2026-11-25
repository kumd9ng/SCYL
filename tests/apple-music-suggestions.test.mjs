import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRelatedAppleMusicTracks, getRelatedAppleMusicTracks } from '../lib/apple-music-suggestions.mjs';

const song = (id, title, artist = 'Twenty One Pilots', extra = {}) => ({
  id: String(id), key: `us:song:${id}`, type: 'song', title, artist, album: 'Album',
  url: `https://music.apple.com/us/song/example/${id}`, ...extra,
});
const seed = song(1, 'Shy Away');

test('suggestions use exact artist names after case and whitespace normalization, not partial matches', () => {
  const rows = [song(2, 'Saturday', '  TWENTY   ONE PILOTS '), song(3, 'Cover', 'Twenty One Pilots Tribute'),
    song(4, 'Collaboration', 'Twenty One Pilots & Guest'), song(5, 'Other', 'Other Artist')];
  assert.deepEqual(selectRelatedAppleMusicTracks(seed, rows).map(track => track.id), ['2']);
});

test('seed, collected IDs or keys and album variants are excluded without inventing replacement songs', () => {
  const rows = [seed, song(6, 'shy   away', undefined, { album: 'Deluxe' }), song(2, 'Saturday'),
    song(3, 'Choker'), song(4, 'Redecorate'), song(5, 'Next Song'),
    song(7, 'Next Song', undefined, { album: 'Compilation' }), song(5, 'Different title for same ID')];
  const collected = [song(2, 'Saturday'), '3', 'us:song:4'];
  assert.deepEqual(selectRelatedAppleMusicTracks(seed, rows, { collected }).map(track => track.id), ['5']);
  assert.deepEqual(selectRelatedAppleMusicTracks(seed, []), []);
  assert.deepEqual(selectRelatedAppleMusicTracks(seed, [seed]), []);
});

test('selection preserves catalog order, caps at six and does not mutate input or use public artwork', () => {
  const rows = Array.from({ length: 12 }, (_, i) => song(i + 2, `Song ${i}`, undefined,
    { artworkUrl: 'https://is1.mzstatic.com/cover.jpg', searchProvider: 'apple-public-store' }));
  const selected = selectRelatedAppleMusicTracks(seed, rows, { limit: 100 });
  assert.deepEqual(selected.map(track => track.id), ['2', '3', '4', '5', '6', '7']);
  assert.ok(selected.every(track => track.artworkUrl === ''));
  assert.equal(rows[0].artworkUrl, 'https://is1.mzstatic.com/cover.jpg');
  assert.equal(selectRelatedAppleMusicTracks(seed, rows, { limit: 2 }).length, 2);
  assert.deepEqual(selectRelatedAppleMusicTracks(seed, rows, { limit: 0 }), []);
});

test('unsafe links and inconsistent song identities cannot become suggestions', () => {
  const rows = [song(2, 'Bad link', undefined, { url: 'https://evil.example/track/2' }),
    song(3, 'Wrong ID', undefined, { id: '4' }), song(5, 'Wrong key', undefined, { key: 'us:song:6' }),
    song(7, 'Valid')];
  assert.deepEqual(selectRelatedAppleMusicTracks(seed, rows).map(track => track.id), ['7']);
  assert.deepEqual(selectRelatedAppleMusicTracks({ ...seed, artist: '' }, rows), []);
});

test('related lookup searches the actual seed artist and applies the same catalog filter', async () => {
  const controller = new AbortController(); let request;
  const tracks = await getRelatedAppleMusicTracks(seed, { signal: controller.signal, country: 'kr', search: async (query, options) => {
    request = { query, options }; return [song(2, 'Saturday'), song(3, 'Wrong', 'Tribute')];
  } });
  assert.equal(request.query, seed.artist); assert.equal(request.options.signal, controller.signal);
  assert.equal(request.options.country, 'kr'); assert.deepEqual(tracks.map(track => track.id), ['2']);
  await assert.rejects(getRelatedAppleMusicTracks(seed, { search: async () => { throw Error('provider failed'); } }), /provider failed/);
});

test('cancelled lookups reject promptly and discard late responses even if the search ignores abort', async () => {
  const already = new AbortController(); already.abort(); let calls = 0;
  await assert.rejects(getRelatedAppleMusicTracks(seed, { signal: already.signal, search: async () => { calls++; return []; } }), { name: 'AbortError' });
  assert.equal(calls, 0);
  const controller = new AbortController(); let finish;
  const pending = getRelatedAppleMusicTracks(seed, { signal: controller.signal, search: () => new Promise(resolve => { finish = resolve; }) });
  await Promise.resolve(); controller.abort();
  await assert.rejects(pending, { name: 'AbortError' }); finish([song(2, 'Saturday')]);
  await Promise.resolve();
});
