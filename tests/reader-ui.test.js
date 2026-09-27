import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {sectionAtFocus} from '../extension/reader/reading-position.js';
const html=await readFile(new URL('../extension/reader/index.html',import.meta.url),'utf8');
const code=(await readFile(new URL('../extension/reader/app.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
const text='The harbor was quiet in the morning light. '.repeat(5);
async function reader({id='',record,play}={}){
 const dom=new JSDOM(html,{url:'chrome-extension://test/reader/index.html'+(id?'?article='+id:''),runScripts:'outside-only'});
 let opened=0,reads=0,offset=0;const w=dom.window,moods=[];w.sectionAtFocus=sectionAtFocus;
 w.AudioEngine=class {
  pause(){this.playing=false;}
  setMood(mood){moods.push(mood);return Promise.resolve();}
  async play(){if(play)await play();else this.playing=true;}
  preload(){}setVolume(){}
 };
 w.chrome={storage:{session:{get:async()=>{reads++;return record?{[id]:record}:{};}}},action:{openPopup:async()=>{opened++;}}};
 await w.eval(`(async()=>{${code}\n})()`);
 const article=w.document.querySelector('#sections');
 [...article.children].forEach((element,i)=>element.getBoundingClientRect=()=>({top:i*500-offset,bottom:(i+1)*500-offset}));
 return {dom,w,moods,article,scroll(value){offset=value;w.dispatchEvent(new w.Event('scroll'));},get opened(){return opened;},get reads(){return reads;}};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,300));
test('reader without a finalized session has no demo, paste form or import workflow',async()=>{
 const h=await reader();assert.equal(h.reads,0);assert.equal(h.w.document.querySelector('#reading').hidden,true);
 assert.equal(h.w.document.querySelector('form'),null);assert.match(h.w.document.querySelector('#entry-copy').textContent,/browser toolbar/);h.w.close();
});
test('finalized text stays whole and accessible; New text opens the menu',async()=>{
 const h=await reader({id:'article',record:{title:'A morning',score:{sections:[{text,mood:'calm',intensity:.3}]}}});
 assert.equal(h.w.document.querySelector('#reading').hidden,false);assert.equal(h.w.document.querySelector('#article-title').textContent,'A morning');
 assert.equal(h.article.querySelector('p').textContent,text);assert.equal(h.article.querySelectorAll('[inert], [aria-hidden=true]').length,0);
 assert.equal(h.w.document.querySelector('#page-measure'),null);assert.equal(h.w.document.querySelector('#timeline'),null);
 await h.w.document.querySelector('#exit').onclick();assert.equal(h.opened,1);h.w.close();
});
test('missing session points back to the popup',async()=>{
 const h=await reader({id:'missing'});assert.equal(h.w.document.querySelector('#entry-title').textContent,'Text unavailable.');assert.equal(h.opened,0);h.w.close();
});
test('continuous scroll waits for a stable boundary and does not rewrite or hide text',async()=>{
 const h=await reader({id:'article',record:{score:{sections:[{text,mood:'calm',intensity:.2},{text:'Second section',mood:'happy',intensity:.5}]}}});
 const first=h.article.firstChild;h.scroll(350);assert.deepEqual(h.moods,['calm']);await settle();assert.deepEqual(h.moods,['calm','happy']);
 h.scroll(235);await settle();assert.deepEqual(h.moods,['calm','happy'],'small reversal stays in the current mood');
 h.scroll(0);await settle();assert.deepEqual(h.moods,['calm','happy','calm']);assert.equal(h.article.firstChild,first);
 assert.equal(h.article.querySelectorAll('[inert], [aria-hidden=true]').length,0);h.w.close();
});
test('rapid scrolling commits only the final location and resize preserves DOM and selection',async()=>{
 const h=await reader({id:'article',record:{score:{sections:[{text,mood:'calm',intensity:.2},{text:'Second section',mood:'happy',intensity:.5}]}}});
 const node=h.article.querySelector('p').firstChild,range=h.w.document.createRange();range.setStart(node,4);range.setEnd(node,20);h.w.getSelection().addRange(range);
 h.scroll(350);h.scroll(0);await settle();assert.deepEqual(h.moods,['calm']);
 h.w.dispatchEvent(new h.w.Event('resize'));await settle();assert.equal(h.w.getSelection().toString(),text.slice(4,20));assert.equal(h.article.querySelector('p').firstChild,node);h.w.close();
});
test('a second click cancels pending Play instead of disabling the control',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);
 const h=await reader({id:'article',play:()=>pending,record:{score:{sections:[{text,mood:'calm',intensity:.2}]}}});
 const button=h.w.document.querySelector('#play'),first=button.onclick();
 assert.equal(button.disabled,false);assert.equal(button.dataset.playing,'true');assert.equal(button.getAttribute('aria-label'),'Pause soundtrack');
 await button.onclick();resolve();await first;
 assert.equal(button.dataset.playing,'false');assert.equal(button.getAttribute('aria-label'),'Play soundtrack');assert.equal(h.w.document.querySelector('#play-status').textContent,'Paused');h.w.close();
});

test('a short closing paragraph gets its soundtrack at the bottom and holds through small reversals',async()=>{
 const h=await reader({id:'article',record:{score:{sections:[{text,mood:'calm',intensity:.2},{text:'A short ending.',mood:'hopeful',intensity:.4}]}}});
 let offset=0;Object.defineProperty(h.w,'scrollY',{get:()=>offset});Object.defineProperty(h.w.document.documentElement,'scrollHeight',{value:1200});
 h.article.children[0].getBoundingClientRect=()=>({top:-offset,bottom:1000-offset});
 h.article.children[1].getBoundingClientRect=()=>({top:1000-offset,bottom:1100-offset});
 offset=432;h.w.dispatchEvent(new h.w.Event('scroll'));await settle();assert.deepEqual(h.moods,['calm','hopeful']);
 offset=422;h.w.dispatchEvent(new h.w.Event('scroll'));await settle();assert.deepEqual(h.moods,['calm','hopeful']);h.w.close();
});
