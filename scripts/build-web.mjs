import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { readAccountBuildConfig } from './account-config.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = path.join(root, 'www');
const accountConfig = await readAccountBuildConfig(new URL('..', import.meta.url));
const config = JSON.parse(await readFile(path.join(root, 'capacitor.config.json'), 'utf8'));
if (config.webDir !== 'www' || path.dirname(out) !== root || path.basename(out) !== 'www') {
  throw new Error('Refusing to package outside the project-owned www directory.');
}
const inputs = ['index.html', 'privacy.html', 'mix-lab.html', 'auth.html', 'style.css', 'mix-lab.css', 'account.css', 'manifest.webmanifest'];
async function collect(relative) {
  for (const item of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const next = path.join(relative, item.name);
    if (item.isSymbolicLink()) throw new Error('Build inputs must not contain symbolic links: ' + next);
    if (item.isDirectory()) await collect(next);
    else if (item.isFile()) inputs.push(next);
  }
}
await collect('assets');
// Compile in memory first so invalid source cannot destroy the prior working bundle.
for (const file of [...inputs, 'app.mjs', 'privacy.mjs', 'mix-lab.mjs', 'audio-analysis-worker.mjs']) {
  if (!(await stat(path.join(root, file))).isFile()) throw new Error('Missing build input: ' + file);
}
const html = new Map();
for (const [file, source] of [['index.html', 'app'], ['privacy.html', 'privacy'], ['mix-lab.html', 'mix-lab'], ['auth.html', 'auth']]) {
  const content = await readFile(path.join(root, file), 'utf8');
  const reference = `src="${source}.mjs"`;
  if (content.split(reference).length !== 2) throw new Error(`Expected exactly one ${reference} entry in ${file}.`);
  html.set(file, content.replace(reference, `src="${source}.js"`));
}
const compiled = await build({
  absWorkingDir: root, entryPoints: { app: 'app.mjs', privacy: 'privacy.mjs', 'mix-lab': 'mix-lab.mjs', auth: 'auth.mjs', 'audio-analysis-worker': 'audio-analysis-worker.mjs', 'audio-render-check': 'lib/audio-render-check.mjs' }, outdir: out,
  bundle: true, splitting: true, format: 'esm', platform: 'browser',
  target: ['safari15.4', 'chrome90'], chunkNames: 'chunks/[name]-[hash]',
  write: false, metafile: true, sourcemap: false, logLevel: 'warning',
  define: { __SCYL_ACCOUNT_CONFIG__: JSON.stringify(accountConfig) },
});
for (const output of compiled.outputFiles) {
  const relative = path.relative(out, path.resolve(output.path));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !relative.endsWith('.js')) {
    throw new Error('Unexpected JavaScript output path: ' + output.path);
  }
}
// Both paths are absolute and the output is the known generated www, never a source tree.
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const file of inputs) {
  const destination = path.join(out, file);
  await mkdir(path.dirname(destination), { recursive: true });
  if (html.has(file)) await writeFile(destination, html.get(file));
  else await copyFile(path.join(root, file), destination);
}
for (const output of compiled.outputFiles) {
  await mkdir(path.dirname(output.path), { recursive: true });
  await writeFile(output.path, output.contents);
}
const files = [];
async function record(relative = '') {
  for (const item of await readdir(path.join(out, relative), { withFileTypes: true })) {
    const next = path.join(relative, item.name);
    if (item.isDirectory()) await record(next);
    else {
      const bytes = await readFile(path.join(out, next));
      files.push({ path: next.replaceAll(path.sep, '/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
}
await record();
files.sort((a, b) => a.path.localeCompare(b.path));
await writeFile(path.join(out, 'build-manifest.json'), JSON.stringify({
  app: 'SCYL', appId: config.appId, provisionalAppId: true,
  bundler: 'esbuild', entries: { app: 'app.js', privacy: 'privacy.js', 'mix-lab': 'mix-lab.js' }, files,
}, null, 2) + '\n');
console.log(`Packaged ${files.length} web assets into ${out}; JavaScript modules use .js MIME-safe names.`);
console.log('Native bundle excludes server.mjs; /api/metadata remains optional.');
