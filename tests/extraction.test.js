import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {extractArticle, launchReader} from '../extension/reader-launch.js';

const readability = await readFile(new URL('../extension/vendor/Readability.js', import.meta.url), 'utf8');
const paragraph = 'Neighbors restored the old library garden after the storm. They repaired the benches, planted new trees and invited everyone to read beside the river. It was a hopeful afternoon for a community that had spent months planning the work.';
const article = `<article><h1>A new beginning</h1>${Array.from({length: 5}, (_, i) => `<p>Part ${i + 1}. ${paragraph}</p>`).join('')}<blockquote>A place for everyone.</blockquote><ul><li>Read together</li><li>Grow together</li></ul></article>`;
function fixture(html = article, {parser = true, strict = false} = {}) {
  const dom = new JSDOM(`<!doctype html><html><head><title>Library garden</title><style>.secret {display:none}</style></head><body>${html}</body></html>`, {url: 'https://example.org/story?private=token', runScripts: 'outside-only'});
  const logs = [];
  dom.window.console = {info: (...args) => logs.push(args), error: (...args) => logs.push(args), log: () => {}};
  const descriptor = Object.getOwnPropertyDescriptor(dom.window.Element.prototype, 'innerHTML');
  if (strict) Object.defineProperty(dom.window.Element.prototype, 'innerHTML', {...descriptor, set() {throw new TypeError('TrustedHTML required');}});
  if (parser) vm.runInContext(readability, dom.getInternalVMContext());
  return {dom, logs, run: () => vm.runInContext(`(${extractArticle.toString()})()`, dom.getInternalVMContext()), close: () => {
    Object.defineProperty(dom.window.Element.prototype, 'innerHTML', descriptor);
    dom.window.close();
  }};
}

test('serialized extractor runs with the real bundled Readability and leaves the document intact', () => {
  const f = fixture();
  try {
    const author = f.dom.window.document.createElement('meta');
    author.name = 'author'; author.content = 'A Writer';
    f.dom.window.document.head.append(author);
    const before = f.dom.serialize(), result = f.run();
    assert.equal(result.error, undefined);
    assert.equal(result.diagnostics.method, 'readability');
    assert.equal(result.author, 'A Writer');
    assert.match(result.text, /Part 1/); assert.match(result.text, /Part 5/);
    assert.match(result.text, /A place for everyone/); assert.match(result.text, /Grow together/);
    assert.equal(f.dom.serialize(), before);
    const logs = JSON.stringify(f.logs);
    assert.doesNotMatch(logs, /private=token|Neighbors restored|Library garden/);
  } finally {f.close();}
});

test('HTML assignment restrictions no longer crash the extractor', () => {
  const f = fixture(article, {strict: true});
  try { const result = f.run(); assert.equal(result.error, undefined); assert.match(result.text, /Part 5/); }
  finally {f.close();}
});

for (const parser of ['missing', 'throws', 'null']) {
  test(`DOM fallback extracts an article when Readability ${parser}`, () => {
    const f = fixture(`<nav>Home Subscribe</nav>${article}`, {parser: false});
    try {
      if (parser === 'throws') vm.runInContext('function Readability(){throw new Error("Parser failed")}', f.dom.getInternalVMContext());
      if (parser === 'null') vm.runInContext('function Readability(){this.parse=()=>null}', f.dom.getInternalVMContext());
      const result = f.run();
      assert.equal(result.error, undefined); assert.equal(result.diagnostics.method, 'article');
      assert.match(result.text, /Part 5/); assert.doesNotMatch(result.text, /Home Subscribe/);
      assert.ok(result.diagnostics.warnings.includes('USED_DOM_FALLBACK'));
    } finally {f.close();}
  });
}

test('fallback supports main/body text, headings, Unicode and text outside paragraphs', () => {
  for (const container of ['main', 'div']) {
    const f = fixture(`<${container}><h2>海 🙂</h2>${paragraph}<div>Second section: ${paragraph}</div></${container}>`, {parser: false});
    try { const result = f.run(); assert.equal(result.error, undefined); assert.match(result.text, /海 🙂/); assert.match(result.text, /Second section/); }
    finally {f.close();}
  }
});

test('hidden, editable and script content is not sent for analysis', () => {
  const secret = 'DO_NOT_SEND_PRIVATE_CONTENT';
  const f = fixture(`<main>${article}<p hidden>${secret}</p><section class="secret"><p>${secret}</p></section><textarea>${secret}</textarea><div contenteditable="true">${secret}</div><script>${secret}</script></main>`, {parser: false});
  try {const result = f.run(); assert.match(result.text, /Part 5/); assert.doesNotMatch(result.text, new RegExp(secret));}
  finally {f.close();}
});

test('empty/loading/PDF documents return distinct diagnostic codes', () => {
  for (const [type, code] of [['empty','SCAN_NO_TEXT'], ['loading','SCAN_PAGE_LOADING'], ['pdf','SCAN_IMPORT_REQUIRED']]) {
    const f = fixture('<div>No text</div>');
    try {
      if (type === 'loading') f.dom.window.document.body.remove();
      if (type === 'pdf') Object.defineProperty(f.dom.window.document, 'contentType', {value: 'application/pdf'});
      assert.equal(f.run().error.code, code);
    } finally {f.close();}
  }
});

test('oversized DOM text fails explicitly instead of silently dropping the ending', () => {
  const f = fixture(`<main>${paragraph.repeat(1000)}</main>`, {parser: false});
  try {const result = f.run(); assert.equal(result.error?.code, 'SCAN_TEXT_TOO_LONG'); assert.equal(result.text, undefined);}
  finally {f.close();}
});

for (const parserLoads of [true, false]) {
  test(`scan executes actual injected functions before scoring (Readability loaded: ${parserLoads})`, async () => {
    const f = fixture(article, {parser: false, strict: true});
    const stored = {}, calls = [];
    const api = {
      tabs: {get: async () => ({id: 42}), create: async tab => calls.push(['open', tab.url])}, // URL deliberately unavailable.
      runtime: {getURL: path => `chrome-extension://test/${path}`},
      scripting: {executeScript: async request => {
        assert.equal(request.world, 'ISOLATED');
        if (request.files) {
          if (!parserLoads) throw new Error('Could not load file');
          vm.runInContext(readability, f.dom.getInternalVMContext());
          return [{frameId: 0, documentId: 'document-one'}];
        }
        if (parserLoads) assert.deepEqual(request.target.documentIds, ['document-one']);
        return [{frameId: 0, result: vm.runInContext(`(${request.func.toString()})()`, f.dom.getInternalVMContext())}];
      }},
      storage: {session: {set: async data => Object.assign(stored, data), get: async () => stored, remove: async () => {}}}
    };
    try {
      await launchReader({mode: 'scan', tabId: 42}, api, () => 'one', async (url, options) => {
        const request = JSON.parse(options.body);
        assert.equal(request.scan, true); assert.match(request.text, /Part 5/);
        calls.push(['score']);
        return {ok: true, json: async () => ({source: 'gemini', sections: [{id: 0, text: request.text, mood: 'calm'}]})};
      });
      assert.deepEqual(calls.map(call => call[0]), ['score', 'open']);
      assert.equal(stored['undertone-article-one'].score.source, 'gemini');
    } finally {f.close();}
  });
}

test('embedded PDF is identified before webpage furniture can be scored',()=>{
 const f=fixture('<header>Download Print Share</header><embed type="application/pdf" src="/files/report.pdf">');
 try{const result=f.run();assert.equal(result.error.code,'SCAN_IMPORT_REQUIRED');assert.equal(result.text,undefined);}
 finally{f.close();}
});

for (const parser of [true, false]) test(`large scan preserves all text when only formatting exceeds the limit (parser: ${parser})`, () => {
 const text='A'.repeat(99998),f=fixture(`<article><p>${text}</p></article>`,{parser});
 try { const result=f.run();assert.equal(result.error,undefined);assert.equal(result.text,text); }
 finally {f.close();}
});
