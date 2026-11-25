import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

// The signed developer JWT is public client configuration. The signing .p8 key
// must never be supplied here or bundled into the site.
export function validateAppleMusicDeveloperToken(token, { now = Date.now() / 1000 } = {}) {
  const reject = () => { throw new Error('Apple Music 개발자 토큰의 형식과 유효 기간을 확인해 주세요. 비밀 서명 키는 웹 빌드에 넣지 않습니다.'); };
  if (typeof token !== 'string' || token.length > 12000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) reject();
  let header, claims;
  try { const parts = token.split('.'); header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { reject(); }
  if (header?.alg !== 'ES256' || typeof header.kid !== 'string' || !header.kid || typeof claims?.iss !== 'string' || !claims.iss
    || !Number.isFinite(claims.iat) || !Number.isFinite(claims.exp) || claims.iat > now + 300 || claims.exp <= now + 60 || claims.exp <= claims.iat || claims.exp - claims.iat > 15777000) reject();
  return { expiresAt: claims.exp };
}
export async function readAppleMusicBuildConfig(root, { env = process.env, now } = {}) {
  let local = {};
  try { local = parseEnv(await readFile(new URL('.env.local', root), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const developerToken = (env.SCYL_APPLE_MUSIC_DEVELOPER_TOKEN || local.SCYL_APPLE_MUSIC_DEVELOPER_TOKEN || '').trim();
  if (!developerToken) return null;
  validateAppleMusicDeveloperToken(developerToken, { now });
  return { developerToken };
}
