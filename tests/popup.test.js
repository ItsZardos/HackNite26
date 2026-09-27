import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const popupCode=await readFile(new URL('../extension/popup.js',import.meta.url),'utf8');
const readingText='The sea lay still beneath the lighthouse. '.repeat(12);
function popupHarness({query=async()=>[{id:42}],send=async()=>({ok:true}),saved={}}={}){
  const elements=Object.fromEntries(['paste','scan','status','choices','paste-form','text','back','open-reader','debug','debug-report','copy-debug'].map(id=>[id,{
    disabled:false,hidden:['status','paste-form'].includes(id),textContent:'',value:'',focused:false,
    addEventListener(event,callback){this[event]=callback;},
    setAttribute(name,value){this[name]=value;},
    focus(){this.focused=true;}
  }]));
  const messages=[],logs=[],clipboard=[];let closed=0,queries=0;
  vm.runInNewContext(popupCode,{
    document:{getElementById:id=>elements[id]},
    chrome:{storage:{session:{get:async()=>saved}},tabs:{query:async args=>{queries++;return query(args);}},runtime:{getManifest:()=>({version:'1.2.3'}),sendMessage:async msg=>{messages.push({...msg});return send(msg);}}},
    console:{error:(...args)=>logs.push(args)}, navigator:{clipboard:{writeText:async text=>clipboard.push(text)}},
    window:{close:()=>closed++}
  });
  return {elements,messages,logs,clipboard,get closed(){return closed;},get queries(){return queries;},
    submit:()=>elements['paste-form'].submit({preventDefault(){}})
  };
}

test('Paste expands the popup form without reading the tab, sending text, or opening a reader',async()=>{
  const h=popupHarness();await h.elements.paste.click();
  assert.equal(h.elements.choices.hidden,true);
  assert.equal(h.elements['paste-form'].hidden,false);
  assert.equal(h.elements.text.focused,true);
  assert.equal(h.queries,0);assert.equal(h.messages.length,0);assert.equal(h.closed,0);
});
test('Back returns to the two choices and keeps the unfinished pasted text',async()=>{
  const h=popupHarness();h.elements.paste.click();h.elements.text.value=readingText;h.elements.back.click();
  assert.equal(h.elements.choices.hidden,false);
  assert.equal(h.elements['paste-form'].hidden,true);
  assert.equal(h.elements.text.value,readingText);
  assert.equal(h.messages.length,0);
});
test('Open reader sends finalized pasted text without querying the current tab',async()=>{
  const h=popupHarness();h.elements.paste.click();h.elements.text.value='  '+readingText+'  ';
  await h.submit();
  assert.equal(h.queries,0);
  assert.deepEqual(h.messages,[{type:'open-reader',mode:'paste',text:readingText.trim()}]);
  assert.equal(h.closed,1);
});
test('short paste is rejected in the popup before transmission',async()=>{
  const h=popupHarness();h.elements.paste.click();h.elements.text.value='Too short';await h.submit();
  assert.equal(h.messages.length,0);assert.equal(h.closed,0);
  assert.match(h.elements.status.textContent,/80 characters/);
});
test('Scan captures the originating tab ID before handing off',async()=>{
  const h=popupHarness();await h.elements.scan.click();
  assert.equal(h.queries,1);assert.equal(h.messages[0].tabId,42);
  assert.equal(h.messages[0].type,'open-reader');assert.equal(h.messages[0].mode,'scan');
  assert.equal(h.closed,1);
});
test('pending preparation keeps the popup open and prevents duplicate submissions',async()=>{
  let finish;const h=popupHarness({send:()=>new Promise(resolve=>{finish=resolve;})});
  h.elements.paste.click();h.elements.text.value=readingText;
  const first=h.submit();await h.submit();await h.elements.scan.click();h.elements.back.click();
  assert.equal(h.elements.paste.disabled,true);assert.equal(h.elements.scan.disabled,true);
  assert.equal(h.elements.text.disabled,true);assert.equal(h.elements['open-reader'].disabled,true);
  assert.equal(h.messages.length,1);assert.equal(h.closed,0);assert.equal(h.elements.choices.hidden,true);
  finish({ok:true});await first;assert.equal(h.closed,1);
});
test('preparation error remains visible in popup and preserves text for retry',async()=>{
  const h=popupHarness({send:async()=>({ok:false,error:'Set GEMINI_API_KEY in .env, then restart Undertone.'})});
  h.elements.paste.click();h.elements.text.value=readingText;await h.submit();
  assert.equal(h.closed,0);assert.equal(h.elements.paste.disabled,false);assert.equal(h.elements.scan.disabled,false);
  assert.equal(h.elements.text.disabled,false);assert.equal(h.elements.text.value,readingText);
  assert.match(h.elements.status.textContent,/GEMINI_API_KEY/);assert.equal(h.elements.status.hidden,false);
});
test('runtime error also restores popup controls',async()=>{
  const h=popupHarness({send:async()=>{throw new Error('Connection was closed. Please try again.');}});
  h.elements.text.value=readingText;await h.submit();
  assert.equal(h.closed,0);assert.equal(h.elements['open-reader'].disabled,false);
  assert.match(h.elements.status.textContent,/Please try again/);
});
test('popup displays, logs and copies a specific failure report without pasted text',async()=>{
  const diagnostic={code:'SCAN_ACCESS_DENIED',stage:'extract',mode:'scan',version:'1.2.3',events:[{stage:'tab',code:'SCAN_TAB_READY'}]};
  const h=popupHarness({send:async()=>({ok:false,error:'Chrome denied access. Refresh the article.',diagnostic})});
  h.elements.text.value=readingText;
  await h.elements.scan.click();
  assert.match(h.elements.status.textContent,/SCAN_ACCESS_DENIED/);
  assert.equal(h.elements.debug.hidden,false);
  assert.deepEqual(JSON.parse(h.elements['debug-report'].textContent),diagnostic);
  await h.elements['copy-debug'].click();
  assert.equal(h.clipboard.length,1);
  assert.deepEqual(JSON.parse(h.clipboard[0]),diagnostic);
  assert.doesNotMatch(h.clipboard[0],/lighthouse/);
  assert.equal(h.logs[0][0],'[Undertone]');
});
test('last failure remains inspectable after reopening the popup',async()=>{
  const diagnostic={code:'GEMINI_HTTP_VERSION_UNSUPPORTED',upstreamStatus:505,stage:'score',version:'1.2.3'};
  const h=popupHarness({saved:{'undertone-last-error':{diagnostic}}});
  await Promise.resolve();
  assert.equal(h.elements.debug.hidden,false);
  assert.deepEqual(JSON.parse(h.elements['debug-report'].textContent),diagnostic);
});
async function workerHarness(launchReader,saved={}){
  const code=(await readFile(new URL('../extension/background.js',import.meta.url),'utf8')).replace("import {launchReader} from './reader-launch.js';",'');
  let handler;
  vm.runInNewContext(code,{
    chrome:{storage:{session:{set:async data=>Object.assign(saved,data),remove:async id=>{delete saved[id];}}},runtime:{id:'test',getManifest:()=>({version:'1.2.3'}),getURL:path=>'chrome-extension://test/'+path,onMessage:{addListener:fn=>{handler=fn;}}}},
    launchReader
  });
  return handler;
}
test('worker accepts only its popup and keeps its asynchronous reply alive',async()=>{
  let finish,launched=0;
  const handler=await workerHarness(()=>{launched++;return new Promise(resolve=>{finish=resolve;});});
  const request={type:'open-reader',mode:'paste',text:readingText},sender={id:'test',url:'chrome-extension://test/popup.html'};
  assert.equal(handler(request,{...sender,url:'https://example.org'},()=>{}),undefined);assert.equal(launched,0);
  const response=new Promise(resolve=>{assert.equal(handler(request,sender,resolve),true);});
  assert.equal(launched,1);finish();assert.equal((await response).ok,true);
});
test('worker returns actionable launch errors to its popup',async()=>{
  const handler=await workerHarness(async()=>{throw new Error('Start Undertone with npm start.');});
  const response=await new Promise(resolve=>handler({type:'open-reader',mode:'scan'},{id:'test',url:'chrome-extension://test/popup.html'},resolve));
  assert.equal(response.ok,false);assert.match(response.error,/npm start/);
});
test('worker stores the last diagnostic and clears it after a successful handoff',async()=>{
  const saved={},sender={id:'test',url:'chrome-extension://test/popup.html'};
  const diagnostic={code:'SCAN_NO_TEXT',stage:'extract',mode:'scan',events:[]};
  const fail=await workerHarness(async()=>{throw Object.assign(new Error('No readable text found.'),{diagnostic});},saved);
  const response=await new Promise(resolve=>fail({type:'open-reader',mode:'scan',text:readingText},sender,resolve));
  assert.equal(saved['undertone-last-error'].diagnostic.code,'SCAN_NO_TEXT');
  assert.equal(response.diagnostic.version,'1.2.3');
  assert.doesNotMatch(JSON.stringify(saved),/lighthouse/);
  const succeed=await workerHarness(async()=>{},saved);
  await new Promise(resolve=>succeed({type:'open-reader',mode:'paste',text:readingText},sender,resolve));
  assert.equal(saved['undertone-last-error'],undefined);
});
