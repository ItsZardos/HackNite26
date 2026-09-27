import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {launchReader} from '../extension/reader-launch.js';

const readingText='The sea lay still beneath the lighthouse. '.repeat(12);
const score={source:'gemini',overallTone:'calm',sections:[{id:0,text:readingText,mood:'calm',intensity:.3}]};
function mockChrome({url='https://example.org/story',text=readingText,injectionError=false,createError=false,stored={}}={}){
  const calls=[];
  const api={
    runtime:{getURL:path=>'chrome-extension://test/'+path},
    tabs:{
      get:async id=>{calls.push(['get',id]);return {id,url};},
      create:async tab=>{calls.push(['create',tab]);if(createError)throw new Error('Tab failed');return {id:99};}
    },
    scripting:{executeScript:async request=>{
      calls.push(['inject',request]);
      if(injectionError)throw new Error('Cannot access page');
      return request.files?[{result:null}]:[{result:{title:'Story',author:'Writer',text}}];
    }},
    storage:{session:{
      set:async data=>{calls.push(['store',data]);Object.assign(stored,data);},
      get:async()=>{calls.push(['read-stored']);return {...stored};},
      remove:async ids=>{calls.push(['remove',ids]);for(const id of Array.isArray(ids)?ids:[ids])delete stored[id];}
    }}
  };
  const fetcher=async(url,options)=>{calls.push(['analyze',url,options]);return {ok:true,json:async()=>score};};
  return {api,calls,stored,fetcher};
}
const launch=(h,request,id='one',fetcher=h.fetcher)=>launchReader(request,h.api,()=>id,fetcher);

test('manifest registers native popup with unchanged narrow permissions',async()=>{
  const m=JSON.parse(await readFile(new URL('../extension/manifest.json',import.meta.url)));
  assert.equal(m.action.default_popup,'popup.html');assert.equal(m.background.type,'module');
  assert.deepEqual(m.permissions,['activeTab','scripting','storage']);
  for(const file of ['popup.html','popup.css','popup.js','background.js','reader-launch.js'])await readFile(new URL('../extension/'+file,import.meta.url));
});
test('paste analyzes finalized text, stores the score, then opens a direct reader',async()=>{
  const h=mockChrome();await launch(h,{mode:'paste',text:readingText});
  assert.deepEqual(h.calls.map(c=>c[0]),['analyze','store','read-stored','create']);
  assert.deepEqual(JSON.parse(h.calls[0][2].body),{text:readingText.trim(),stream:true});
  assert.equal(h.calls[0][1],'http://127.0.0.1:8787/api/analyze');
  assert.ok(h.calls[0][2].signal instanceof AbortSignal);
  assert.equal(h.stored['undertone-article-one'].score,score);
  assert.equal(h.stored['undertone-article-one'].title,'Reading selection');
  assert.match(h.calls.at(-1)[1].url,/reader\/index.html\?article=undertone-article-one$/);
});
test('scan captures source, injects sequentially, requests AI cleanup and scoring, then opens',async()=>{
  const h=mockChrome();await launch(h,{mode:'scan',tabId:17});
  assert.deepEqual(h.calls.map(c=>c[0]),['get','inject','inject','analyze','store','read-stored','create']);
  assert.deepEqual(h.calls[1][1],{target:{tabId:17},world:'ISOLATED',files:['vendor/Readability.js']});
  assert.equal(h.calls[2][1].target.tabId,17);assert.equal(typeof h.calls[2][1].func,'function');
  assert.deepEqual(JSON.parse(h.calls[3][2].body),{text:readingText,scan:true,stream:true});
  assert.equal(h.stored['undertone-article-one'].title,'Story');
  assert.equal(h.stored['undertone-article-one'].author,'Writer');
  assert.equal(h.stored['undertone-article-one'].score,score);
});
test('reader does not open or store a record until its score has finished',async()=>{
  const h=mockChrome();let finish;
  const pending=launch(h,{mode:'paste',text:readingText},'one',async()=>({ok:true,json:()=>new Promise(resolve=>{finish=resolve;})}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.calls.length,0);
  finish(score);await pending;
  assert.equal(h.calls.at(-1)[0],'create');
});
test('long score requests keep the worker active and stop the keepalive after completion',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const h=mockChrome();let finish,heartbeats=0;
  h.api.runtime.getPlatformInfo=async()=>{heartbeats++;return {os:'test'};};
  const pending=launch(h,{mode:'paste',text:readingText},'one',async()=>({ok:true,json:()=>new Promise(resolve=>{finish=resolve;})}));
  await new Promise(resolve=>setImmediate(resolve));
  t.mock.timers.tick(20000);await Promise.resolve();
  assert.equal(heartbeats,1);assert.equal(h.calls.length,0);
  finish(score);await pending;
  t.mock.timers.tick(40000);await Promise.resolve();
  assert.equal(heartbeats,1);
});
for(const url of ['chrome://settings/','file:///story.txt','https://chromewebstore.google.com/detail/some-extension','https://chrome.google.com/webstore/detail/test']){
  test('restricted page remains in popup without injection or transmission: '+url,async()=>{
    const h=mockChrome({url});
    await assert.rejects(launch(h,{mode:'scan',tabId:17}),/Choose Paste text/);
    assert.deepEqual(h.calls.map(c=>c[0]),['get']);assert.equal(Object.keys(h.stored).length,0);
  });
}
for(const options of [{injectionError:true},{text:''}]){
  test('scan failure does not open an unfinished reader: '+JSON.stringify(options),async()=>{
    const h=mockChrome(options);
    await assert.rejects(launch(h,{mode:'scan',tabId:17}),{code:options.injectionError?'SCAN_ACCESS_DENIED':'SCAN_NO_TEXT'});
    assert.ok(!h.calls.some(c=>['analyze','store','create'].includes(c[0])));
  });
}
test('missing or closed source tab reports a paste fallback in the popup',async()=>{
  for(const tabId of [undefined,17]){
    const h=mockChrome();h.api.tabs.get=async()=>{throw new Error('Tab closed');};
    await assert.rejects(launch(h,{mode:'scan',tabId}),/choose Paste text/i);
    assert.equal(Object.keys(h.stored).length,0);
  }
});
test('HTTP and streamed Gemini errors never produce reader tabs',async()=>{
  for(const ok of [false,true]){
    const h=mockChrome();
    await assert.rejects(launch(h,{mode:'paste',text:readingText},'one',async()=>({ok,json:async()=>({error:'Gemini key is missing.'})})),/Gemini key/);
    assert.equal(h.calls.length,0);assert.equal(Object.keys(h.stored).length,0);
  }
});
test('a streamed HTTP 505 retains the upstream status and score stage in the debug report',async()=>{
  const h=mockChrome();
  await assert.rejects(launch(h,{mode:'scan',tabId:17},'one',async()=>({ok:true,status:200,json:async()=>({error:'Gemini returned HTTP 505.',code:'GEMINI_HTTP_VERSION_UNSUPPORTED',upstreamStatus:505})})),error=>{
    assert.equal(error.diagnostic.code,'GEMINI_HTTP_VERSION_UNSUPPORTED');
    assert.equal(error.diagnostic.stage,'score');
    assert.equal(error.diagnostic.httpStatus,200);
    assert.equal(error.diagnostic.upstreamStatus,505);
    assert.ok(error.diagnostic.events.some(event=>event.code==='SCAN_TEXT_READY'));
    assert.doesNotMatch(JSON.stringify(error.diagnostic),/lighthouse|example.org|Story|Writer/);
    return true;
  });
  assert.ok(!h.calls.some(call=>['store','create'].includes(call[0])));
});
test('navigation between parser injection and extraction has a specific failure',async()=>{
  const h=mockChrome();
  h.api.scripting.executeScript=async request=>{
    if(request.files)return [{frameId:0,documentId:'original-document'}];
    assert.deepEqual(request.target.documentIds,['original-document']);
    throw new Error('No document with id original-document');
  };
  await assert.rejects(launch(h,{mode:'scan',tabId:17}),{code:'SCAN_PAGE_CHANGED'});
});
test('unreachable server gives a setup instruction without opening a tab',async()=>{
  const h=mockChrome();
  await assert.rejects(launch(h,{mode:'paste',text:readingText},'one',async()=>{throw new TypeError('Failed to fetch');}),/npm start/);
  assert.equal(h.calls.length,0);
});
test('timeout while waiting for streamed score gives a retry instruction',async()=>{
  const h=mockChrome();
  await assert.rejects(launch(h,{mode:'paste',text:readingText},'one',async()=>({ok:true,json:async()=>{const e=new Error('Aborted');e.name='AbortError';throw e;}})),/timed out/);
  assert.equal(h.calls.length,0);
});
test('incomplete score never opens a reader',async()=>{
  for(const result of [null,{sections:[]},{sections:[{id:0}]}]){
    const h=mockChrome();
    await assert.rejects(launch(h,{mode:'paste',text:readingText},'one',async()=>({ok:true,json:async()=>result})),/incomplete/);
    assert.equal(h.calls.length,0);
  }
});
test('failed reader tab creation removes its orphaned session record',async()=>{
  const h=mockChrome({createError:true});
  await assert.rejects(launch(h,{mode:'paste',text:readingText},'orphan'),{code:'READER_OPEN_FAILED'});
  assert.equal(h.stored['undertone-article-orphan'],undefined);
  assert.deepEqual(h.calls.at(-1),['remove','undertone-article-orphan']);
});
test('separate preparations retain separate scores for reload',async()=>{
  const h=mockChrome();
  await Promise.all(['one','two'].map(id=>launch(h,{mode:'paste',text:readingText},id)));
  assert.deepEqual(Object.keys(h.stored).sort(),['undertone-article-one','undertone-article-two']);
});
test('reader storage retains the ten newest scores and unrelated session data',async()=>{
  const stored={preference:'quiet'};
  for(let i=0;i<10;i++)stored['undertone-article-old-'+i]={score,createdAt:i};
  const h=mockChrome({stored});await launch(h,{mode:'paste',text:readingText});
  assert.equal(Object.keys(stored).filter(id=>id.startsWith('undertone-article-')).length,10);
  assert.equal(stored['undertone-article-old-0'],undefined);
  assert.ok(stored['undertone-article-one']);assert.equal(stored.preference,'quiet');
});
test('unknown actions and invalid pasted text are rejected without browser operations',async()=>{
  for(const request of [{mode:'other'},{mode:'paste'},{mode:'paste',text:'short'},{mode:'paste',text:'x'.repeat(100001)}]){
    const h=mockChrome();await assert.rejects(launch(h,request));assert.equal(h.calls.length,0);
  }
});
