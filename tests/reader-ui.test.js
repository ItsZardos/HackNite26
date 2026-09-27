import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../extension/reader/index.html',import.meta.url),'utf8');
const code=(await readFile(new URL('../extension/reader/app.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
const text='The harbor was quiet in the morning light. '.repeat(5);
async function reader({id='',record}={}){
 const dom=new JSDOM(html,{url:'chrome-extension://test/reader/index.html'+(id?'?article='+id:''),runScripts:'outside-only'});
 let opened=0,reads=0;const w=dom.window;
 w.scrollTo=()=>{};w.matchMedia=()=>({matches:false});w.requestAnimationFrame=()=>1;
 w.AudioEngine=class {pause(){}setMood(){return Promise.resolve();}};
 w.chrome={storage:{session:{get:async()=>{reads++;return record?{[id]:record}:{};}}},action:{openPopup:async()=>{opened++;}}};
 await w.eval(`(async()=>{${code}\n})()`);
 return {dom,w,get opened(){return opened;},get reads(){return reads;}};
}
test('reader without a finalized session has no demo, paste form or import workflow',async()=>{
 const h=await reader();assert.equal(h.reads,0);
 assert.equal(h.w.document.querySelector('#reading').hidden,true);
 assert.equal(h.w.document.querySelector('#demo'),null);
 assert.equal(h.w.document.querySelector('form'),null);
 assert.match(h.w.document.querySelector('#entry-copy').textContent,/browser toolbar/);h.dom.window.close();
});
test('finalized reader reloads stored text and New text opens the extension menu',async()=>{
 const h=await reader({id:'undertone-article-test',record:{title:'A morning',score:{sections:[{id:0,text,mood:'calm',intensity:.3}]}}});
 assert.equal(h.w.document.querySelector('#reading').hidden,false);
 assert.equal(h.w.document.querySelector('#article-title').textContent,'A morning');
 assert.equal(h.w.document.querySelector('#sections p').textContent,text);
 await h.w.document.querySelector('#exit').onclick();assert.equal(h.opened,1);
 assert.match(h.w.location.search,/undertone-article-test/);h.dom.window.close();
});
test('missing reader session points back to the popup without opening another tab',async()=>{
 const h=await reader({id:'missing'});
 assert.equal(h.w.document.querySelector('#reading').hidden,true);
 assert.equal(h.w.document.querySelector('#entry-title').textContent,'Text unavailable.');
 assert.equal(h.opened,0);h.dom.window.close();
});
