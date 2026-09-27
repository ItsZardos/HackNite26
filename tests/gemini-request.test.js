import test from 'node:test';
import assert from 'node:assert/strict';
import {requestGemini} from '../server/gemini-request.js';
import {analyze} from '../server/gemini.js';

const key = 'private-test-key';
const body = {contents: [{parts: [{text: 'private-article-text'}]}]};
const success = {candidates: [{content: {parts: [{text: '{}'}]}}]};
const response = (status, payload = {error: {status: 'UNAVAILABLE'}}, headers = {}) => ({
  ok: status >= 200 && status < 300, status, headers: new Headers(headers), json: async () => payload
});
function harness(fetcher, extra = {}) {
  const events = [], waits = [];
  return {
    events, waits,
    run: () => requestGemini(body, {
      key, model: 'gemini-3.8-flash', fetcher,
      wait: async milliseconds => { waits.push(milliseconds); },
      onDiagnostic: event => events.push(event), ...extra
    })
  };
}
function untilAbort(signal) {
  return new Promise((resolve, reject) => {
    // Keep the process alive while AbortSignal's unref'ed timer does its work.
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      reject(new Error('Mock request was not cancelled within its deadline.'));
    }, 2000);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, {once: true});
  });
}

test('transient recovery preserves the request and keeps the API key out of the URL', async () => {
  const requests = [];
  const h = harness(async (url, options) => {
    requests.push({url, options});
    return requests.length === 1 ? response(503) : response(200, success);
  });
  assert.deepEqual(await h.run(), success);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.options.headers['x-goog-api-key'], key);
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.body, JSON.stringify(body));
    assert.ok(!request.url.includes(key));
    assert.ok(request.options.signal instanceof AbortSignal);
  }
  assert.notEqual(requests[0].options.signal, requests[1].options.signal);
  assert.equal(h.waits.length, 1);
  assert.equal(h.events.at(-1).event, 'recovered');
});

for (const status of [408, 500, 502, 503, 504]) {
  test(`transient HTTP ${status} stops after three attempts`, async () => {
    let calls = 0;
    const h = harness(async () => { calls++; return response(status); });
    await assert.rejects(h.run(), {code: 'GEMINI_UNAVAILABLE'});
    assert.equal(calls, 3);
    assert.equal(h.waits.length, 2);
    assert.equal(h.events.at(-1).retry, false);
  });
}

test('network failure retries without exposing the original exception', async () => {
  let calls = 0;
  const h = harness(async () => {
    calls++;
    if (calls === 1) throw new TypeError(`fetch failed ${key} private-article-text`);
    return response(200, success);
  });
  assert.deepEqual(await h.run(), success);
  assert.equal(calls, 2);
  assert.equal(h.events[0].code, 'GEMINI_NETWORK');
  assert.ok(!JSON.stringify(h.events).includes(key));
});

test('body transport errors retry, while malformed successful JSON does not', async () => {
  let calls = 0;
  const h = harness(async () => {
    calls++;
    return calls === 1
      ? {ok: true, status: 200, json: async () => { throw new TypeError('terminated'); }}
      : response(200, success);
  });
  assert.deepEqual(await h.run(), success);
  assert.equal(calls, 2);
  const invalid = harness(async () => ({ok: true, status: 200, json: async () => { throw new SyntaxError('invalid JSON with private text'); }}));
  await assert.rejects(invalid.run(), {code: 'GEMINI_INVALID_RESPONSE'});
  assert.equal(invalid.waits.length, 0);
});

for (const [status, payload, code] of [
  [401, {}, 'GEMINI_KEY_INVALID'],
  [400, {error: {details: [{'@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID'}]}}, 'GEMINI_KEY_INVALID'],
  [403, {error: {status: 'PERMISSION_DENIED'}}, 'GEMINI_ACCESS_DENIED'],
  [404, {error: {status: 'NOT_FOUND'}}, 'GEMINI_MODEL_UNAVAILABLE'],
  [505, {error: {message: 'Server is unable to handle the request'}}, 'GEMINI_HTTP_VERSION_UNSUPPORTED'],
  [400, {error: {status: 'FAILED_PRECONDITION'}}, 'GEMINI_ACCOUNT_REQUIRED'],
  [400, {error: {status: 'INVALID_ARGUMENT'}}, 'GEMINI_REQUEST_REJECTED']
]) {
  test(`permanent ${code} is actionable and never retried`, async () => {
    let calls = 0;
    const h = harness(async () => { calls++; return response(status, payload); });
    await assert.rejects(h.run(), error => {
      assert.equal(error.code, code);
      assert.equal(error.upstreamStatus, status);
      assert.match(error.message, /^Gemini/);
      return true;
    });
    assert.equal(calls, 1);
    assert.equal(h.waits.length, 0);
  });
}

test('minimal or unreadable error responses still receive HTTP classification', async () => {
  for (const failed of [
    {ok: false, status: 403},
    {ok: false, status: 403, json: async () => { throw new SyntaxError('HTML error page'); }}
  ]) {
    const h = harness(async () => failed);
    await assert.rejects(h.run(), {code: 'GEMINI_ACCESS_DENIED'});
    assert.equal(h.waits.length, 0);
  }
});

test('temporary quota retries honor the longer of Retry-After and Google RetryInfo', async () => {
  let calls = 0;
  const h = harness(async () => {
    calls++;
    return calls === 1 ? response(429, {error: {status: 'RESOURCE_EXHAUSTED', details: [
      {'@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '2.2s'}
    ]}}, {'retry-after': '1'}) : response(200, success);
  });
  assert.deepEqual(await h.run(), success);
  assert.equal(calls, 2);
  assert.ok(h.waits[0] >= 2200 && h.waits[0] <= 3000);
});

test('HTTP-date Retry-After is honored', async t => {
  const now = Date.UTC(2026, 8, 27, 0, 0, 0);
  t.mock.method(Date, 'now', () => now);
  let calls = 0;
  const h = harness(async () => ++calls === 1
    ? response(503, {}, {'retry-after': new Date(now + 5000).toUTCString()})
    : response(200, success));
  await h.run();
  assert.equal(h.waits[0], 5000);
});

test('long Retry-After does not become a shorter aggressive retry', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; return response(429, {}, {'retry-after': '120'}); });
  await assert.rejects(h.run(), {code: 'GEMINI_RATE_LIMITED', retryAfterSeconds: 120});
  assert.equal(calls, 1);
  assert.equal(h.waits.length, 0);
});

test('daily and zero allowance quota failures do not retry', async () => {
  for (const error of [
    {status: 'RESOURCE_EXHAUSTED', details: [{'@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier'}]}]},
    {status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for metric requests, limit: 0'}
  ]) {
    let calls = 0;
    const h = harness(async () => { calls++; return response(429, {error}); });
    await assert.rejects(h.run(), {code: 'GEMINI_QUOTA_EXHAUSTED'});
    assert.equal(calls, 1);
    assert.equal(h.waits.length, 0);
  }
});

test('billing boilerplate does not turn a per-minute quota into permanent exhaustion', async () => {
  let calls = 0;
  const h = harness(async () => ++calls === 1 ? response(429, {error: {
    status: 'RESOURCE_EXHAUSTED',
    message: 'You exceeded your current quota, please check your plan and billing details.',
    details: [
      {'@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier'}]},
      {'@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '1s'}
    ]
  }}) : response(200, success));
  assert.deepEqual(await h.run(), success);
  assert.equal(calls, 2);
  assert.equal(h.events[0].code, 'GEMINI_RATE_LIMITED');
});

test('diagnostics omit upstream messages, request text, keys, and project identifiers', async () => {
  const privateMessage = `${key} private-article-text private-project-id`;
  const h = harness(async () => response(403, {error: {message: privateMessage}}));
  await assert.rejects(h.run(), error => {
    for (const secret of privateMessage.split(' ')) assert.ok(!error.message.includes(secret));
    return true;
  });
  const diagnostic = JSON.stringify(h.events);
  for (const secret of privateMessage.split(' ')) assert.ok(!diagnostic.includes(secret));
  for (const event of h.events) {
    assert.ok(Object.keys(event).every(field => ['event', 'attempt', 'httpStatus', 'code', 'retry', 'elapsedMs', 'model'].includes(field)));
  }
});

test('diagnostic callback errors cannot change recovery or successful output', async () => {
  let calls = 0;
  const h = harness(async () => ++calls === 1 ? response(503) : response(200, success), {
    onDiagnostic: () => { throw new Error('broken diagnostic sink'); }
  });
  assert.deepEqual(await h.run(), success);
  assert.equal(calls, 2);
});

test('pre-aborted and actively cancelled requests never retry', async () => {
  const preAborted = new AbortController();
  const reason = new Error('caller cancelled');
  preAborted.abort(reason);
  let calls = 0;
  const early = harness(async () => { calls++; return response(200, success); }, {signal: preAborted.signal});
  await assert.rejects(early.run(), error => error === reason);
  assert.equal(calls, 0);
  const controller = new AbortController();
  const active = harness(async (url, options) => {
    calls++;
    queueMicrotask(() => controller.abort(reason));
    return untilAbort(options.signal);
  }, {signal: controller.signal});
  await assert.rejects(active.run(), error => error === reason);
  assert.equal(calls, 1);
  assert.equal(active.waits.length, 0);
});

test('caller cancellation during retry backoff prevents another request', async () => {
  const controller = new AbortController();
  const reason = new Error('popup closed');
  let calls = 0;
  const h = harness(async () => { calls++; return response(503); }, {
    signal: controller.signal,
    wait: async (milliseconds, signal) => {
      queueMicrotask(() => controller.abort(reason));
      await untilAbort(signal);
    }
  });
  await assert.rejects(h.run(), error => error === reason);
  assert.equal(calls, 1);
});

test('an attempt timeout may recover inside the total deadline', async () => {
  let calls = 0;
  const h = harness(async (url, options) => ++calls === 1 ? untilAbort(options.signal) : response(200, success), {
    timeoutMs: 4000, attemptTimeoutMs: 10
  });
  assert.deepEqual(await h.run(), success);
  assert.equal(calls, 2);
  assert.equal(h.events[0].code, 'GEMINI_TIMEOUT');
});

for (const phase of ['headers', 'body', 'backoff']) {
  test(`total deadline cancels ${phase} without starting another request`, async () => {
    let calls = 0;
    const h = harness(async (url, options) => {
      calls++;
      if (phase === 'headers') return untilAbort(options.signal);
      if (phase === 'body') return {ok: true, status: 200, json: () => untilAbort(options.signal)};
      return response(503, {}, {'retry-after': '0'});
    }, {
      timeoutMs: phase === 'backoff' ? 1200 : 15, attemptTimeoutMs: 2000,
      wait: async (milliseconds, signal) => untilAbort(signal)
    });
    await assert.rejects(h.run(), {code: 'GEMINI_TIMEOUT'});
    assert.equal(calls, 1);
  });
}

const passage = 'Mara watched the sea become quiet as morning light crossed the windows of the lighthouse. '.repeat(2);
const chunks = [{id: 0, text: passage}];
const score = {overallTone: 'Quiet', sections: [{id: 0, mood: 'calm', intensity: 0.2, energy: 0.3, brightness: 0.7, musicPrompt: 'Soft strings'}]};
const scoredPayload = {candidates: [{content: {parts: [{text: JSON.stringify(score)}]}}]};
const analyzeOptions = {key, onDiagnostic: () => {}, wait: async () => {}};

test('analyze uses low thinking for Gemini 3 and compatible config for 2.5', async () => {
  for (const model of ['gemini-3.8-flash', 'gemini-2.5-flash']) {
    const result = await analyze(chunks, {...analyzeOptions, model, fetcher: async (url, options) => {
      const config = JSON.parse(options.body).generationConfig;
      assert.deepEqual(config.thinkingConfig, model.startsWith('gemini-3') ? {thinkingLevel: 'low'} : undefined);
      assert.equal(config.responseMimeType, 'application/json');
      return response(200, scoredPayload);
    }});
    assert.equal(result.sections[0].text, passage);
  }
});

for (const [payload, code] of [
  [{promptFeedback: {blockReason: 'SAFETY'}}, 'GEMINI_CONTENT_BLOCKED'],
  [{candidates: [{finishReason: 'SAFETY'}]}, 'GEMINI_CONTENT_BLOCKED'],
  [{candidates: [{finishReason: 'MAX_TOKENS'}]}, 'GEMINI_OUTPUT_LIMIT']
]) {
  test(`analyze classifies ${code} without retrying`, async () => {
    let calls = 0;
    await assert.rejects(analyze(chunks, {...analyzeOptions, fetcher: async () => { calls++; return response(200, payload); }}), {code});
    assert.equal(calls, 1);
  });
}

test('null or missing score payloads fail with a Gemini message instead of a TypeError', async () => {
  for (const payload of [null, {}]) {
    await assert.rejects(analyze(chunks, {...analyzeOptions, fetcher: async () => response(200, payload)}), error => {
      assert.match(error.message, /^Gemini/);
      assert.notEqual(error.name, 'TypeError');
      return true;
    });
  }
});

test('scan availability fallback preserves original paragraphs and schema across models', async () => {
  const requests = [], events = [];
  const result = await analyze(chunks, {...analyzeOptions, cleanPage:true,
    model:'gemini-2.5-flash', fallbackModel:'gemini-3.5-flash-lite',
    onDiagnostic:event => events.push(event),
    fetcher:async (url, options) => {
      requests.push({url, body:JSON.parse(options.body)});
      return requests.length === 1 ? response(503) : response(200, {
        candidates:[{content:{parts:[{text:JSON.stringify({...score, sections:score.sections.map(s => ({...s, keepParagraphIds:[0]}))})}]}}]
      });
    }
  });
  assert.equal(result.sections[0].text, passage);
  assert.match(requests[0].url, /gemini-2\.5-flash:generateContent$/);
  assert.match(requests[1].url, /gemini-3\.5-flash-lite:generateContent$/);
  assert.equal(requests[0].body.generationConfig.thinkingConfig, undefined);
  assert.deepEqual(requests[1].body.generationConfig.thinkingConfig, {thinkingLevel:'low'});
  assert.deepEqual(requests[0].body.contents, requests[1].body.contents);
  assert.deepEqual(requests[0].body.generationConfig.responseJsonSchema, requests[1].body.generationConfig.responseJsonSchema);
  assert.equal(events.find(e => e.event === 'model_fallback').nextModel, 'gemini-3.5-flash-lite');
  assert.equal(events.at(-1).model, 'gemini-3.5-flash-lite');
});

test('fallback shares the three-attempt budget and does not bounce between models', async () => {
  const urls = [];
  const h = harness(async url => { urls.push(url); return response(503); }, {fallbackModel:'gemini-3.5-flash-lite'});
  await assert.rejects(h.run(), {code:'GEMINI_UNAVAILABLE',upstreamStatus:503});
  assert.equal(urls.length,3);
  assert.notEqual(urls[0],urls[1]);
  assert.equal(urls[1],urls[2]);
  assert.equal(h.events.filter(e => e.event === 'model_fallback').length,1);
});

for (const status of [401,403,404,429,505]) {
  test(`fallback never changes model for HTTP ${status}`, async () => {
    const urls = [];
    const h = harness(async url => { urls.push(url); return response(status); }, {fallbackModel:'gemini-3.5-flash-lite'});
    await assert.rejects(h.run());
    assert.equal(new Set(urls).size,1);
    assert.equal(h.events.some(e => e.event === 'model_fallback'),false);
  });
}

test('empty fallback setting keeps retries on the configured model', async () => {
  const urls=[];
  await assert.rejects(analyze(chunks,{...analyzeOptions,model:'gemini-3.8-flash',fallbackModel:'',fetcher:async url=>{urls.push(url);return response(503);}}));
  assert.equal(urls.length,3);
  assert.equal(new Set(urls).size,1);
});

test('fallback does not reset the deadline or ignore a long Retry-After', async () => {
  const h=harness(async()=>response(503,{}, {'retry-after':'120'}),{fallbackModel:'gemini-3.5-flash-lite'});
  await assert.rejects(h.run(),{code:'GEMINI_UNAVAILABLE'});
  assert.equal(h.waits.length,0);
  assert.equal(h.events.some(e=>e.event==='model_fallback'),false);
});
