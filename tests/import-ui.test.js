import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const script=(await readFile(new URL('../extension/import.js',import.meta.url),'utf8')).replace(/^import .*;\n/,'');
const text='The harbor lay quiet beneath the morning sky. '.repeat(5);
function harness({readDocument=async()=>({text,title:'Story.docx'}),send=async()=>({ok:true})}={}){
 const elements=Object.fromEntries(['import-form','document-file','read-file','status','debug','debug-report'].map(id=>[id,{disabled:false,hidden:false,files:[],addEventListener:(event,fn)=>{elements[id][event]=fn;},focus:()=>{}}]));
 let closed=0;const messages=[],saved=[];
 vm.runInNewContext(script,{document:{getElementById:id=>elements[id]},readDocument,
  chrome:{runtime:{getManifest:()=>({version:'1.3.1'}),sendMessage:async message=>{messages.push(message);return send(message);}},storage:{session:{set:async data=>saved.push(data)}}},
  console:{error:()=>{}},window:{close:()=>closed++}});
 return {elements,messages,saved,get closed(){return closed;},submit:()=>elements['import-form'].submit({preventDefault(){}})};
}
test('import window has a visible native file input for PDF and DOCX',async()=>{
 const dom=new JSDOM(await readFile(new URL('../extension/import.html',import.meta.url),'utf8'));
 const input=dom.window.document.querySelector('input[type=file]');
 assert.ok(input);assert.equal(input.hidden,false);assert.equal(input.style.display,'');
 assert.match(input.accept,/\.pdf/);assert.match(input.accept,/\.docx/);
 assert.equal(dom.window.document.querySelector('label').htmlFor,input.id);dom.window.close();
});
test('import keeps its window alive until extraction and reader handoff complete',async()=>{
 let finish;const h=harness({readDocument:()=>new Promise(resolve=>{finish=resolve;})});
 h.elements['document-file'].files=[{name:'Story.docx'}];const pending=h.submit();
 await h.submit();assert.equal(h.messages.length,0);assert.equal(h.closed,0);
 assert.equal(h.elements['read-file'].disabled,true);
 finish({text,title:'Story.docx'});await pending;
 assert.equal(h.messages.length,1);assert.equal(h.messages[0].mode,'import');assert.equal(h.closed,1);
});
test('cancel/no selection and extraction errors cannot create a reader',async()=>{
 const h=harness({readDocument:async()=>{throw Object.assign(new Error('DOCX is invalid.'),{code:'DOCX_INVALID'});}});
 await h.submit();assert.match(h.elements.status.textContent,/Choose a PDF or DOCX/);
 h.elements['document-file'].files=[{name:'private.docx'}];await h.submit();
 assert.equal(h.closed,0);assert.equal(h.messages.length,0);assert.equal(h.elements['read-file'].disabled,false);
 assert.match(h.elements.status.textContent,/DOCX_INVALID/);
 assert.doesNotMatch(JSON.stringify(h.saved),/private.docx/);
});
