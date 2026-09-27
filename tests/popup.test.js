import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const code=(await readFile(new URL('../extension/popup.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
const html=await readFile(new URL('../extension/popup.html',import.meta.url),'utf8');
const readingText='The sea lay still beneath the lighthouse. '.repeat(12);
const tick=()=>new Promise(r=>setImmediate(r));
async function popup({saved={},send=async()=>({ok:true}),encodeDocument=async file=>({name:file.name,base64:'JVBERi0='}),health={ready:true}}={}){
 const dom=new JSDOM(html,{url:'https://undertone.test/popup.html',runScripts:'outside-only'}),w=dom.window;
 const messages=[],listeners=[],logs=[],clipboard=[];let closed=0,queries=0;
 const storage={get:async key=>key?{[key]:saved[key]}:{...saved},set:async data=>{
  const changes=Object.fromEntries(Object.entries(data).map(([key,value])=>[key,{oldValue:saved[key],newValue:value}]));
  Object.assign(saved,data);for(const listener of listeners)listener(changes,'session');
 }};
 Object.assign(w,{encodeDocument,AbortSignal,fetch:async()=>{if(health instanceof Error)throw health;return Response.json(health);},
 chrome:{storage:{session:storage,onChanged:{addListener:fn=>listeners.push(fn)}},tabs:{query:async()=>{queries++;return[{id:42}];}},runtime:{getManifest:()=>({version:'1.7.2'}),sendMessage:async request=>{
  if(request.type==='get-job')return {ok:true,job:saved['undertone-job']};messages.push(JSON.parse(JSON.stringify(request)));return send(request,storage);
 }}}});
 w.console.error=(...args)=>logs.push(args);w.close=()=>closed++;
 Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async value=>clipboard.push(value)}});
 w.eval(code);await tick();
 const $=id=>w.document.getElementById(id);
 return {w,$,messages,saved,storage,logs,clipboard,get closed(){return closed;},get queries(){return queries;},
 file(name){Object.defineProperty($('document-file'),'files',{configurable:true,value:[{name}]});},
 submit:id=>$(id).onsubmit({preventDefault(){}}),dispose(){dom.window.document.body.replaceChildren();}};
}
test('menu expands paste/import locally, Back keeps text and labels stay short',async()=>{
 const h=await popup();h.$('paste').click();assert.equal(h.$('paste-form').hidden,false);h.$('text').value=readingText;h.$('back').click();
 assert.equal(h.$('choices').hidden,false);assert.equal(h.$('text').value,readingText);
 h.$('import-file').click();assert.equal(h.$('import-form').hidden,false);assert.equal(h.queries,0);assert.equal(h.messages.length,0);
 assert.equal(h.$('import-file').querySelector('small').textContent,'PDF or DOCX');assert.equal(h.$('read-file').textContent,'Review text');h.dispose();
});
test('paste sends finalized text and scan captures only the current tab',async()=>{
 const h=await popup();h.$('paste').click();h.$('text').value=' '+readingText+' ';
 await h.submit('paste-form');assert.deepEqual(h.messages,[{type:'open-reader',mode:'paste',text:readingText.trim()}]);assert.equal(h.queries,0);assert.equal(h.closed,1);
 const scan=await popup();await scan.$('scan').onclick();assert.equal(scan.queries,1);assert.deepEqual(scan.messages,[{type:'open-reader',mode:'scan',tabId:42}]);h.dispose();scan.dispose();
});
test('short text and absent files cannot start work',async()=>{
 const h=await popup();h.$('text').value='short';await h.submit('paste-form');assert.match(h.$('status').textContent,/80/);
 await h.submit('import-form');assert.match(h.$('status').textContent,/PDF or DOCX/);assert.equal(h.messages.length,0);h.dispose();
});
test('pending work prevents duplicate requests and navigation',async()=>{
 let finish;const h=await popup({send:()=>new Promise(r=>finish=r)});h.$('paste').click();h.$('text').value=readingText;
 const pending=h.submit('paste-form');await tick();await h.submit('paste-form');await h.$('scan').onclick();h.$('back').click();
 assert.equal(h.messages.length,1);assert.equal(h.$('paste-form').hidden,false);assert.equal(h.$('text').disabled,true);assert.equal(h.closed,0);
 finish({ok:true});await pending;assert.equal(h.closed,1);h.dispose();
});
test('draft text and view survive reopening without being sent to Gemini',async()=>{
 const saved={},h=await popup({saved});h.$('paste').click();h.$('text').value=readingText;h.$('text').dispatchEvent(new h.w.Event('input'));await tick();
 const reopened=await popup({saved});assert.equal(reopened.$('text').value,readingText);assert.equal(reopened.$('paste-form').hidden,false);assert.equal(reopened.messages.length,0);h.dispose();reopened.dispose();
});
test('reopened popup follows a running job and restores controls on failure',async()=>{
 const job={id:'job',action:'open-reader',mode:'scan',status:'running'},h=await popup({saved:{'undertone-job':job}});
 assert.equal(h.$('scan').disabled,true);assert.match(h.$('status').textContent,/soundtrack/);
 await h.storage.set({'undertone-job':{...job,status:'error',result:{error:'Try again.',diagnostic:{code:'GEMINI_UNAVAILABLE'}}}});await tick();
 assert.equal(h.$('scan').disabled,false);assert.equal(h.$('status').textContent,'Try again.');assert.equal(h.closed,0);h.dispose();
});
test('file extraction opens an editable preview without opening a reader',async()=>{
 const h=await popup({send:async(request,storage)=>{
  assert.equal(request.type,'prepare-import');await storage.set({'undertone-draft':{view:'review',importText:readingText,importTitle:'Story.pdf'}});return{ok:true,preview:true};
 }});h.$('import-file').click();h.file('Story.pdf');await h.submit('import-form');
 assert.equal(h.$('review-form').hidden,false);assert.equal(h.$('review-text').value,readingText);assert.equal(h.closed,0);assert.equal(h.messages.length,1);h.dispose();
});
test('edited imported text is finalized explicitly and keeps its document title',async()=>{
 const h=await popup({saved:{'undertone-draft':{view:'review',importText:readingText,importTitle:'Story.pdf'}}});
 h.$('review-text').value=readingText+' Edited ending.';await h.submit('review-form');
 assert.deepEqual(h.messages,[{type:'open-reader',mode:'import',title:'Story.pdf',text:readingText+' Edited ending.'}]);assert.equal(h.closed,1);h.dispose();
});
test('background import completion restores its preview after the popup reopens',async()=>{
 const job={id:'import',action:'prepare-import',mode:'import',status:'running'},h=await popup({saved:{'undertone-job':job}});
 await h.storage.set({'undertone-draft':{view:'review',importText:readingText,importTitle:'Reading.docx'}});
 await h.storage.set({'undertone-job':{...job,status:'done',result:{ok:true,preview:true}}});await tick();
 assert.equal(h.$('review-form').hidden,false);assert.equal(h.$('review-text').value,readingText);assert.equal(h.closed,0);h.dispose();
});
test('errors keep the draft and provide a copyable diagnostic without private text',async()=>{
 const diagnostic={code:'SCAN_ACCESS_DENIED',stage:'extract'},h=await popup({send:async()=>({ok:false,error:'Chrome denied access.',diagnostic})});
 h.$('text').value=readingText;await h.$('scan').onclick();assert.equal(h.$('scan').disabled,false);assert.equal(h.$('text').value,readingText);
 assert.equal(h.$('status').textContent,'Chrome denied access.');await h.$('copy-debug').onclick();assert.deepEqual(JSON.parse(h.clipboard[0]),diagnostic);assert.doesNotMatch(h.clipboard[0],/lighthouse/);h.dispose();
});
test('runtime and file transfer errors restore controls',async()=>{
 for(const options of [{send:async()=>{throw new Error('Connection closed.');}},{encodeDocument:async()=>{throw Object.assign(new Error('File exceeds 20 MB.'),{code:'FILE_TOO_LARGE'});}}]){
  const h=await popup(options);h.file('private.pdf');await h.submit('import-form');assert.equal(h.$('read-file').disabled,false);assert.equal(h.closed,0);assert.equal(h.$('debug').hidden,false);h.dispose();
 }
});
test('local readiness distinguishes offline, missing key and mismatched versions',async()=>{
 for(const [health,expected]of [[new Error(),/npm start/],[{ready:false},/Gemini key/],[{ready:true,version:'1.0.0'},/Restart/]]){
  const h=await popup({health});assert.match(h.$('connection').textContent,expected);assert.equal(h.messages.length,0);h.dispose();
 }
});

test('interrupted work is explained when reopening, without disabling retry',async()=>{
 const h=await popup({saved:{'undertone-job':{id:'old',status:'error',mode:'paste',result:{error:'Preparation was interrupted. Please try again.',diagnostic:{code:'JOB_INTERRUPTED'}}}}});
 assert.match(h.$('status').textContent,/interrupted/);assert.equal(h.$('paste').disabled,false);h.dispose();
});
