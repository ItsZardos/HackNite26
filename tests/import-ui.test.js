import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {encodeDocument,readTransferredDocument} from '../extension/document-transfer.js';
import {MAX_FILE_BYTES} from '../extension/document-file.js';
import {makePdf} from './helpers/pdf-fixture.js';
import {makeDocx} from './helpers/docx-fixture.js';
import {extractPdf} from '../server/pdf.js';
import {extractDocx} from '../server/docx.js';
const file=(name,bytes)=>({name,size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});

test('popup import offers a native PDF/DOCX input directly inside the menu',async()=>{
 const dom=new JSDOM(await readFile(new URL('../extension/popup.html',import.meta.url),'utf8'));
 const input=dom.window.document.querySelector('#import-form input[type=file]');
 assert.ok(input);assert.equal(input.hidden,false);assert.equal(input.style.display,'');
 assert.match(input.accept,/\.pdf/);assert.match(input.accept,/\.docx/);
 assert.equal(dom.window.document.querySelector('label[for="document-file"]').htmlFor,input.id);
 assert.equal(input.closest('form').id,'import-form');dom.window.close();
});
for(const extension of ['pdf','docx'])test(extension+' survives Chrome JSON messaging and local extraction without byte corruption',async()=>{
 const bytes=extension==='pdf'?makePdf():await makeDocx();
 const message=JSON.parse(JSON.stringify(await encodeDocument(file('Reading.'+extension,bytes))));
 let calls=0;
 const result=await readTransferredDocument(message,async(url,options)=>{
  calls++;assert.equal(url,`http://127.0.0.1:8787/api/${extension}-text`);
  assert.deepEqual(Buffer.from(options.body),bytes);
  return Response.json(await (extension==='pdf'?extractPdf:extractDocx)(new Uint8Array(options.body)));
 });
 assert.equal(calls,1);assert.match(result.text,/harbor/);assert.equal(result.title,'Reading.'+extension);
});
test('transfer validates size, format, read failures and malformed messages before extraction',async()=>{
 let fetches=0;const fetcher=async()=>{fetches++;};
 await assert.rejects(encodeDocument(file('old.doc',Buffer.from('test'))),{code:'FILE_UNSUPPORTED'});
 await assert.rejects(encodeDocument({name:'big.pdf',size:MAX_FILE_BYTES+1}),{code:'FILE_TOO_LARGE'});
 await assert.rejects(encodeDocument({name:'missing.pdf',size:10,arrayBuffer:async()=>{throw new Error('private path');}}),error=>error.code==='FILE_READ_FAILED'&&!error.message.includes('private path'));
 for(const payload of [{name:'bad.pdf'},{name:'bad.pdf',base64:'%%%'}])await assert.rejects(readTransferredDocument(payload,fetcher),{code:'FILE_INVALID'});
 await assert.rejects(readTransferredDocument({name:'big.pdf',base64:'A'.repeat(4*Math.ceil(MAX_FILE_BYTES/3)+4)},fetcher),{code:'FILE_TOO_LARGE'});
 assert.equal(fetches,0);
});
