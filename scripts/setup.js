import {copyFile, constants} from 'node:fs/promises';
import {prepareExtension} from './build.js';

if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error('Undertone requires Node.js 22 or newer. Install Node.js, then run npm run setup again.');
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
console.log('Add your Gemini key to the local .env file, run npm start, then pin Undertone in Chrome.');
