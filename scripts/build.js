import {lstat, readdir, readFile, rename} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
import {TRACKS} from '../extension/public/music/catalog.js';

const projectRoot = new URL('../', import.meta.url);
const requiredFiles = [
  'manifest.json', 'popup.html', 'popup.css', 'popup.js', 'background.js', 'reader-launch.js', 'pdf.js', 'document-file.js', 'document-transfer.js',
  'vendor/Readability.js', 'vendor/LICENSE.md',
  'reader/index.html', 'reader/app.js', 'reader/style.css', 'reader/audio.js', 'reader/reading-position.js', 'reader/music-library.js',
  'public/music/catalog.js', 'public/music/recordings.js', 'public/music/sources.json', 'public/music/CREDITS.md', 'public/music/LICENSE.md',
  ...TRACKS.map(track => `public/music/${track.file}`),
  'public/brand/monkey.png', 'public/brand/mascot.css', 'public/brand/mascot.js',
  ...[16, 32, 48, 128].map(size => `public/brand/icon-${size}.png`),
  ...['calm', 'happy', 'hopeful', 'melancholy', 'mysterious', 'tense', 'dark', 'triumphant'].map(mood => `public/music/${mood}.wav`)
];
const allowedFiles = new Set(requiredFiles);
const allowedDirectories = new Set(['reader', 'vendor', 'public', 'public/music', 'public/music/recordings', 'public/brand']);

// The committed folder is the installable extension. Keep its contents explicit
// so backend files, credentials, and accidental copies cannot enter the package.
export async function validateExtension(root = projectRoot) {
  const extension = new URL('extension/', root);
  if (!(await lstat(new URL('extension', root))).isDirectory()) throw new Error('extension must be a regular directory, not a symbolic link.');
  const files = new Set();
  async function inspect(directory = '') {
    for (const entry of await readdir(new URL(directory, extension), {withFileTypes: true})) {
      const relative = directory + entry.name;
      if (entry.name === '.DS_Store' && entry.isFile()) continue; // Harmless Finder metadata.
      if (entry.isDirectory() && allowedDirectories.has(relative)) await inspect(relative + '/');
      else if (entry.isFile() && allowedFiles.has(relative)) files.add(relative);
      else throw new Error(`Unexpected extension file or directory: ${relative}. Keep credentials and backend files outside extension/.`);
    }
  }
  await inspect();
  for (const file of requiredFiles) {
    if (!files.has(file)) throw new Error(`Missing required extension file: ${file}. Pull the complete repository and try again.`);
  }
  const manifest = JSON.parse(await readFile(new URL('manifest.json', extension), 'utf8'));
  const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  if (!/^\d+(?:\.\d+){0,3}$/.test(manifest.version) || manifest.version !== pkg.version) {
    throw new Error(`Version mismatch: package.json is ${pkg.version}; extension/manifest.json is ${manifest.version}. Update both together.`);
  }
  if (manifest.manifest_version !== 3 || manifest.background?.type !== 'module') {
    throw new Error('Undertone requires a Manifest V3 extension with a module background worker.');
  }
  function checkReference(reference, source) {
    if (typeof reference !== 'string' || !reference || reference.includes('\\')) throw new Error(`Invalid asset reference in ${source}.`);
    if (source === 'manifest.json' && /[?#]/.test(reference)) throw new Error('Manifest assets must be file paths without query strings or fragments.');
    if (reference.startsWith('#')) return;
    const target = new URL(reference, new URL(source, extension));
    if (target.protocol !== 'file:' || !target.href.startsWith(extension.href)) {
      throw new Error(`Asset reference escapes extension/: ${reference} in ${source}.`);
    }
    const relative = path.relative(fileURLToPath(extension), fileURLToPath(target)).split(path.sep).join('/');
    if (!files.has(relative)) throw new Error(`Missing linked asset: ${reference} in ${source}.`);
  }
  checkReference(manifest.action?.default_popup, 'manifest.json');
  checkReference(manifest.background?.service_worker, 'manifest.json');
  for (const icons of [manifest.icons, manifest.action?.default_icon]) {
    if (!icons || typeof icons !== 'object') throw new Error('Extension and toolbar icons must be configured.');
    for (const size of [16, 32, 48, 128]) {
      checkReference(icons[size], 'manifest.json');
      const png = await readFile(new URL(icons[size], extension));
      if (png.length < 33 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        || png.toString('ascii', 12, 16) !== 'IHDR'
        || png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) {
        throw new Error(`Extension icon must be a ${size}×${size} PNG: ${icons[size]}`);
      }
    }
  }
  for (const file of files) {
    if (!/\.(html|js|css)$/.test(file) || file.startsWith('vendor/')) continue;
    const source = await readFile(new URL(file, extension), 'utf8');
    const patterns = file.endsWith('.html')
      ? [/\b(?:src|href)\s*=\s*["']([^"']+)["']/g]
      : file.endsWith('.css')
        ? [/url\(\s*["']?([^\s"')]+)["']?\s*\)/g]
        : [/\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?["']([^"']+)["']/g, /\bimport\(\s*["']([^"']+)["']\s*\)/g];
    for (const pattern of patterns) for (const match of source.matchAll(pattern)) checkReference(match[1], file);
  }
  return {version: manifest.version, extensionPath: fileURLToPath(extension)};
}

// Disable only a recognizable old Undertone build. Preserve its files and never
// overwrite an existing backup or touch an unknown directory/symbolic link.
export async function retireLegacyBuild(root = projectRoot) {
  const legacy = new URL('dist-extension/', root);
  const manifestURL = new URL('manifest.json', legacy);
  const retiredURL = new URL('manifest.json.retired', legacy);
  const warning = 'Left an unrecognized dist-extension folder unchanged. Load extension/, not dist-extension.';
  try {
    if (!(await lstat(new URL('dist-extension', root))).isDirectory() || !(await lstat(manifestURL)).isFile()) return warning;
    let manifest;
    try { manifest = JSON.parse(await readFile(manifestURL, 'utf8')); }
    catch { return warning; }
    if (manifest.name !== 'Undertone — a score for every story' || manifest.manifest_version !== 3
      || manifest.action?.default_popup !== 'popup.html' || manifest.background?.service_worker !== 'background.js') return warning;
    try {
      await lstat(retiredURL);
      return 'Left dist-extension unchanged because manifest.json.retired already exists. Load extension/ and remove the old Chrome installation.';
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await rename(manifestURL, retiredURL);
    return 'Retired the old dist-extension manifest; its files are preserved. Remove the old Undertone entry in Chrome and load extension/.';
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function prepareExtension(root = projectRoot) {
  const result = await validateExtension(root);
  const legacyMessage = await retireLegacyBuild(root);
  if (legacyMessage) console.log(legacyMessage);
  console.log(`Undertone ${result.version} is ready. In chrome://extensions, choose Load unpacked and select:\n${result.extensionPath}`);
  return result;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await prepareExtension();
}
