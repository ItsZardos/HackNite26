import test from 'node:test';
import assert from 'node:assert/strict';
import {extractDocx} from '../server/docx.js';
import {readDocument} from '../extension/document-file.js';
import {makeDocx} from './helpers/docx-fixture.js';
import {makePdf} from './helpers/pdf-fixture.js';
import {extractPdf} from '../server/pdf.js';
const file=(name,bytes)=>({name,size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});

test('real DOCX extraction preserves paragraphs and Unicode as plain text',async()=>{
 const result=await extractDocx(await makeDocx());
 assert.match(result.text,/quiet harbor/);assert.match(result.text,/\n\nSecond paragraph: 海/);
 assert.doesNotMatch(result.text,/<w:/);
});
test('DOCX input and output limits, cancellation and invalid ZIPs have safe errors',async()=>{
 await assert.rejects(extractDocx(Buffer.from('PKgarbage')),{code:'DOCX_INVALID'});
 await assert.rejects(extractDocx(await makeDocx('')),{code:'DOCX_NO_TEXT'});
 await assert.rejects(extractDocx(await makeDocx('x'.repeat(100001))),{code:'DOCX_TEXT_TOO_LONG'});
 const c=new AbortController(),pending=extractDocx(await makeDocx(),{signal:c.signal});c.abort();await assert.rejects(pending,{name:'AbortError'});
});
for(const extension of ['pdf','docx'])test('file import sends '+extension+' bytes only to local extraction then returns text',async()=>{
 const bytes=extension==='pdf'?makePdf():await makeDocx();let calls=0;
 const result=await readDocument(file('Reading.'+extension,bytes),async(url,options)=>{
  calls++;assert.equal(url,`http://127.0.0.1:8787/api/${extension}-text`);
  return Response.json(await (extension==='pdf'?extractPdf:extractDocx)(new Uint8Array(options.body)));
 });
 assert.equal(calls,1);assert.equal(result.title,'Reading.'+extension);assert.match(result.text,/harbor/);
});
test('unsupported and oversized files never reach server; DOCX errors remain specific',async()=>{
 const fetcher=async()=>{throw new Error('must not fetch');};
 await assert.rejects(readDocument(file('old.doc',Buffer.from('test')),fetcher),{code:'FILE_UNSUPPORTED'});
 await assert.rejects(readDocument({name:'big.docx',size:21*1024*1024},fetcher),{code:'FILE_TOO_LARGE'});
 await assert.rejects(readDocument(file('fake.docx',Buffer.from('not zip')),fetcher),{code:'DOCX_INVALID'});
 await assert.rejects(readDocument(file('broken.docx',Buffer.from('PKtest')),async()=>Response.json({code:'DOCX_INVALID',error:'DOCX could not be read.'},{status:422})),{code:'DOCX_INVALID'});
});

test('automatic local file reads enforce the stream size limit and keep paths out of errors',async()=>{
 const {readLocalDocument}=await import('../extension/document-file.js');
 const api={extension:{isAllowedFileSchemeAccess:async()=>true}};let cancelled=false;
 const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(21*1024*1024));},cancel(){cancelled=true;}});
 await assert.rejects(readLocalDocument('file:///private/story.docx',api,async()=>new Response(stream)),{code:'FILE_TOO_LARGE'});
 assert.equal(cancelled,true);
 await assert.rejects(readLocalDocument('file:///private/story.docx',api,async()=>{throw new Error('private path');}),error=>error.code==='FILE_READ_FAILED'&&!error.message.includes('private path'));
});
