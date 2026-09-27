import {copyFile, constants} from 'node:fs/promises';

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
await import('./build.js');
console.log('Ready. Run npm start, then open http://127.0.0.1:8787. The sample works without an API key.');
