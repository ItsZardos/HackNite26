import {fileURLToPath} from 'node:url';
import {parentPort, workerData} from 'node:worker_threads';
import {getDocument, VerbosityLevel} from 'pdfjs-dist/legacy/build/pdf.mjs';

let task;
try {
  // Load packaged font/CMap data only. PDF bytes never supply an external URL.
  const assets = new URL('./node_modules/pdfjs-dist/', new URL('../', import.meta.url));
  task = getDocument({data:new Uint8Array(workerData), isEvalSupported:false,
    useWasm:false, useSystemFonts:true, disableFontFace:true, verbosity:VerbosityLevel.ERRORS,
    cMapUrl:fileURLToPath(new URL('cmaps/', assets)).replace(/\\/g,'/'), cMapPacked:true,
    standardFontDataUrl:fileURLToPath(new URL('standard_fonts/', assets)).replace(/\\/g,'/')});
  const pdf = await task.promise;
  if (pdf.numPages > 200) throw Object.assign(new Error(), {code:'PDF_TOO_MANY_PAGES'});
  const pages = [];
  let length = 0;
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    const lines = [];
    let line = '', lastY;
    for (const item of content.items) {
      if (typeof item.str !== 'string') continue;
      const y = item.transform?.[5];
      if (line && lastY !== undefined && y !== undefined && Math.abs(y-lastY)>2) { lines.push(line); line=''; }
      line += (line && !/\s$/.test(line) && !/^\s/.test(item.str) ? ' ' : '') + item.str;
      lastY = y;
      if (item.hasEOL) { lines.push(line); line=''; lastY=undefined; }
    }
    if (line) lines.push(line);
    const text=lines.join('\n').trim();
    length+=text.length+(pages.length?2:0);
    if(length>100000) throw Object.assign(new Error(),{code:'PDF_TEXT_TOO_LONG'});
    pages.push(text);
    page.cleanup();
  }
  const text=pages.join('\n\n').trim();
  if(text.length<80) throw Object.assign(new Error(),{code:'PDF_NO_TEXT'});
  const metadata=await pdf.getMetadata().catch(()=>null);
  parentPort.postMessage({text,title:typeof metadata?.info?.Title==='string'?metadata.info.Title.slice(0,300):'',pages:pdf.numPages});
} catch(error) {
  parentPort.postMessage({code:error.name==='PasswordException'?'PDF_PASSWORD_REQUIRED':error.code?.startsWith('PDF_')?error.code:'PDF_INVALID'});
} finally { await task?.destroy(); }
