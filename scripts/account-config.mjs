import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { validateSharedAccountConfig } from '../lib/shared-account.mjs';

export async function readAccountBuildConfig(root) {
  let local = {};
  try { local = parseEnv(await readFile(new URL('.env.local', root), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const value = name => process.env[name] || local[name] || '';
  const url = value('SCYL_SUPABASE_URL'), key = value('SCYL_SUPABASE_ANON_KEY');
  if (!url && !key) return null;
  validateSharedAccountConfig({ url, key });
  return { url, key };
}
