import {setTimeout as delay} from 'node:timers/promises';

const transientStatuses = new Set([408, 500, 502, 503, 504]);
const failure = (message, code, status = 502, extra = {}) => Object.assign(new Error(message), {code, status, ...extra});
const timedOut = () => failure('Gemini took too long to prepare this article. Try a shorter passage or retry in a moment.', 'GEMINI_TIMEOUT', 504);

function retryAfter(response, details) {
  const header = response.headers?.get?.('retry-after');
  let seconds = header == null ? NaN : Number(header);
  if (header && !Number.isFinite(seconds)) seconds = (Date.parse(header) - Date.now()) / 1000;
  for (const detail of details) {
    if (detail?.['@type']?.endsWith('/google.rpc.RetryInfo') && /^\d+(?:\.\d+)?s$/.test(detail.retryDelay)) {
      seconds = Math.max(Number.isFinite(seconds) ? seconds : 0, parseFloat(detail.retryDelay));
    }
  }
  return Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : undefined;
}

function httpFailure(response, data) {
  const status = response.status;
  const error = data?.error || {};
  const details = Array.isArray(error.details) ? error.details : [];
  // Inspect provider details for classification only. Never echo raw messages,
  // which can contain keys, project identifiers, or supplied article text.
  const reasons = details.map(detail => typeof detail?.reason === 'string' ? detail.reason : '');
  const message = typeof error.message === 'string' ? error.message : '';
  if (status === 401 || reasons.some(reason => /API_KEY_(INVALID|EXPIRED)/.test(reason)) || /API key not valid|API key expired/i.test(message)) {
    return failure('Gemini rejected the API key. Update GEMINI_API_KEY in your local .env and restart npm start.', 'GEMINI_KEY_INVALID', 503);
  }
  if (status === 403) return failure('Gemini denied access. Check the local API key, its API restrictions, and access to the configured model in Google AI Studio.', 'GEMINI_ACCESS_DENIED', 503);
  if (status === 404) return failure('Gemini could not find the configured model. Check GEMINI_MODEL in your local .env and restart npm start.', 'GEMINI_MODEL_UNAVAILABLE', 503);
  if (status === 505) return failure('Gemini or a network proxy returned HTTP 505 (HTTP version not supported). Check your proxy or try another network; this is not a page-extraction error.', 'GEMINI_HTTP_VERSION_UNSUPPORTED');
  if (status === 402 || error.status === 'FAILED_PRECONDITION') {
    return failure('Gemini requires an account or billing change. Check the project in Google AI Studio before retrying.', 'GEMINI_ACCOUNT_REQUIRED', 503);
  }
  if (status === 429) {
    const quotaIds = details.flatMap(detail => Array.isArray(detail?.violations) ? detail.violations : [])
      .map(violation => `${violation?.quotaId || ''} ${violation?.quotaMetric || ''}`).join(' ');
    const exhausted = /per.?day|daily/i.test(quotaIds) || /limit:\s*0\b|\bdaily\b|per[ _-]?day|(?:credits|balance).{0,30}(?:depleted|exhausted)|spend.{0,30}limit/i.test(message);
    const retryAfterSeconds = retryAfter(response, details);
    return failure(exhausted
      ? 'Gemini quota is exhausted for this project. Check quota and billing in Google AI Studio; repeated retries will not fix this limit.'
      : 'Gemini is rate limited. Your teammates share the limit when using the same project key. Wait a moment and retry.',
    exhausted ? 'GEMINI_QUOTA_EXHAUSTED' : 'GEMINI_RATE_LIMITED', 429,
    {retryable: !exhausted, ...(retryAfterSeconds === undefined ? {} : {retryAfterSeconds})});
  }
  if (transientStatuses.has(status)) return failure(
    'Gemini is temporarily unavailable. Automatic retries did not complete; please try again in a moment.',
    'GEMINI_UNAVAILABLE', 503, {retryable: true, retryAfterSeconds: retryAfter(response, details)});
  return failure('Gemini rejected the scoring request. Check the server model setting and pull the latest Undertone update.', 'GEMINI_REQUEST_REJECTED');
}

// One deadline covers all attempts and backoff, staying inside the popup's 65s
// request limit. Retry only transient failures; never substitute an invented score.
export async function requestGemini(body, {
  key, model, fallbackModel = '', bodyForModel = () => body,
  fetcher = fetch, signal, timeoutMs = 60000, attemptTimeoutMs = 30000,
  wait = (ms, signal) => delay(ms, undefined, {signal}),
  onDiagnostic = event => console.warn('[Gemini]', JSON.stringify(event))
}) {
  const started = Date.now();
  const diagnose = event => { try { onDiagnostic(event); } catch {} };
  const deadline = AbortSignal.timeout(timeoutMs);
  const totalSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let activeModel = model;
  for (let attempt = 1; attempt <= 3; attempt++) {
    signal?.throwIfAborted();
    if (deadline.aborted) throw timedOut();
    const attemptSignal = AbortSignal.any([totalSignal, AbortSignal.timeout(attemptTimeoutMs)]);
    let response;
    try {
      response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModel)}:generateContent`, {
        method: 'POST', headers: {'Content-Type': 'application/json', 'x-goog-api-key': key},
        signal: attemptSignal, body: JSON.stringify(bodyForModel(activeModel))
      });
      let data;
      try { data = await response.json(); }
      catch (error) {
        if (attemptSignal.aborted || error instanceof TypeError && response.ok) throw error;
        if (response.ok) throw failure('Gemini returned an unreadable score. Please try again.', 'GEMINI_INVALID_RESPONSE');
      }
      if (!response.ok) throw Object.assign(httpFailure(response, data), {upstreamStatus: response.status});
      attemptSignal.throwIfAborted();
      if (!data || typeof data !== 'object') throw failure('Gemini returned an unreadable score. Please try again.', 'GEMINI_INVALID_RESPONSE');
      if (attempt > 1) diagnose({event: 'recovered', attempt, model: activeModel, elapsedMs: Date.now() - started});
      return data;
    } catch (cause) {
      signal?.throwIfAborted();
      if (deadline.aborted) throw timedOut();
      const error = cause.code?.startsWith?.('GEMINI_') ? cause : attemptSignal.aborted
        ? Object.assign(timedOut(), {retryable: true})
        : failure('Gemini could not be reached. Check your internet connection and try again.', 'GEMINI_NETWORK', 502, {retryable: true});
      const backoff = error.retryAfterSeconds === undefined ? 1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250) : error.retryAfterSeconds * 1000;
      const remaining = timeoutMs - (Date.now() - started);
      const retry = Boolean(error.retryable && attempt < 3 && backoff + 1000 < remaining);
      diagnose({event: 'request_failed', attempt, model: activeModel, httpStatus: response?.status, code: error.code, retry, elapsedMs: Date.now() - started});
      if (!retry) throw error;
      // Change models only for an upstream availability error. Never route
      // around quota, account, access, content, or local network failures.
      if (error.code === 'GEMINI_UNAVAILABLE' && fallbackModel && activeModel !== fallbackModel) {
        diagnose({event: 'model_fallback', attempt, model: activeModel, nextModel: fallbackModel});
        activeModel = fallbackModel;
      }
      try { await wait(backoff, totalSignal); }
      catch { signal?.throwIfAborted(); throw timedOut(); }
    }
  }
}
