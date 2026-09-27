import test from 'node:test';
import assert from 'node:assert/strict';
import {paginateSections,pageAtPosition,pageForAnchor} from '../extension/reader/passages.js';
const fits=limit=>paragraphs=>paragraphs.join('\n\n').length<=limit;
const normalize=text=>text.replace(/\s+/gu,' ').trim();
test('pagination preserves every word in order and inherits source sections without changing scores',()=>{
 const sections=[{text:'The first sentence. Another longer sentence about the harbor.\n\nA second paragraph with plenty of words. '.repeat(7),mood:'calm'}, {text:'The final scene feels different.',mood:'tense'}];
 const before=JSON.stringify(sections),pages=paginateSections(sections,fits(110));
 assert.ok(pages.length>3);assert.equal(JSON.stringify(sections),before);
 for(let i=0;i<sections.length;i++){
  const sourcePages=pages.filter(page=>page.sectionIndex===i);
  assert.equal(normalize(sourcePages.flatMap(page=>page.paragraphs).join(' ')),normalize(sections[i].text));
  assert.ok(sourcePages.every(page=>fits(110)(page.paragraphs)));
  assert.ok(sourcePages.every((page,j)=>!j||page.start>sourcePages[j-1].start));
 }
});
test('unspaced text and long words break safely, including combined Unicode graphemes',()=>{
 for(const text of ['漢字の長い文章です'.repeat(20),'supercalifragilisticexpialidocious'.repeat(5),'👩🏽‍🚀'.repeat(20),'e\u0301'.repeat(30)]){
  const pages=paginateSections([{text}],fits(21));
  assert.equal(pages.flatMap(page=>page.paragraphs).join(''),text);
  assert.ok(pages.every(page=>fits(21)(page.paragraphs)));
  assert.ok(pages.every(page=>!/[\uD800-\uDBFF]$/.test(page.paragraphs.at(-1))));
 }
});
test('repagination retains the source passage and nearest preceding text anchor',()=>{
 const sections=[{text:'quiet words '.repeat(30)},{text:'rising tension '.repeat(30)}];
 const small=paginateSections(sections,fits(55)),large=paginateSections(sections,fits(120));
 const anchor=small.find(page=>page.sectionIndex===1&&page.start>60);
 const index=pageForAnchor(large,anchor.sectionIndex,anchor.start);
 assert.equal(large[index].sectionIndex,1);assert.ok(large[index].start<=anchor.start);
 assert.ok(!large[index+1]||large[index+1].start>anchor.start);
});
test('scroll positions clamp safely during overscroll and empty input',()=>{
 assert.equal(pageAtPosition(-100,500,4),0);assert.equal(pageAtPosition(10000,500,4),3);
 assert.equal(pageAtPosition(499,500,4),1);assert.equal(pageAtPosition(100,0,0),0);
 assert.deepEqual(paginateSections([],fits(100)),[]);
});
