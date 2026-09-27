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
    text: (blocks.join('\n\n') || parsed?.textContent || document.querySelector('main')?.innerText || document.body.innerText).slice(0, 100000),
    url: location.href
  };
}

export async function launchReader({mode, tabId}, api = chrome, createId = () => crypto.randomUUID()) {
  if (mode !== 'paste' && mode !== 'scan') throw new Error('Unknown reader action.');
  if (mode === 'paste') {
    // Pasting has no reason to inspect the current page or read the clipboard.
    await api.tabs.create({url: api.runtime.getURL('reader/index.html?mode=paste')});
    return;
  }

  let article = {title: '', text: '', author: '', url: ''};
  try {
    if (!Number.isInteger(tabId)) throw new Error('No source tab.');
    const tab = await api.tabs.get(tabId);
    const url = new URL(tab.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.hostname === 'chromewebstore.google.com' || (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore'))) {
      throw new Error('Restricted page.');
    }
    await api.scripting.executeScript({target: {tabId}, files: ['vendor/Readability.js']});
    const [{result} = {}] = await api.scripting.executeScript({target: {tabId}, func: extractArticle});
    if (!result || typeof result.text !== 'string' || result.text.trim().length < 80) {
      throw new Error('No readable text.');
    }
    article = result;
  } catch {
    article.error = 'This page could not be scanned. Paste the text below instead.';
  }

  const id = createId();
  await api.storage.session.set({[id]: article});
  try {
    await api.tabs.create({url: api.runtime.getURL(`reader/index.html?mode=scan&article=${id}`)});
  } catch (error) {
    await api.storage.session.remove(id);
    throw error;
  }
}
