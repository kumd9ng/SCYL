import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAppleMusicLink } from '../lib/apple-music-links.mjs';

test('album song links select the song ID while keeping the official album embed path', () => {
  const song = parseAppleMusicLink('https://music.apple.com/us/album/shy-away/1561836997?i=1561837008&at=tracking&l=en#ignored');
  assert.equal(song.type, 'song');
  assert.equal(song.key, 'us:song:1561837008');
  assert.equal(song.url, 'https://music.apple.com/us/album/shy-away/1561836997?i=1561837008');
  assert.equal(song.embedUrl, 'https://embed.music.apple.com/us/album/shy-away/1561836997?i=1561837008');
  assert.equal(song.embedHeight, 175);
  // Album titles must not be presented as verified song titles.
  assert.equal(song.title, '곡 1561837008');
  assert.equal(song.key, parseAppleMusicLink('https://music.apple.com/us/song/shy-away/1561837008').key);
});

test('albums, playlists and international Unicode names preserve usable canonical paths', () => {
  const album = parseAppleMusicLink(' https://music.apple.com/kr/album/%EB%B4%84%EB%82%A0/123456/ ');
  assert.equal(album.title, '봄날');
  assert.equal(album.type, 'album');
  assert.equal(album.embedHeight, 450);
  const playlist = parseAppleMusicLink('https://music.apple.com/us/playlist/pure-jazz/pl.139b4ea405c1466cb6431908519eab37?app=music');
  assert.equal(playlist.title, 'pure jazz');
  assert.equal(playlist.type, 'playlist');
  assert.equal(playlist.embedUrl, 'https://embed.music.apple.com/us/playlist/pure-jazz/pl.139b4ea405c1466cb6431908519eab37');
  assert.notEqual(album.key, parseAppleMusicLink('https://music.apple.com/us/album/123456').key);
});

test('rejects third-party destinations, executable schemes and URLs with credentials', () => {
  for (const link of [
    'http://music.apple.com/us/song/test/123',
    'https://music.apple.com.evil.example/us/song/test/123',
    'https://music.apple.com@evil.example/us/song/test/123',
    'https://user:secret@music.apple.com/us/song/test/123',
    'https://music.apple.com:444/us/song/test/123',
    'javascript:alert(1)',
    '<iframe src="https://music.apple.com/us/song/test/123"></iframe>',
    'https://embed.music.apple.com/us/song/test/123',
  ]) assert.throws(() => parseAppleMusicLink(link), undefined, link);
});

test('rejects malformed IDs, unsupported Apple pages and ambiguous song selections', () => {
  for (const link of [
    'https://music.apple.com/us/browse',
    'https://music.apple.com/us/artist/name/123',
    'https://music.apple.com/us/song/test/not-a-number',
    'https://music.apple.com/us/playlist/test/123',
    'https://music.apple.com/us/album/test/123?i=456&i=789',
    'https://music.apple.com/us/album/test/123?i=',
    'https://music.apple.com/us/song/test/123?i=456',
    'https://music.apple.com/us/album/a%2Fb/123',
    'https://music.apple.com/us/album/%GG/123',
    'https://music.apple.com/us/album/a%00b/123',
  ]) assert.throws(() => parseAppleMusicLink(link), undefined, link);
  assert.throws(() => parseAppleMusicLink(null));
});
