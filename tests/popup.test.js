import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const popupCode=await readFile(new URL('../extension/popup.js',import.meta.url),'utf8');
const readingText='The sea lay still beneath the lighthouse. '.repeat(12);
function popupHarness({query=async()=>[{id:42}],send=async()=>({ok:true})}={}){
  const elements=Object.fromEntries(['paste','scan','status','choices','paste-form','text','back','open-reader'].map(id=>[id,{
    disabled:false,hidden:['status','paste-form'].includes(id),textContent:'',value:'',focused:false,
    addEventListener(event,callback){this[event]=callback;},
    setAttribute(name,value){this[name]=value;},
    focus(){this.focused=true;}
  }]));
  const messages=[];let closed=0,queries=0;
  vm.runInNewContext(popupCode,{
    document:{getElementById:id=>elements[id]},
    chrome:{tabs:{query:async args=>{queries++;return query(args);}},runtime:{sendMessage:async msg=>{messages.push({...msg});return send(msg);}}},
    window:{close:()=>closed++}
  });
  return {elements,messages,get closed(){return closed;},get queries(){return queries;},
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
async function workerHarness(launchReader){
  const code=(await readFile(new URL('../extension/background.js',import.meta.url),'utf8')).replace("import {launchReader} from './reader-launch.js';",'');
  let handler;
  vm.runInNewContext(code,{
    chrome:{runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,onMessage:{addListener:fn=>{handler=fn;}}}},
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
