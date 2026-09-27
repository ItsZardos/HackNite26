import test from 'node:test';
import assert from 'node:assert/strict';
import {extractPdf,MAX_PDF_BYTES} from '../server/pdf.js';
import {readPdfUrl,readPdfBytes} from '../extension/pdf.js';
import {makePdf} from './helpers/pdf-fixture.js';

test('real PDF parser extracts lines and page count in a worker',async()=>{
 const result=await extractPdf(makePdf());
 assert.equal(result.pages,1);
 assert.match(result.text,/quiet harbor/);
 assert.match(result.text,/home\.\nMorning/);
});
test('invalid, empty-text, oversized and cancelled PDFs fail specifically',async()=>{
 await assert.rejects(extractPdf(Buffer.from('not pdf')),{code:'PDF_INVALID'});
 await assert.rejects(extractPdf(makePdf([])),{code:'PDF_NO_TEXT'});
 await assert.rejects(extractPdf(Buffer.alloc(MAX_PDF_BYTES+1)),{code:'PDF_TOO_LARGE'});
 const controller=new AbortController();controller.abort();
 await assert.rejects(extractPdf(makePdf(),{signal:controller.signal}),{name:'AbortError'});
 await assert.rejects(extractPdf(makePdf(),{timeoutMs:1}),{code:'PDF_TIMEOUT'});
});
test('hosted PDF download posts binary locally; no URL is sent to the backend',async()=>{
 const calls=[];
 const result=await readPdfUrl('https://example.org/download?id=1',async(url,options)=>{
  calls.push({url,options});
  if(calls.length===1)return new Response(makePdf(),{headers:{'content-type':'application/pdf'}});
  return Response.json(await extractPdf(options.body));
 },{probe:true});
 assert.match(result.text,/quiet harbor/);
 assert.equal(calls[0].options.credentials,'include');
 assert.equal(calls[1].url,'http://127.0.0.1:8787/api/pdf-text');
 assert.equal(calls[1].options.headers['Content-Type'],'application/pdf');
 assert.ok(calls[1].options.body instanceof Uint8Array);
});
test('local PDF uses file URL; non-PDF probes and HTTP failures never reach parser',async()=>{
 const urls=[];
 await readPdfUrl('file:///tmp/story.pdf',async(url,options)=>{
  urls.push(url);
  return urls.length===1?new Response(makePdf()):Response.json(await extractPdf(options.body));
 });
 assert.equal(urls.length,2);
 assert.equal(await readPdfUrl('https://example.org/article',async()=>new Response('<html>page</html>',{headers:{'content-type':'text/html'}}),{probe:true}),null);
 await assert.rejects(readPdfUrl('https://example.org/private.pdf',async()=>new Response('',{status:403})),{code:'PDF_DOWNLOAD_FAILED'});
});
test('streaming download enforces size cap without trusting Content-Length',async()=>{
 let cancelled=false;
 const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(MAX_PDF_BYTES+1));},cancel(){cancelled=true;}});
 await assert.rejects(readPdfUrl('https://example.org/large.pdf',async()=>new Response(body)),{code:'PDF_TOO_LARGE'});
 assert.equal(cancelled,true);
});
test('PDF upload errors and interrupted downloads remain actionable',async()=>{
 await assert.rejects(readPdfBytes(makePdf(),async()=>Response.json({code:'PDF_PASSWORD_REQUIRED',error:'PDF is password protected.'},{status:422})),{code:'PDF_PASSWORD_REQUIRED'});
 await assert.rejects(readPdfBytes(makePdf(),async()=>{throw new TypeError();}),{code:'SERVER_UNREACHABLE'});
 const body=new ReadableStream({start(c){c.error(new TypeError('private download URL'));}});
 await assert.rejects(readPdfUrl('https://example.org/doc.pdf',async()=>new Response(body)),error=>error.code==='PDF_DOWNLOAD_FAILED'&&!error.message.includes('private download URL'));
});

test('PDF page limits and cancellation stop parsing before a partial result is returned',async()=>{
 const manyPages=makePdf(undefined,201);
 await assert.rejects(extractPdf(Buffer.from(manyPages)),{code:'PDF_TOO_MANY_PAGES'});
 const controller=new AbortController();
 const pending=extractPdf(makePdf(),{signal:controller.signal});
 controller.abort();
 await assert.rejects(pending,{name:'AbortError'});
});
test('extensionless PDFs served as binary data are sniffed; unrelated binary is ignored',async()=>{
 let calls=0;
 const result=await readPdfUrl('https://example.org/download',async(url,options)=>++calls===1
  ?new Response(makePdf(),{headers:{'content-type':'application/octet-stream'}})
  :Response.json(await extractPdf(options.body)),{probe:true});
 assert.equal(result.pages,1);
 assert.equal(await readPdfUrl('https://example.org/download',async()=>new Response(new Uint8Array(2048),{headers:{'content-type':'application/octet-stream'}}),{probe:true}),null);
});
