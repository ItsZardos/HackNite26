// Runs in the page's isolated extension world, after Readability is injected.
export function extractArticle() {
  let parsed;
  try { parsed = new Readability(document.cloneNode(true)).parse(); } catch {}
  const box = document.createElement('div');
  if (parsed?.content) box.innerHTML = parsed.content;
  const blocks = [...box.querySelectorAll('p,h2,h3,blockquote,pre,li')]
    .filter(el => !el.parentElement.closest('blockquote,li'))
    .map(el => el.textContent.trim()).filter(Boolean);
  return {
    title: parsed?.title || document.title,
    author: parsed?.byline || '',
    text: (blocks.join('\n\n') || parsed?.textContent || document.querySelector('main')?.innerText || document.body.innerText).slice(0, 100000)
  };
}

async function readPage(tabId, api) {
  try {
    if (!Number.isInteger(tabId)) throw new Error('No source tab.');
    const tab = await api.tabs.get(tabId);
    const url = new URL(tab.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.hostname === 'chromewebstore.google.com' || (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore'))) {
      throw new Error('Restricted page.');
    }
    await api.scripting.executeScript({target: {tabId}, files: ['vendor/Readability.js']});
    const [{result} = {}] = await api.scripting.executeScript({target: {tabId}, func: extractArticle});
    if (!result || typeof result.text !== 'string' || result.text.trim().length < 80) throw new Error('No readable text.');
    return result;
  } catch {
    throw new Error('This page could not be scanned. Choose Paste text and add the article instead.');
  }
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
      if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new Error('Preparing the reader timed out. Please try again.');
      throw new Error('Start Undertone with npm start, then try again. The local server could not be reached.');
    }
    let score;
    try { score = await response.json(); }
    catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new Error('Preparing the reader timed out. Please try again.');
      throw new Error('The server returned an unreadable response. Restart Undertone and try again.');
    }
    if (!response.ok || score?.error) throw new Error(typeof score?.error === 'string' ? score.error : 'Could not prepare this text. Please try again.');
    if (!Array.isArray(score?.sections) || !score.sections.length || score.sections.some(section => !section || typeof section.text !== 'string')) {
      throw new Error('The score is incomplete. Please try again.');
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
  if (mode !== 'paste' && mode !== 'scan') throw new Error('Unknown reader action.');
  const article = mode === 'scan' ? await readPage(tabId, api) : {text: typeof text === 'string' ? text.trim() : '', title: title || 'Reading selection', author: ''};
  if (article.text.length < 80) throw new Error('Please provide at least 80 characters of reading text.');
  if (article.text.length > 100000) throw new Error('Please use an article under 100,000 characters.');
  const score = await prepareScore(article, mode === 'scan', api, fetcher);
  const id = `undertone-article-${createId()}`;
  await api.storage.session.set({[id]: {score, title: article.title, author: article.author, createdAt: Date.now()}});
  try {
    await pruneReaders(api);
    await api.tabs.create({url: api.runtime.getURL(`reader/index.html?article=${encodeURIComponent(id)}`)});
  } catch (error) {
    await api.storage.session.remove(id);
    throw error;
  }
}
