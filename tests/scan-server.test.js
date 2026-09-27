import {makeDocx} from './helpers/docx-fixture.js';
import {makePdf} from './helpers/pdf-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const article = 'Mara followed the path beside the sea, carrying her grandmother’s story of the lighthouse. The morning was quiet, and she watched the waves shimmer. 🙂 海';

// This runs only inside the spawned test server. Production code still calls
// Gemini normally; no real key or external request is needed for these tests.
const preload = `
import {appendFile} from 'node:fs/promises';
const originalFetch = globalThis.fetch;
const attempts = new Map();
const record = event => appendFile(process.env.UNDERTONE_TEST_EVENTS, event + '\\n');
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) {
    return originalFetch(url, options);
  }
  const body = JSON.parse(options.body);
  const chunks = JSON.parse(body.contents[0].parts[0].text);
  const trigger = JSON.stringify(chunks).match(/TRIGGER_[A-Z_]+/)?.[0] || 'NORMAL';
  const attempt = (attempts.get(trigger) || 0) + 1;
  attempts.set(trigger, attempt);
  await record(trigger + ':' + attempt);
  if (trigger.startsWith('TRIGGER_ABORT_')) {
    return new Promise((resolve, reject) => {
      const aborted = async () => {
        await record(trigger + ':aborted');
        reject(options.signal.reason || new DOMException('Aborted', 'AbortError'));
      };
      if (options.signal.aborted) aborted();
      else options.signal.addEventListener('abort', aborted, {once:true});
    });
  }
  await new Promise(resolve => setTimeout(resolve, 180));
  let status;
  if (trigger === 'TRIGGER_TRANSIENT' && attempt === 1) status = 503;
  if (trigger.startsWith('TRIGGER_UNAVAILABLE')) status = 503;
  if (trigger === 'TRIGGER_AUTH') status = 401;
  if (trigger === 'TRIGGER_FORBIDDEN') status = 403;
  if (status) return new Response(JSON.stringify({error:{code:status, status:status===503?'UNAVAILABLE':'PERMISSION_DENIED', message:'RAW_UPSTREAM_SECRET should never reach the popup'}}), {
    status, headers:{'Content-Type':'application/json', 'Retry-After':'1'}
  });
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

function postScan(port, text, splitUnicode = false, stream = true) {
  const payload = Buffer.from(JSON.stringify({text, scan:true, stream}));
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
    request.setTimeout(10000, () => request.destroy(new Error('Scan test request timed out')));
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

function disconnectScan(port, text) {
  return new Promise((resolve, reject) => {
    let disconnected = false;
    const request = http.request({
      hostname:'127.0.0.1', port, path:'/api/analyze', method:'POST',
      headers:{'Content-Type':'application/json'}
    }, response => {
      response.once('data', () => {
        disconnected = true;
        request.destroy();
        resolve();
      });
      response.on('error', error => { if (!disconnected) reject(error); });
    });
    request.on('error', error => { if (!disconnected) reject(error); });
    request.setTimeout(3000, () => request.destroy(new Error('Disconnect test did not receive headers')));
    request.end(JSON.stringify({text, scan:true, stream:true}));
  });
}

function assertStartedStreaming(response) {
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'application/json');
  assert.match(response.firstPart, /^\s+$/, 'Headers and initial whitespace must arrive before the delayed Gemini result');
}

test('scan server streams scores, reports upstream errors and cancels disconnected work', {timeout:30000}, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'undertone-scan-test-'));
  let server;
  try {
    const preloadPath = path.join(directory, 'mock-gemini.mjs');
    const eventsPath = path.join(directory, 'upstream-events.txt');
    await writeFile(preloadPath, preload);
    await writeFile(eventsPath, '');
    const port = await availablePort();
    server = spawn(process.execPath, [
      '--import', pathToFileURL(preloadPath).href,
      fileURLToPath(new URL('../scripts/start.js', import.meta.url))
    ], {
      cwd:directory, env:{...process.env, PORT:String(port), GEMINI_API_KEY:'test', UNDERTONE_TEST_EVENTS:eventsPath},
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

    await t.test('DOCX endpoint extracts real binary before analysis',async()=>{
      const response=await fetch(`http://127.0.0.1:${port}/api/docx-text`,{method:'POST',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},body:await makeDocx()});
      assert.equal(response.status,200);assert.match((await response.json()).text,/quiet harbor/);
    });

    await t.test('PDF endpoint extracts binary locally and rejects wrong origins and content', async()=>{
      const endpoint=`http://127.0.0.1:${port}/api/pdf-text`;
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/pdf'},body:makePdf()});
      assert.equal(response.status,200);
      assert.match((await response.json()).text,/quiet harbor/);
      const forbidden=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/pdf',Origin:'https://untrusted.example'},body:makePdf()});
      assert.equal(forbidden.status,403);
      const invalid=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/pdf'},body:'not a PDF'});
      assert.equal((await invalid.json()).code,'PDF_INVALID');
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

    const attemptCount = async trigger => (await readFile(eventsPath, 'utf8')).split('\n').filter(line => new RegExp(`^${trigger}:\\d+$`).test(line)).length;

    await t.test('one transient HTTP 503 is retried before a streamed score succeeds', async () => {
      const response = await postScan(port, `Home\n\n${article} TRIGGER_TRANSIENT`);
      assertStartedStreaming(response);
      const score = JSON.parse(response.body);
      assert.equal(score.source, 'gemini');
      assert.match(score.sections[0].text, /TRIGGER_TRANSIENT/);
      assert.equal(await attemptCount('TRIGGER_TRANSIENT'), 2);
    });

    await t.test('repeated upstream errors preserve safe code and retry guidance in both response modes', async () => {
      for (const [trigger, stream] of [['TRIGGER_UNAVAILABLE_STREAM', true], ['TRIGGER_UNAVAILABLE_JSON', false]]) {
        const response = await postScan(port, `Home\n\n${article} ${trigger}`, false, stream);
        if (stream) assertStartedStreaming(response);
        else assert.equal(response.status, 503);
        const failure = JSON.parse(response.body);
        assert.match(failure.error, /^Gemini/);
        assert.equal(failure.code, 'GEMINI_UNAVAILABLE');
        assert.equal(failure.upstreamStatus, 503);
        assert.equal(failure.retryAfterSeconds, 1);
        assert.doesNotMatch(response.body, /RAW_UPSTREAM_SECRET/);
        assert.equal(failure.sections, undefined);
        assert.equal(await attemptCount(trigger), 3);
      }
    });

    await t.test('authentication errors fail once and expose safe actionable messages', async () => {
      for (const [trigger, stream] of [['TRIGGER_AUTH', true], ['TRIGGER_FORBIDDEN', false]]) {
        const response = await postScan(port, `Home\n\n${article} ${trigger}`, false, stream);
        if (stream) assertStartedStreaming(response);
        else assert.equal(response.status, 503);
        const failure = JSON.parse(response.body);
        assert.match(failure.error, /^Gemini/);
        assert.equal(failure.code, trigger === 'TRIGGER_AUTH' ? 'GEMINI_KEY_INVALID' : 'GEMINI_ACCESS_DENIED');
        assert.doesNotMatch(response.body, /RAW_UPSTREAM_SECRET/);
        assert.equal(await attemptCount(trigger), 1);
      }
    });

    await t.test('disconnect aborts upstream calls and releases both concurrency slots', async () => {
      for (const trigger of ['TRIGGER_ABORT_ONE', 'TRIGGER_ABORT_TWO']) {
        await disconnectScan(port, `Home\n\n${article} ${trigger}`);
        const deadline = Date.now() + 2000;
        while (!(await readFile(eventsPath, 'utf8')).includes(`${trigger}:aborted`)) {
          assert.ok(Date.now() < deadline, 'Client disconnect must abort the upstream signal');
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }
      const response = await postScan(port, `Home\n\n${article}`);
      assertStartedStreaming(response);
      assert.equal(JSON.parse(response.body).source, 'gemini');
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
