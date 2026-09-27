import test from 'node:test';
import assert from 'node:assert/strict';
import {extractPdf,MAX_PDF_BYTES} from '../server/pdf.js';
import {readPdfBytes} from '../extension/pdf.js';
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
test('PDF page limits and cancellation stop parsing before a partial result is returned',async()=>{
 const manyPages=makePdf(undefined,201);
 await assert.rejects(extractPdf(Buffer.from(manyPages)),{code:'PDF_TOO_MANY_PAGES'});
 const controller=new AbortController();
 const pending=extractPdf(makePdf(),{signal:controller.signal});
 controller.abort();
 await assert.rejects(pending,{name:'AbortError'});
});
