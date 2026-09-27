import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const article = 'Mara followed the path beside the sea, carrying her grandmother’s story of the lighthouse. The morning was quiet, and she watched the waves shimmer. 🙂 海';

// This runs only inside the spawned test server. Production code still calls
// Gemini normally; no real key or external request is needed for these tests.
const preload = `
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) {
    return originalFetch(url, options);
  }
  await new Promise(resolve => setTimeout(resolve, 180));
  const body = JSON.parse(options.body);
  const chunks = JSON.parse(body.contents[0].parts[0].text);
  const invalid = chunks.some(chunk => chunk.paragraphs?.some(p => p.text.includes('TRIGGER_INVALID_SCORE')));
  const score = {overallTone:'Reflective', sections:chunks.map(chunk => ({
    id:chunk.id, mood:'calm', intensity:0.2, energy:0.3, brightness:0.7,
    musicPrompt:'Soft strings', keepParagraphIds:[chunk.paragraphs.length > 1 ? 1 : 0]
  }))};
  const text = invalid ? 'not valid JSON' : JSON.stringify(score);
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text}]}}]}), {
    status:200, headers:{'Content-Type':'application/json'}
  });
};
`;

async function availablePort() {
  const reservation = net.createServer();
  await new Promise((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  return port;
}

function postScan(port, text, splitUnicode = false) {
  const payload = Buffer.from(JSON.stringify({text, scan:true, stream:true}));
  return new Promise((resolve, reject) => {
    let endTimer;
    const request = http.request({
      hostname:'127.0.0.1', port, path:'/api/analyze', method:'POST',
      headers:{'Content-Type':'application/json'}
    }, response => {
      const parts = [];
      response.on('data', part => parts.push(part));
      response.once('error', reject);
      response.once('end', () => resolve({
        status:response.statusCode, headers:response.headers,
        firstPart:parts[0]?.toString('utf8'), body:Buffer.concat(parts).toString('utf8')
      }));
    });
    request.once('error', error => { clearTimeout(endTimer); reject(error); });
    request.setTimeout(5000, () => request.destroy(new Error('Scan test request timed out')));
    if (splitUnicode) {
      const offset = payload.indexOf(Buffer.from('🙂'));
      assert.ok(offset >= 0, 'The test payload must contain the multibyte character');
      request.write(payload.subarray(0, offset + 1));
      // Send separate network chunks that bisect a four-byte UTF-8 character.
      endTimer = setTimeout(() => request.end(payload.subarray(offset + 1)), 25);
    } else {
      request.end(payload);
    }
  });
}

function assertStartedStreaming(response) {
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'application/json');
  assert.match(response.firstPart, /^\s+$/, 'Headers and initial whitespace must arrive before the delayed Gemini result');
}

test('scan server streams scores and preserves incoming UTF-8 text', {timeout:15000}, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'undertone-scan-test-'));
  let server;
  try {
    const preloadPath = path.join(directory, 'mock-gemini.mjs');
    await writeFile(preloadPath, preload);
    const port = await availablePort();
    server = spawn(process.execPath, [
      '--import', pathToFileURL(preloadPath).href,
      fileURLToPath(new URL('../scripts/start.js', import.meta.url))
    ], {
      cwd:directory, env:{...process.env, PORT:String(port), GEMINI_API_KEY:'test'},
      stdio:['ignore', 'pipe', 'pipe']
    });
    let stderr = '';
    server.stderr.on('data', part => { stderr += part; });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Scan test server did not start: ${stderr}`)), 5000);
      server.stdout.once('data', () => { clearTimeout(timer); resolve(); });
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', code => { clearTimeout(timer); reject(new Error(`Scan test server exited (${code}): ${stderr}`)); });
    });

    await t.test('scan selection arrives after an immediate streaming response', async () => {
      const response = await postScan(port, `Home · Subscribe · Search\n\n${article}\n\nAccept all cookies`);
      assertStartedStreaming(response);
      const score = JSON.parse(response.body);
      assert.equal(score.source, 'gemini');
      assert.equal(score.sections.length, 1);
      assert.equal(score.sections[0].text, article);
      assert.equal(score.sections[0].keepParagraphIds, undefined);
    });

    await t.test('UTF-8 characters split across request chunks remain exact', async () => {
      const response = await postScan(port, `Home · Subscribe\n\n${article}`, true);
      assertStartedStreaming(response);
      assert.equal(JSON.parse(response.body).sections[0].text, article);
    });

    await t.test('Gemini failure still finishes the stream with a JSON error', async () => {
      const response = await postScan(port, `Home\n\n${article} TRIGGER_INVALID_SCORE`);
      assertStartedStreaming(response);
      const failure = JSON.parse(response.body);
      assert.match(failure.error, /Gemini returned an unreadable score/);
      assert.equal(failure.sections, undefined);
    });
  } finally {
    if (server?.pid && server.exitCode === null && server.signalCode === null) {
      const exited = new Promise(resolve => server.once('exit', resolve));
      server.kill();
      await exited;
    }
    await rm(directory, {recursive:true, force:true});
  }
});
