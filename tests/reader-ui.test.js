import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {paginateSections,pageAtScroll} from '../extension/reader/reading-position.js';
const html=await readFile(new URL('../extension/reader/index.html',import.meta.url),'utf8');
const code=(await readFile(new URL('../extension/reader/app.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
const text='The harbor was quiet in the morning light. '.repeat(5);
async function reader({id='',record,play}={}){
 const dom=new JSDOM(html,{url:'chrome-extension://test/reader/index.html'+(id?'?article='+id:''),runScripts:'outside-only'});
 let opened=0,reads=0,height=500;const w=dom.window,moods=[];Object.assign(w,{paginateSections,pageAtScroll});
 Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{get(){return this.id==='sections'||this.classList.contains('reader-page')?height:0;}});
 Object.defineProperty(w.HTMLElement.prototype,'scrollHeight',{get(){return Math.ceil(this.textContent.trim().split(/\s+/).length/10)*40;}});
 w.HTMLElement.prototype.scrollTo=function({top}){this.scrollTop=top;this.dispatchEvent(new w.Event('scroll'));};
 w.matchMedia=()=>({matches:true});
 w.AudioEngine=class {
  pause(){this.playing=false;}
  setScene(section){moods.push(section.mood);return Promise.resolve();}
  async play(){if(play)await play();else this.playing=true;}
  preloadScene(){}setVolume(){}
 };
 w.chrome={storage:{session:{get:async()=>{reads++;return record?{[id]:record}:{};}}},action:{openPopup:async()=>{opened++;}}};
 await w.eval(`(async()=>{${code}\n})()`);
 const article=w.document.querySelector('#sections');
 return {dom,w,moods,article,scroll(value){article.scrollTop=value;article.dispatchEvent(new w.Event('scroll'));},resize(value){height=value;w.dispatchEvent(new w.Event('resize'));},get opened(){return opened;},get reads(){return reads;}};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,180));
const record={title:'A morning',score:{sections:[{text,mood:'calm',intensity:.3},{text:'The next scene.',mood:'happy',intensity:.4}]}};
test('reader without a finalized session has no demo, paste form or import workflow',async()=>{
 const h=await reader();assert.equal(h.reads,0);assert.equal(h.w.document.querySelector('#reading').hidden,true);
 assert.equal(h.w.document.querySelector('form'),null);assert.match(h.w.document.querySelector('#entry-copy').textContent,/browser toolbar/);h.w.close();
});
test('finalized text opens one accessible page and New text opens the menu',async()=>{
 const h=await reader({id:'article',record});
 assert.equal(h.w.document.querySelector('#article-title').textContent,'A morning');
 assert.equal(h.article.querySelector('p').textContent,text);
 assert.equal(h.article.children[0].inert,false);assert.equal(h.article.children[1].inert,true);
 assert.equal(h.w.document.querySelector('#page-progress').textContent,'1 / 2');
 await h.w.document.querySelector('#exit').onclick();assert.equal(h.opened,1);h.w.close();
});
test('missing session points back to the popup',async()=>{
 const h=await reader({id:'missing'});assert.equal(h.w.document.querySelector('#entry-title').textContent,'Text unavailable.');assert.equal(h.opened,0);h.w.close();
});
test('music follows a landed page and ignores a half-finished scroll',async()=>{
 const h=await reader({id:'article',record});h.scroll(300);await settle();assert.deepEqual(h.moods,['calm']);
 h.scroll(500);await settle();assert.deepEqual(h.moods,['calm','happy']);
 assert.equal(h.article.children[0].inert,true);assert.equal(h.article.children[1].inert,false);
 h.scroll(400);await settle();assert.deepEqual(h.moods,['calm','happy']);
 h.scroll(0);await settle();assert.deepEqual(h.moods,['calm','happy','calm']);h.w.close();
});
test('turning pages within a long passage retains its soundtrack and every word',async()=>{
 const long='word '.repeat(240),h=await reader({id:'article',record:{score:{sections:[{text:long,mood:'calm',intensity:.2}]}}});
 assert.equal(h.article.children.length,3);assert.equal(h.article.textContent,long);
 h.scroll(500);await settle();assert.deepEqual(h.moods,['calm']);
 assert.equal(h.w.document.querySelector('#page-progress').textContent,'2 / 3');h.w.close();
});
test('resize preserves the reading passage while adapting the page capacity',async()=>{
 const h=await reader({id:'article',record});h.scroll(500);await settle();
 h.resize(260);await settle();assert.equal(h.article.children[Math.round(h.article.scrollTop/260)].dataset.section,'1');
 assert.deepEqual(h.moods,['calm','happy']);assert.equal(h.article.textContent,record.score.sections.map(s=>s.text).join(''));h.w.close();
});
test('keyboard advances a page and leaves volume keyboard controls alone',async()=>{
 const h=await reader({id:'article',record});h.article.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'PageDown',bubbles:true,cancelable:true}));
 await settle();assert.deepEqual(h.moods,['calm','happy']);assert.equal(h.article.scrollTop,500);
 h.w.document.querySelector('#volume').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
 assert.equal(h.article.scrollTop,500);h.w.close();
});
test('a second click cancels pending Play instead of disabling the control',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);
 const h=await reader({id:'article',play:()=>pending,record});
 const button=h.w.document.querySelector('#play'),first=button.onclick();
 assert.equal(button.disabled,false);assert.equal(button.dataset.playing,'true');
 await button.onclick();resolve();await first;
 assert.equal(button.dataset.playing,'false');assert.equal(h.w.document.querySelector('#play-status').textContent,'Paused');h.w.close();
});

test('fractional page heights keep later pages aligned at browser zoom levels',async()=>{
 const h=await reader({id:'article',record:{score:{sections:[{text:'word '.repeat(2000),mood:'calm',intensity:.2}]}}});
 for(const page of h.article.children)page.getBoundingClientRect=()=>({height:499.6});
 h.scroll(12*499.6);await settle();
 assert.match(h.w.document.querySelector('#page-progress').textContent,/^13 \/ /);
 assert.equal(h.article.children[12].inert,false);h.w.close();
});

test('Page Down still works after Play while Space remains available for the button',async()=>{
 const h=await reader({id:'article',record}),button=h.w.document.querySelector('#play');
 button.focus();await button.onclick();
 const space=new h.w.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true});button.dispatchEvent(space);
 assert.equal(space.defaultPrevented,false);
 button.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'PageDown',bubbles:true,cancelable:true}));
 await settle();assert.equal(h.article.scrollTop,500);assert.equal(h.moods.at(-1),'happy');h.w.close();
});
