import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {paginateSections,pageAtPosition,pageForAnchor} from '../extension/reader/passages.js';
const html=await readFile(new URL('../extension/reader/index.html',import.meta.url),'utf8');
const code=(await readFile(new URL('../extension/reader/app.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
const text='The harbor was quiet in the morning light. '.repeat(5);
async function reader({id='',record}={}){
 const dom=new JSDOM(html,{url:'chrome-extension://test/reader/index.html'+(id?'?article='+id:''),runScripts:'outside-only'});
 let opened=0,reads=0;const w=dom.window;const moods=[];
 Object.assign(w,{paginateSections,pageAtPosition,pageForAnchor});
 const scroller=w.document.querySelector('#sections'),probe=w.document.querySelector('#page-measure');
 Object.defineProperty(scroller,'clientHeight',{value:500});
 Object.defineProperty(probe,'clientHeight',{value:500});
 Object.defineProperty(probe,'scrollHeight',{get:()=>probe.textContent.length});
 scroller.scrollTo=options=>{scroller.scrollTop=options.top;};
 w.scrollTo=()=>{};w.matchMedia=()=>({matches:false});w.requestAnimationFrame=()=>1;
 w.AudioEngine=class {pause(){this.playing=false;}setMood(mood){moods.push(mood);return Promise.resolve();}};
 w.chrome={storage:{session:{get:async()=>{reads++;return record?{[id]:record}:{};}}},action:{openPopup:async()=>{opened++;}}};
 await w.eval(`(async()=>{${code}\n})()`);
 return {dom,w,moods,scroller,get opened(){return opened;},get reads(){return reads;}};
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
 assert.equal(h.w.document.querySelector('#sections p').textContent,text.trim());
 await h.w.document.querySelector('#exit').onclick();assert.equal(h.opened,1);
 assert.match(h.w.location.search,/undertone-article-test/);h.dom.window.close();
});
test('missing reader session points back to the popup without opening another tab',async()=>{
 const h=await reader({id:'missing'});
 assert.equal(h.w.document.querySelector('#reading').hidden,true);
 assert.equal(h.w.document.querySelector('#entry-title').textContent,'Text unavailable.');
 assert.equal(h.opened,0);h.dom.window.close();
});

test('scroll position commits one passage only after settling and same-mood source pages keep playing',async()=>{
 const sections=[{text:'First words. '.repeat(65),mood:'calm',intensity:.3},{text:'A change of scene.',mood:'tense',intensity:.7}];
 const h=await reader({id:'reading',record:{score:{sections}}});
 assert.ok(h.scroller.children.length>2);
 assert.deepEqual(h.moods,['calm']);
 h.scroller.scrollTop=500;h.scroller.dispatchEvent(new h.w.Event('scroll'));
 assert.equal(h.scroller.children[0].dataset.active,'true');
 h.scroller.dispatchEvent(new h.w.Event('scrollend'));
 assert.equal(h.scroller.children[1].dataset.active,'true');
 assert.deepEqual(h.moods,['calm']);
 const last=h.scroller.children.length-1;
 h.scroller.scrollTop=last*500;h.scroller.dispatchEvent(new h.w.Event('scrollend'));
 assert.deepEqual(h.moods,['calm','tense']);
 assert.equal(h.scroller.querySelectorAll('[aria-hidden="false"]').length,1);
 assert.equal(h.scroller.children[0].inert,true);
 assert.equal(h.scroller.children[last].inert,false);
 assert.equal(h.w.document.querySelector('#mood').textContent,'tense');
 assert.match(h.w.document.querySelector('#position-hint').textContent,/End of the text/);
 h.scroller.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Home'}));
 assert.equal(h.scroller.scrollTop,0);h.scroller.dispatchEvent(new h.w.Event('scrollend'));
 assert.deepEqual(h.moods,['calm','tense','calm']);h.dom.window.close();
});
test('scroll fallback settles the final position, including browsers without scrollend',async()=>{
 const h=await reader({id:'reading',record:{score:{sections:[{text:'First passage',mood:'calm',intensity:.2},{text:'Last passage',mood:'happy',intensity:.5}]}}});
 h.scroller.scrollTop=300;h.scroller.dispatchEvent(new h.w.Event('scroll'));
 h.scroller.scrollTop=0;h.scroller.dispatchEvent(new h.w.Event('scroll'));
 await new Promise(resolve=>setTimeout(resolve,220));assert.deepEqual(h.moods,['calm']);
 h.scroller.scrollTop=500;h.scroller.dispatchEvent(new h.w.Event('scroll'));
 await new Promise(resolve=>setTimeout(resolve,220));assert.deepEqual(h.moods,['calm','happy']);h.dom.window.close();
});
