import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const popupCode=await readFile(new URL('../extension/popup.js',import.meta.url),'utf8');
function popupHarness({query=async()=>[{id:42}],send=async()=>({ok:true})}={}){
  const elements=Object.fromEntries(['paste','scan','status'].map(id=>[id,{disabled:false,hidden:true,textContent:'',addEventListener(event,callback){this[event]=callback;}}]));
  const messages=[];let closed=0,queries=0;
  vm.runInNewContext(popupCode,{
    document:{getElementById:id=>elements[id]},
    chrome:{tabs:{query:async args=>{queries++;return query(args);}},runtime:{sendMessage:async msg=>{messages.push({...msg});return send(msg);}}},
    window:{close:()=>closed++}
  });
  return {elements,messages,get closed(){return closed;},get queries(){return queries;}};
}

test('popup Paste sends paste command, closes after success, and never queries tabs',async()=>{
  const h=popupHarness();await h.elements.paste.click();
  assert.equal(h.queries,0);assert.equal(h.messages[0].mode,'paste');assert.equal(h.closed,1);
});
test('popup Scan captures originating tab ID before handing off',async()=>{
  const h=popupHarness();await h.elements.scan.click();
  assert.equal(h.queries,1);assert.equal(h.messages[0].tabId,42);assert.equal(h.messages[0].type,'open-reader');assert.equal(h.closed,1);
});
test('both actions stay disabled during launch and repeated clicks cannot duplicate it',async()=>{
  let finish;const h=popupHarness({send:()=>new Promise(resolve=>{finish=resolve;})});
  const first=h.elements.paste.click();await h.elements.scan.click();
  assert.equal(h.elements.paste.disabled,true);assert.equal(h.elements.scan.disabled,true);assert.equal(h.messages.length,1);
  finish({ok:true});await first;
});
test('failed launch keeps popup open, gives an error and re-enables both choices',async()=>{
  const h=popupHarness({send:async()=>{throw new Error('Worker failed');}});await h.elements.paste.click();
  assert.equal(h.closed,0);assert.equal(h.elements.paste.disabled,false);assert.equal(h.elements.scan.disabled,false);
  assert.match(h.elements.status.textContent,/Please try again/);assert.equal(h.elements.status.hidden,false);
});
test('worker accepts only its popup and keeps async reply alive',async()=>{
  const code=(await readFile(new URL('../extension/background.js',import.meta.url),'utf8')).replace("import {launchReader} from './reader-launch.js';",'');
  let handler,finish,launched=0;
  vm.runInNewContext(code,{
    chrome:{runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,onMessage:{addListener:fn=>{handler=fn;}}}},
    launchReader:()=>{launched++;return new Promise(resolve=>{finish=resolve;});}
  });
  const request={type:'open-reader',mode:'paste'},sender={id:'test',url:'chrome-extension://test/popup.html'};
  assert.equal(handler(request,{...sender,url:'https://example.org'},()=>{}),undefined);assert.equal(launched,0);
  const response=new Promise(resolve=>{assert.equal(handler(request,sender,resolve),true);});
  assert.equal(launched,1);finish();assert.equal((await response).ok,true);
});
