import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {analyze} from '../server/gemini.js';

const sample = 'The traveler arrived at the quiet harbor just before sunrise. She watched the boats move slowly through the mist and remembered the home she had left behind. A familiar voice called her name from the pier, and she turned with a sudden feeling of hope.';

// Synthetic text only; this checks Gemini access and both scoring schemas,
// independently of Chrome permissions and the page being scanned.
export async function checkScoring({analyzer = analyze, report = event => console.log(JSON.stringify(event))} = {}) {
  let passed = true;
  for (const mode of ['paste', 'scan']) {
    report({mode, event:'checking'});
    const started = Date.now();
    try {
      const result = await analyzer([{id:0, text:sample}], {
        cleanPage:mode === 'scan', onDiagnostic:event => report({mode, ...event})
      });
      report({mode, passed:true, sections:result.sections.length, elapsedMs:Date.now()-started});
    } catch (error) {
      passed = false;
      report({mode, passed:false,
        code:/^GEMINI_[A-Z_]+$/.test(error.code) ? error.code : 'SCORING_FAILED',
        ...(Number.isInteger(error.upstreamStatus) ? {upstreamStatus:error.upstreamStatus} : {}),
        elapsedMs:Date.now()-started});
    }
  }
  return passed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const {version} = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  console.log(JSON.stringify({version, node:process.version, platform:process.platform,
    model:process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    fallbackModel:process.env.GEMINI_FALLBACK_MODEL ?? 'gemini-3.5-flash-lite',
    keyConfigured:Boolean(process.env.GEMINI_API_KEY)}));
  if (!process.env.GEMINI_API_KEY) {
    console.log('Add GEMINI_API_KEY to your local .env first. Never share the key or .env.');
    process.exitCode = 1;
  } else {
    console.log('Checking paste and scan with synthetic text. This makes Gemini API requests using your project quota.');
    process.exitCode = await checkScoring() ? 0 : 1;
  }
}
