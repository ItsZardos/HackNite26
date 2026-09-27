import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const code=await readFile(new URL('../extension/public/brand/mascot.js',import.meta.url),'utf8');
test('mascot respects reduced motion and remembers an explicit pause',()=>{
 const dom=new JSDOM('<button class="mascot-toggle"></button>',{url:'https://undertone.test',runScripts:'outside-only'}),w=dom.window;
 let change;const preference={matches:false,addEventListener:(_,fn)=>{change=fn;}};w.matchMedia=()=>preference;
 w.eval(code);const button=w.document.querySelector('button');
 assert.equal(button.getAttribute('aria-pressed'),'true');button.click();
 assert.equal(w.localStorage.getItem('undertone-mascot-paused'),'true');assert.equal(w.document.body.dataset.mascotPaused,'true');
 button.click();assert.equal(w.document.body.dataset.mascotPaused,'false');
 preference.matches=true;change();button.click();assert.equal(w.document.body.dataset.mascotPaused,'true');
 assert.match(button.getAttribute('aria-label'),/reduced motion/);w.close();
});

test('greeting ends, pause synchronizes across tabs, and hidden pages pause animation',async()=>{
 const dom=new JSDOM('<button class="mascot-toggle"></button>',{url:'https://undertone.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.matchMedia=()=>({matches:false,addEventListener(){}});let finish;
 w.setTimeout=fn=>{finish=fn;return 1;};w.clearTimeout=()=>{};
 w.eval(code);const button=w.document.querySelector('button');button.dispatchEvent(new w.Event('pointerenter'));
 assert.equal(w.document.body.dataset.mascotGreeting,'true');finish();assert.equal(w.document.body.dataset.mascotGreeting,undefined);
 w.dispatchEvent(new w.StorageEvent('storage',{key:'undertone-mascot-paused',newValue:'true'}));assert.equal(w.document.body.dataset.mascotPaused,'true');
 button.dispatchEvent(new w.Event('pointerenter'));assert.equal(w.document.body.dataset.mascotGreeting,undefined);
 Object.defineProperty(w.document,'hidden',{value:true});w.document.dispatchEvent(new w.Event('visibilitychange'));assert.equal(w.document.body.dataset.mascotHidden,'true');w.close();
});
