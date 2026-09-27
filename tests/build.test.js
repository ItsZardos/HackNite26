import test from 'node:test';
import assert from 'node:assert/strict';
import {cp, mkdir, mkdtemp, readFile, rm, writeFile, access, rename, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {validateExtension, retireLegacyBuild} from '../scripts/build.js';

const projectRoot = new URL('../', import.meta.url);
async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'undertone-layout-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const root = pathToFileURL(directory + path.sep);
  await cp(new URL('extension/', projectRoot), new URL('extension/', root), {recursive: true});
  await cp(new URL('package.json', projectRoot), new URL('package.json', root));
  return root;
}
async function editManifest(root, change) {
  const url = new URL('extension/manifest.json', root);
  const manifest = JSON.parse(await readFile(url, 'utf8'));
  change(manifest);
  await writeFile(url, JSON.stringify(manifest));
}
async function legacyFixture(root, changes = {}) {
  const manifest = JSON.parse(await readFile(new URL('extension/manifest.json', root), 'utf8'));
  await mkdir(new URL('dist-extension/', root));
  await writeFile(new URL('dist-extension/manifest.json', root), JSON.stringify({...manifest, version: '1.1.0', ...changes}));
  await writeFile(new URL('dist-extension/custom-note.txt', root), 'Keep this file.');
}

test('committed extension is complete and has the package version without a copied build', async () => {
  const result = await validateExtension(projectRoot);
  const pkg = JSON.parse(await readFile(new URL('package.json', projectRoot), 'utf8'));
  assert.equal(result.version, pkg.version);
  assert.match(result.extensionPath, /extension[/\\]$/);
});

test('missing bundled music is detected before Chrome loads the extension', async t => {
  const root = await fixture(t);
  await rm(new URL('extension/public/music/calm.wav', root));
  await assert.rejects(validateExtension(root), /Missing required extension file: public\/music\/calm.wav/);
});

test('package and extension versions cannot drift', async t => {
  const root = await fixture(t);
  await editManifest(root, manifest => { manifest.version = '1.1.0'; });
  await assert.rejects(validateExtension(root), /Version mismatch/);
});

for (const unwanted of ['.env', 'reader/.env.local', 'server/index.js', 'config-with-key.js']) {
  test(`unexpected extension contents are rejected: ${unwanted}`, async t => {
    const root = await fixture(t);
    const file = new URL(`extension/${unwanted}`, root);
    await mkdir(new URL('.', file), {recursive: true});
    await writeFile(file, 'This file should never be packaged.');
    await assert.rejects(validateExtension(root), /Unexpected extension file or directory/);
  });
}

test('manifest paths must name assets inside the extension', async t => {
  const root = await fixture(t);
  await editManifest(root, manifest => { manifest.background.service_worker = '../server/index.js'; });
  await assert.rejects(validateExtension(root), /escapes extension/);
});

test('extension icons must resolve to PNGs at their declared sizes', async t => {
  const root = await fixture(t);
  await editManifest(root, manifest => { manifest.action.default_icon['16'] = 'public/brand/icon-32.png'; });
  await assert.rejects(validateExtension(root), /16×16 PNG/);
  await editManifest(root, manifest => { manifest.action.default_icon['16'] = '../private.png'; });
  await assert.rejects(validateExtension(root), /escapes extension/);
});

test('nested reader HTML links and module imports must resolve', async t => {
  const root = await fixture(t);
  const html = new URL('extension/reader/index.html', root);
  const original = await readFile(html, 'utf8');
  await writeFile(html, original.replace('style.css', 'missing.css'));
  await assert.rejects(validateExtension(root), /Missing linked asset: missing.css in reader\/index.html/);
  await writeFile(html, original);
  const app = new URL('extension/reader/app.js', root);
  await writeFile(app, (await readFile(app, 'utf8')).replace("'./audio.js'", "'../../server/index.js'"));
  await assert.rejects(validateExtension(root), /escapes extension/);
});

test('legacy retirement disables only the old manifest and preserves files', async t => {
  const root = await fixture(t);
  await legacyFixture(root);
  assert.match(await retireLegacyBuild(root), /Retired the old/);
  await assert.rejects(access(new URL('dist-extension/manifest.json', root)), {code: 'ENOENT'});
  const retired = JSON.parse(await readFile(new URL('dist-extension/manifest.json.retired', root), 'utf8'));
  assert.equal(retired.version, '1.1.0');
  assert.equal(await readFile(new URL('dist-extension/custom-note.txt', root), 'utf8'), 'Keep this file.');
  assert.equal(await retireLegacyBuild(root), null);
});

test('unknown legacy manifests and existing backups remain unchanged', async t => {
  const root = await fixture(t);
  await legacyFixture(root, {name: 'Another extension'});
  const manifestURL = new URL('dist-extension/manifest.json', root);
  const original = await readFile(manifestURL, 'utf8');
  assert.match(await retireLegacyBuild(root), /unrecognized/);
  assert.equal(await readFile(manifestURL, 'utf8'), original);
  const manifest = JSON.parse(original);
  manifest.name = 'Undertone — a score for every story';
  await writeFile(manifestURL, JSON.stringify(manifest));
  const retiredURL = new URL('dist-extension/manifest.json.retired', root);
  await writeFile(retiredURL, 'Preserve existing backup.');
  assert.match(await retireLegacyBuild(root), /already exists/);
  assert.equal(await readFile(retiredURL, 'utf8'), 'Preserve existing backup.');
  await access(manifestURL);
});

test('legacy retirement never follows a directory symlink', async t => {
  const root = await fixture(t);
  await legacyFixture(root);
  const legacy = new URL('dist-extension', root);
  const target = new URL('another-directory', root);
  await rename(legacy, target);
  await symlink(fileURLToPath(target), fileURLToPath(legacy), 'junction');
  assert.match(await retireLegacyBuild(root), /unrecognized/);
  await access(new URL('another-directory/manifest.json', root));
});
