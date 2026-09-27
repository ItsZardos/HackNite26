import test from 'node:test';
import assert from 'node:assert/strict';
import {paginateSections,pageAtScroll} from '../extension/reader/reading-position.js';
const words=text=>text.trim().split(/\s+/).length;
test('pagination preserves every character and never mixes scored passages',()=>{
 const sections=[{text:'First sentence.\n\nSecond paragraph with more words. '.repeat(20)},{text:'The ending.'}];
 const pages=paginateSections(sections,text=>words(text)<=45);
 sections.forEach((s,i)=>assert.equal(pages.filter(p=>p.sectionIndex===i).map(p=>p.text).join(''),s.text));
 assert.ok(pages.every(p=>words(p.text)<=45));assert.equal(pages.at(-1).text,'The ending.');
});
test('long passages are balanced instead of leaving a tiny final page',()=>{
 const pages=paginateSections([{text:'word '.repeat(102)}],text=>words(text)<=100);
 assert.equal(pages.length,2);assert.equal(words(pages[0].text),51);assert.equal(words(pages[1].text),51);
});
test('ordinary prose breaks at sentence boundaries where they fit',()=>{
 const text='One two three four five. Six seven eight nine ten. Eleven twelve thirteen fourteen fifteen.';
 const pages=paginateSections([{text}],text=>words(text)<=8);
 assert.ok(pages.slice(0,-1).every(p=>p.text.trimEnd().endsWith('.')));
 assert.equal(pages.map(p=>p.text).join(''),text);
});
test('unbroken text and emoji can span pages without missing or broken characters',()=>{
 const text='😀'.repeat(107),pages=paginateSections([{text}],value=>Array.from(value).length<=20);
 assert.equal(pages.map(p=>p.text).join(''),text);assert.equal(pages.length,6);
 assert.ok(pages.every(p=>!p.text.includes('\uFFFD')&&Array.from(p.text).length<=20));
});
test('page position clamps overscroll and handles an empty viewport',()=>{
 assert.equal(pageAtScroll(-10,500,3),0);assert.equal(pageAtScroll(501,500,3),1);
 assert.equal(pageAtScroll(1700,500,3),2);assert.equal(pageAtScroll(0,0,3),-1);assert.equal(pageAtScroll(0,500,0),-1);
});
