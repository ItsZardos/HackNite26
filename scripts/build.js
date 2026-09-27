import {cp, mkdir, rm, access, readFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const out = new URL('../dist-extension/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('extension/manifest.json', root), 'utf8'));
const required = [
  'extension/vendor/Readability.js', 'extension/vendor/LICENSE.md',
  `extension/${manifest.action.default_popup}`, `extension/${manifest.background.service_worker}`,
  'extension/reader-launch.js', 'extension/popup.js', 'extension/popup.css',
  'reader/index.html', 'reader/app.js', 'reader/style.css', 'reader/audio.js', 'reader/demo.js',
  ...['calm', 'happy', 'hopeful', 'melancholy', 'mysterious', 'tense', 'dark', 'triumphant'].map(mood => `public/music/${mood}.wav`)
];
for (const file of required) {
  try { await access(new URL(file, root)); }
  catch { throw new Error(`Missing required project file: ${file}. Pull the complete repository and try again.`); }
}
await rm(out, {recursive: true, force: true});
await mkdir(out, {recursive: true});
await cp(new URL('extension/', root), out, {recursive: true});
for (const dir of ['reader', 'shared', 'public']) {
  await cp(new URL(`${dir}/`, root), new URL(`${dir}/`, out), {recursive: true});
}
console.log('Built dist-extension. Load it in chrome://extensions (Developer mode → Load unpacked).');
