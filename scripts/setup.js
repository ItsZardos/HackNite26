import {copyFile, constants} from 'node:fs/promises';
import {prepareExtension} from './build.js';

const [major,minor]=process.versions.node.split('.').map(Number);
if (major < 22 || major===22 && minor<13) {
  console.error('Undertone requires Node.js 22.13 or newer. Install Node.js, then run npm run setup again.');
  process.exit(1);
}
try {
  await copyFile(new URL('../.env.example', import.meta.url), new URL('../.env', import.meta.url), constants.COPYFILE_EXCL);
  console.log('Created .env. Add your own GEMINI_API_KEY for live analysis.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Kept your existing .env unchanged.');
}
await prepareExtension();
console.log('Run npm ci to install PDF support. Add your Gemini key to the local .env file, run npm start, then pin Undertone in Chrome.');
