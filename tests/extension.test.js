import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {launchReader} from '../extension/reader-launch.js';

function mockChrome({url='https://example.org/story', text='The sea lay still beneath the lighthouse. '.repeat(12), injectionError=false, createError=false}={}) {
  const calls=[], stored={};
  const api={
    runtime:{getURL:path=>`chrome-extension://test/${path}`},
    tabs:{
      get:async id=>{calls.push(['get',id]);return {id,url};},
      create:async tab=>{calls.push(['create',tab]);if(createError)throw new Error('Tab failed');return {id:99};}
    },
    scripting:{executeScript:async request=>{
      calls.push(['inject',request]);
      if(injectionError)throw new Error('Cannot access page');
      return request.files?[{result:null}]:[{result:{title:'Story',author:'Writer',text,url}}];
    }},
    storage:{session:{
      set:async data=>{calls.push(['store',data]);Object.assign(stored,data);},
      remove:async id=>{calls.push(['remove',id]);delete stored[id];}
    }}
  };
  return {api,calls,stored};
}

test('manifest registers native popup with unchanged narrow permissions',async()=>{
  const m=JSON.parse(await readFile(new URL('../extension/manifest.json',import.meta.url)));
  assert.equal(m.action.default_popup,'popup.html');
  assert.equal(m.background.type,'module');
  assert.deepEqual(m.permissions,['activeTab','scripting','storage']);
  for(const file of ['popup.html','popup.css','popup.js','background.js','reader-launch.js'])await readFile(new URL('../extension/'+file,import.meta.url));
});

test('paste opens full reader without touching the current tab, clipboard, or storage',async()=>{
  const {api,calls}=mockChrome();
  await launchReader({mode:'paste'},api);
  assert.deepEqual(calls,[['create',{url:'chrome-extension://test/reader/index.html?mode=paste'}]]);
});

test('scan captures source, injects sequentially, persists text, then opens reader',async()=>{
  const {api,calls,stored}=mockChrome();
  await launchReader({mode:'scan',tabId:17},api,()=> 'article-1');
  assert.deepEqual(calls.map(c=>c[0]),['get','inject','inject','store','create']);
  assert.deepEqual(calls[1][1],{target:{tabId:17},files:['vendor/Readability.js']});
  assert.equal(calls[2][1].target.tabId,17);
  assert.equal(typeof calls[2][1].func,'function');
  assert.equal(stored['article-1'].title,'Story');
  assert.match(calls.at(-1)[1].url,/mode=scan&article=article-1$/);
});

for(const url of ['chrome://settings/','file:///story.txt','https://chromewebstore.google.com/detail/some-extension','https://chrome.google.com/webstore/detail/test']){
  test(`restricted page opens paste fallback without injecting: ${url}`,async()=>{
    const {api,calls,stored}=mockChrome({url});
    await launchReader({mode:'scan',tabId:17},api,()=> 'fallback');
    assert.ok(!calls.some(c=>c[0]==='inject'));
    assert.match(stored.fallback.error,/could not be scanned/);
    assert.equal(calls.at(-1)[0],'create');
  });
}

for(const options of [{injectionError:true},{text:''}]){
  test(`scan failure preserves a usable reader fallback: ${JSON.stringify(options)}`,async()=>{
    const {api,calls,stored}=mockChrome(options);
    await launchReader({mode:'scan',tabId:17},api,()=> 'fallback');
    assert.match(stored.fallback.error,/Paste the text/);
    assert.equal(calls.at(-1)[0],'create');
  });
}

test('missing or closed source tab opens fallback',async()=>{
  for(const tabId of [undefined,17]){
    const {api,stored}=mockChrome();api.tabs.get=async()=>{throw new Error('Tab closed');};
    await launchReader({mode:'scan',tabId},api,()=> 'fallback');
    assert.match(stored.fallback.error,/could not be scanned/);
  }
});

test('failed reader tab creation removes orphaned article data',async()=>{
  const {api,calls,stored}=mockChrome({createError:true});
  await assert.rejects(()=>launchReader({mode:'scan',tabId:17},api,()=> 'orphan'),/Tab failed/);
  assert.equal(stored.orphan,undefined);
  assert.deepEqual(calls.at(-1),['remove','orphan']);
});

test('separate scans do not overwrite one another',async()=>{
  const {api,stored}=mockChrome();
  await Promise.all(['one','two'].map(id=>launchReader({mode:'scan',tabId:17},api,()=>id)));
  assert.deepEqual(Object.keys(stored).sort(),['one','two']);
});

test('unknown actions are rejected before any browser operation',async()=>{
  const {api,calls}=mockChrome();
  await assert.rejects(()=>launchReader({mode:'other'},api),/Unknown/);
  assert.equal(calls.length,0);
});
