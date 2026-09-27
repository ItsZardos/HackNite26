import test from 'node:test';
import assert from 'node:assert/strict';
import {extractPdf,MAX_PDF_BYTES} from '../server/pdf.js';
import {readPdfBytes} from '../extension/pdf.js';
import {makePdf,positionedPdf} from './helpers/pdf-fixture.js';

test('real PDF parser extracts lines and page count in a worker',async()=>{
 const result=await extractPdf(makePdf());
 assert.equal(result.pages,1);
 assert.match(result.text,/quiet harbor/);
 assert.match(result.text,/home\. Morning/);
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

test('real multi-page PDF removes running margins and reconnects interrupted prose',async()=>{
 const page1=[
  {text:'1',x:300,y:20,size:10},{text:'Running document title',y:765,size:10},
  {text:'across the long journey toward a distant harbor',y:660},
  {text:'The traveler carried a story she hoped to share',y:692},
  {text:'with the people she met along the way and',y:676}
 ];
 const page2=[
  {text:'2',x:300,y:20,size:10},{text:'Running document title',y:765,size:10},
  {text:'where she could finally find her friends again.',y:692}
 ];
 const result=await extractPdf(positionedPdf([page1,page2]));
 assert.equal(result.text,'The traveler carried a story she hoped to share with the people she met along the way and across the long journey toward a distant harbor where she could finally find her friends again.');
});
test('real PDF with interleaved columns reads complete left column before right column',async()=>{
 const lines=[];
 for(let i=0;i<4;i++){
  lines.push({text:`Right column line ${i} carries its own story.`,x:330,y:690-i*14,size:10});
  lines.push({text:`Left column line ${i} carries its own story.`,x:45,y:690-i*14,size:10});
 }
 const result=await extractPdf(positionedPdf([lines]));
 assert.ok(result.text.indexOf('Left column line 3')<result.text.indexOf('Right column line 0'));
 assert.ok(result.text.startsWith('Left column line 0'));
});
