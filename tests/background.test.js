import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=(await readFile(new URL('../extension/background.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
const sender={id:'test',url:'chrome-extension://test/popup.html'};
const tick=()=>new Promise(r=>setImmediate(r));
function worker({launchReader=async()=>{},readTransferredDocument=async()=>({text:'Reading '.repeat(20),title:'Story.pdf'}),saved={},get}={}){
 let handler;
 vm.runInNewContext(code,{launchReader,readTransferredDocument,crypto,console,setInterval,clearInterval,
 chrome:{storage:{session:{get:async key=>get?get(key,saved):({[key]:saved[key]}),set:async data=>Object.assign(saved,data),remove:async key=>{delete saved[key];}}},runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,getManifest:()=>({version:'1.7.2'}),getPlatformInfo:async()=>({}),onMessage:{addListener:fn=>handler=fn}}}});
 return{saved,handler,send:request=>new Promise(resolve=>handler(request,sender,resolve))};
}
test('worker only accepts its own popup and validates actions',async()=>{
 let calls=0;const h=worker({launchReader:async()=>calls++});
 assert.equal(h.handler({type:'open-reader',mode:'paste'},{...sender,url:'https://example.org'},()=>{}),undefined);
 assert.equal((await h.send({type:'open-reader',mode:'unknown'})).ok,false);assert.equal(calls,0);
});
test('reopened popups join the same job instead of starting duplicate Gemini requests',async()=>{
 let finish,calls=0;const h=worker({launchReader:()=>{calls++;return new Promise(r=>finish=r);}});
 const pending=h.send({type:'open-reader',mode:'paste',text:'Private reading'});await tick();
 const duplicate=await h.send({type:'open-reader',mode:'scan',tabId:1});assert.equal(duplicate.pending,true);assert.equal(calls,1);
 const state=await h.send({type:'get-job'});assert.equal(state.job.status,'running');assert.doesNotMatch(JSON.stringify(state),/Private reading/);
 finish();assert.equal((await pending).ok,true);assert.equal(h.saved['undertone-job'].status,'done');
});
test('worker persists an editable import without scoring or opening a reader',async()=>{
 let calls=0;const h=worker({launchReader:async()=>calls++,saved:{'undertone-draft':{pasteText:'Unrelated draft'}}});
 const result=await h.send({type:'prepare-import',mode:'import',file:{}});
 assert.equal(result.preview,true);assert.equal(calls,0);assert.equal(h.saved['undertone-draft'].view,'review');assert.equal(h.saved['undertone-draft'].pasteText,'Unrelated draft');
});
test('successful reading clears only its submitted draft, leaving the other input intact',async()=>{
 const h=worker({saved:{'undertone-draft':{pasteText:'My text',importText:'Other document'}}});
 await h.send({type:'open-reader',mode:'paste',text:'My text'});
 assert.equal(h.saved['undertone-draft'].pasteText,'');assert.equal(h.saved['undertone-draft'].importText,'Other document');
});
test('job errors retain actionable diagnostics and a subsequent success clears them',async()=>{
 const saved={},h=worker({saved,launchReader:async()=>{throw Object.assign(new Error('Try again.'),{diagnostic:{code:'GEMINI_UNAVAILABLE',stage:'score'}});}});
 const response=await h.send({type:'open-reader',mode:'scan'});assert.equal(response.ok,false);assert.equal(saved['undertone-last-error'].diagnostic.code,'GEMINI_UNAVAILABLE');assert.equal(saved['undertone-job'].status,'error');
 await worker({saved}).send({type:'open-reader',mode:'scan'});assert.equal(saved['undertone-last-error'],undefined);
});
test('a worker restart marks an abandoned job interrupted instead of locking the menu forever',async()=>{
 const h=worker({saved:{'undertone-job':{id:'old',mode:'paste',status:'running'}}});
 const result=await h.send({type:'get-job'});assert.equal(result.job.status,'error');assert.equal(result.job.result.diagnostic.code,'JOB_INTERRUPTED');
 assert.equal((await h.send({type:'open-reader',mode:'paste'})).ok,true);
});

test('a delayed status read cannot mark a newly started job interrupted',async()=>{
 let releaseRead,finish;const h=worker({get:key=>new Promise(r=>{releaseRead=()=>r({[key]:{id:'old',mode:'scan',status:'running'}});}),launchReader:()=>new Promise(r=>finish=r)});
 const status=h.send({type:'get-job'}),pending=h.send({type:'open-reader',mode:'scan'});await tick();
 releaseRead();const result=await status;assert.equal(result.job.status,'running');assert.notEqual(result.job.id,'old');
 finish();await pending;
});
