import {readPdfUrl} from './pdf.js';
// Runs in the page's isolated extension world, after Readability is injected.
export function extractArticle() {
  // Chrome serializes this function: all extraction helpers must live inside it.
  const warnings = [];
  const fail = (code, message) => {
    console.error('[Undertone]', {stage: 'extract', code});
    return {error: {code, message}, diagnostics: {warnings}};
  };
  if (document.contentType === 'application/pdf') return fail('SCAN_PDF_UNSUPPORTED', 'The PDF viewer cannot be scanned. Choose Paste text and add the PDF text.');
  const embeddedPdf=document.querySelector('embed[type="application/pdf"],object[type="application/pdf"]');
  if(embeddedPdf) return {error:{code:'SCAN_PDF_DOCUMENT',message:'Open the original PDF or choose Open PDF file in Undertone.'},pdfUrl:embeddedPdf.getAttribute('src')||embeddedPdf.getAttribute('data')};
  if (!document.body) return fail('SCAN_PAGE_LOADING', 'This page has not finished loading. Wait for its text to appear, then click Scan page again.');
  try {
    const snapshot = document.cloneNode(true);
    // Exclude scripts, hidden content and editable fields without changing the page.
    const original = document.querySelectorAll('*');
    const cloned = snapshot.querySelectorAll('*');
    for (let i = 0; i < original.length; i++) {
      const node = original[i];
      // Keep inert head metadata for Readability's title/author detection.
      if (node === document.documentElement || node.closest('head')) continue;
      const style = getComputedStyle(node);
      if (node.matches('script,style,noscript,template,input,textarea,select,button,[hidden],[aria-hidden="true"],[contenteditable]:not([contenteditable="false"])') || style.display === 'none' || style.visibility === 'hidden') cloned[i]?.remove();
    }
    function plainText(root) {
      const parts = [];
      let length = 0;
      const blocks = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|BR|DIV|H[1-6]|HEADER|HR|LI|MAIN|P|PRE|SECTION|TR)$/;
      const stack = [root];
      while (stack.length && length < 100000) {
        const node = stack.pop();
        if (node === null) { parts.push('\n\n'); length += 2; continue; }
        if (node.nodeType === 3) {
          const text = node.textContent.slice(0, 100000 - length);
          parts.push(text); length += text.length;
        } else if (node.nodeType === 1 || node.nodeType === 9) {
          if (blocks.test(node.nodeName)) { parts.push('\n\n'); length += 2; stack.push(null); }
          stack.push(...Array.from(node.childNodes).reverse());
        }
      }
      return parts.join('').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 100000);
    }
    let parsed, text = '', method = 'readability';
    if (typeof Readability === 'function') {
      try {
        // Keep the DOM result; reassigning parsed HTML can be rejected by a page's
        // Trusted Types policy. A parser failure must not disable the fallback.
        parsed = new Readability(snapshot.cloneNode(true), {serializer: node => node, charThreshold: 80, maxElemsToParse: 50000}).parse();
        if (parsed?.content?.nodeType) text = plainText(parsed.content);
      } catch { warnings.push('READABILITY_PARSE_FAILED'); }
    } else warnings.push('READABILITY_UNAVAILABLE');
    if (text.length < 80) {
      const candidates = [
        ...Array.from(snapshot.querySelectorAll('article')).map(root => ({root, method: 'article'})),
        ...Array.from(snapshot.querySelectorAll('main,[role="main"]')).map(root => ({root, method: 'main'}))
      ].map(candidate => ({...candidate, text: plainText(candidate.root)})).sort((a, b) => b.text.length - a.text.length);
      const best = candidates.find(candidate => candidate.text.length >= 80);
      method = best?.method || 'body';
      text = best?.text || plainText(snapshot.body);
      warnings.push('USED_DOM_FALLBACK');
    }
    if (text.length < 80) return fail('SCAN_NO_TEXT', 'Fewer than 80 readable characters were found. Wait for the article to load, or choose Paste text. Image, canvas and embedded-viewer text may not be accessible.');
    const diagnostics = {method, characters: text.length, warnings};
    console.info('[Undertone]', {stage: 'extract', code: 'SCAN_TEXT_READY', ...diagnostics});
    return {title: parsed?.title || document.title, author: parsed?.byline || '', text, diagnostics};
  } catch (error) {
    return fail('SCAN_EXTRACTION_FAILED', 'The page text extractor failed. Reload this page and the Undertone extension, then retry. Open Error details to share the diagnostic code.');
  }
}

const failure = (code, stage, message) => Object.assign(new Error(message), {code, stage});
function injectionFailure(error) {
  const message = error?.message || '';
  if (/cannot access|missing host permission|not allowed|permission|extensions gallery/i.test(message)) return failure('SCAN_ACCESS_DENIED', 'extract', 'Chrome denied access to this tab. Open a regular article, refresh it, then click the pinned Undertone icon and Scan page. Choose Paste text for protected pages.');
  if (/no tab|no frame|no document|frame.*removed|tab.*closed|document.*unloaded/i.test(message)) return failure('SCAN_PAGE_CHANGED', 'extract', 'The tab closed or navigated during the scan. Wait for the article to finish loading and scan again.');
  return failure('SCAN_SCRIPT_FAILED', 'extract', 'Chrome could not run the page extractor. Reload Undertone in chrome://extensions, refresh the article, and retry.');
}

async function readPage(tabId, api, trace, fetcher) {
  if (!Number.isInteger(tabId) || tabId < 0) throw failure('SCAN_NO_TAB', 'tab', 'No active article tab was found. Open an article and click the pinned Undertone icon. Choose Paste text to enter text manually.');
  let tab;
  try { tab = await api.tabs.get(tabId); }
  catch { throw failure('SCAN_TAB_CLOSED', 'tab', 'The source tab is no longer available. Open the article and scan again, or choose Paste text.'); }
  // URL is optional in Chrome's Tab object. Its absence is not proof that
  // injection is forbidden; let executeScript check the actual activeTab grant.
  if (tab.url) {
    let url;
    try { url = new URL(tab.url); }
    catch { throw failure('SCAN_INVALID_TAB', 'tab', 'Chrome did not provide a valid page address. Refresh the article and reopen Undertone.'); }
    if (url.protocol === 'file:' && /\.pdf$/i.test(url.pathname)) {
      if (!await api.extension.isAllowedFileSchemeAccess()) throw failure('PDF_FILE_ACCESS_REQUIRED', 'pdf', 'Enable Allow access to file URLs in chrome://extensions → Undertone → Details, then retry. Or choose Open PDF file in this popup.');
      trace('pdf', 'PDF_DOWNLOAD_STARTED');
      return readPdfUrl(tab.url, fetcher);
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.hostname === 'chromewebstore.google.com' || (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore'))) {
      throw failure('SCAN_RESTRICTED_PAGE', 'tab', 'Chrome settings, new-tab pages, extension pages, local files and the Chrome Web Store cannot be scanned. Open a normal website article first. Choose Paste text for this content.');
    }
    if (/\.pdf$/i.test(url.pathname)) { trace('pdf', 'PDF_DOWNLOAD_STARTED'); return readPdfUrl(tab.url, fetcher); }
  }
  trace('tab', 'SCAN_TAB_READY');
  let documentId;
  try {
    const injected = await api.scripting.executeScript({target: {tabId}, world: 'ISOLATED', files: ['vendor/Readability.js']});
    documentId = injected?.find(frame => frame.frameId === 0)?.documentId;
    trace('readability', 'READABILITY_LOADED');
  } catch {
    // A missing/failed parser must not prevent extracting ordinary DOM text.
    trace('readability', 'READABILITY_LOAD_FAILED');
  }
  let frames;
  try { frames = await api.scripting.executeScript({target: documentId ? {tabId, documentIds: [documentId]} : {tabId}, world: 'ISOLATED', func: extractArticle}); }
  catch (error) {
    // Chrome's built-in PDF viewer blocks DOM injection. Fetch the active
    // document with the temporary activeTab grant and inspect its MIME type.
    if(tab.url && injectionFailure(error).code !== 'SCAN_PAGE_CHANGED'){const pdf=await readPdfUrl(tab.url,fetcher,{probe:true});if(pdf){trace('pdf','PDF_TEXT_READY',{characters:pdf.text.length});return pdf;}}
    throw injectionFailure(error);
  }
  const frame = frames?.find(frame => frame.frameId === 0) || frames?.[0];
  const result = frame?.result;
  if (!result) throw failure('SCAN_NO_RESULT', 'extract', 'Chrome returned no extraction result. The page may have navigated or blocked scripts. Refresh it and scan again.');
  if (result.error?.code === 'SCAN_PDF_UNSUPPORTED' && tab.url) return readPdfUrl(tab.url,fetcher);
  if (result.error?.code === 'SCAN_PDF_DOCUMENT' && tab.url) {
    const embedded=new URL(result.pdfUrl||tab.url,tab.url);
    if(embedded.origin===new URL(tab.url).origin && ['https:','http:'].includes(embedded.protocol)) {
      const pdf=await readPdfUrl(embedded.href,fetcher,{probe:true});if(pdf)return pdf;
    }
    throw failure('PDF_OPEN_ORIGINAL','pdf','Open or download the original PDF from this viewer, then choose Scan page or Open PDF file in Undertone.');
  }
  if(result.error?.code==='SCAN_NO_TEXT'&&tab.url){const pdf=await readPdfUrl(tab.url,fetcher,{probe:true});if(pdf)return pdf;}
  if (result.error) throw failure(result.error.code, 'extract', result.error.message);
  if (typeof result.text !== 'string' || result.text.trim().length < 80) throw failure('SCAN_NO_TEXT', 'extract', 'The page did not contain 80 readable characters. Wait for it to load or choose Paste text.');
  trace('extract', 'SCAN_TEXT_READY', {characters: result.text.length, method: result.diagnostics?.method, warnings: result.diagnostics?.warnings});
  return result;
}

async function prepareScore(article, scan, api, fetcher) {
  // Keep the worker active while the server streams whitespace, then the score.
  const keepAlive = typeof api.runtime.getPlatformInfo === 'function' ? setInterval(() => {
    Promise.resolve().then(() => api.runtime.getPlatformInfo()).catch(() => {});
  }, 20000) : null;
  try {
    let response;
    try {
      response = await fetcher('http://127.0.0.1:8787/api/analyze', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(scan ? {text: article.text, scan: true, stream: true} : {text: article.text, stream: true}),
        signal: AbortSignal.timeout(65000)
      });
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') throw failure('SERVER_TIMEOUT', 'score', 'Preparing the reader timed out. Please try again.');
      throw failure('SERVER_UNREACHABLE', 'score', 'Start Undertone with npm start, then try again. The local server could not be reached.');
    }
    let score;
    try { score = await response.json(); }
    catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') throw failure('SERVER_TIMEOUT', 'score', 'Preparing the reader timed out. Please try again.');
      throw failure('SERVER_INVALID_RESPONSE', 'score', 'The server returned an unreadable response. Restart Undertone and try again.');
    }
    if (!response.ok || score?.error) throw Object.assign(failure(/^GEMINI_[A-Z_]+$/.test(score?.code) ? score.code : 'SERVER_ANALYSIS_FAILED', 'score', typeof score?.error === 'string' ? score.error : 'Could not prepare this text. Please try again.'), {httpStatus: response.status, upstreamStatus: score?.upstreamStatus});
    if (!Array.isArray(score?.sections) || !score.sections.length || score.sections.some(section => !section || typeof section.text !== 'string')) {
      throw failure('SERVER_INCOMPLETE_SCORE', 'score', 'The score is incomplete. Please try again.');
    }
    return score;
  } finally {
    if (keepAlive !== null) clearInterval(keepAlive);
  }
}

async function pruneReaders(api) {
  const records = await api.storage.session.get(null);
  const readers = Object.entries(records)
    .filter(([id, value]) => id.startsWith('undertone-article-') && value?.score)
    .sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));
  if (readers.length > 10) await api.storage.session.remove(readers.slice(0, readers.length - 10).map(([id]) => id));
}

export async function launchReader({mode, tabId, text, title}, api = chrome, createId = () => crypto.randomUUID(), fetcher = fetch) {
  const events = [];
  let stage = 'input';
  const trace = (nextStage, code, details = {}) => {
    stage = nextStage;
    const event = {stage, code};
    if (Number.isInteger(details.characters)) event.characters = details.characters;
    if (['readability','article','main','body'].includes(details.method)) event.method = details.method;
    if (Array.isArray(details.warnings)) event.warnings = details.warnings.filter(value => ['READABILITY_PARSE_FAILED','READABILITY_UNAVAILABLE','USED_DOM_FALLBACK'].includes(value));
    events.push(event);
    console.info('[Undertone]', event);
  };
  try {
    if (!['paste','scan','pdf'].includes(mode)) throw failure('INPUT_MODE_INVALID', 'input', 'Unknown reader action.');
    const article = mode === 'scan' ? await readPage(tabId, api, trace, fetcher) : {text: typeof text === 'string' ? text.trim() : '', title: title || 'Reading selection', author: ''};
    if (article.text.length < 80) throw failure('INPUT_TOO_SHORT', 'input', 'Please provide at least 80 characters of reading text.');
    if (article.text.length > 100000) throw failure('INPUT_TOO_LONG', 'input', 'Please use an article under 100,000 characters.');
    trace('score', 'SCORING_STARTED', {characters: article.text.length});
    const score = await prepareScore(article, mode === 'scan' && article.kind !== 'pdf', api, fetcher);
    trace('store', 'SCORE_READY');
    const id = `undertone-article-${createId()}`;
    await api.storage.session.set({[id]: {score, title: article.title, author: article.author, createdAt: Date.now()}});
    try {
      await pruneReaders(api);
      trace('open', 'READER_OPENING');
      await api.tabs.create({url: api.runtime.getURL(`reader/index.html?article=${encodeURIComponent(id)}`)});
    } catch (error) {
      await api.storage.session.remove(id);
      throw error;
    }
  } catch (error) {
    const known = /^(SCAN|INPUT|SERVER|GEMINI|PDF)_[A-Z_]+$/.test(error?.code);
    const safe = known ? error : failure(stage === 'store' ? 'READER_STORAGE_FAILED' : 'READER_OPEN_FAILED', stage, 'Chrome could not save or open the reader. Reload Undertone in chrome://extensions and try again.');
    safe.diagnostic = {code: safe.code, stage: safe.stage || stage, mode: ['scan','pdf'].includes(mode) ? mode : 'paste', events};
    for (const field of ['httpStatus','upstreamStatus']) if (Number.isInteger(safe[field]) && safe[field] >= 100 && safe[field] <= 599) safe.diagnostic[field] = safe[field];
    throw safe;
  }
}
