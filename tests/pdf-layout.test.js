import test from 'node:test';
import assert from 'node:assert/strict';
import {pageLines,cleanPdfPages} from '../server/pdf-layout.js';
const line=(text,x,y,end=x+230,size=12)=>({text,x,y,end,size});
const page=lines=>({width:600,height:800,lines});

test('text fragments sort visually and letters within a word are not separated',()=>{
 const item=(str,x,y,width)=>({str,transform:[12,0,0,12,x,800-y],width,height:12});
 const result=pageLines([item('world.',90,100,40),item('lo',64,100,12),item('Hel',50,100,14),item('Earlier',50,80,50)],{transform:[1,0,0,-1,0,800],width:600,height:800});
 assert.deepEqual(result.map(l=>l.text),['Earlier','Hello world.']);
});
test('only edge page numbers and repeated small margin text are removed',()=>{
 const result=cleanPdfPages([
  page([line('Book title',50,30,180,20),line('A running header',50,52,200,10),line('The journey began here',50,100),line('42',50,120,70),line('and continued toward the sea',50,140),line('1',295,780,300,10)]),
  page([line('A running header',50,52,200,10),line('with new hope.',50,100),line('Page 2 of 2',270,780,330,10)])
 ]);
 assert.match(result.text,/Book title/);assert.match(result.text,/42/);
 assert.doesNotMatch(result.text,/running header|Page 2|\b1\b/);
 assert.match(result.text,/sea with new hope\./);
 assert.equal(result.removedMarginLines,4);
});
test('two-column prose reads down the left then down the right despite interleaved drawing order',()=>{
 const result=cleanPdfPages([page([
  line('Full-width title',50,45,550,20),
  line('LEFT one continues',50,100,270),line('RIGHT one continues',320,100,550),
  line('LEFT two continues',50,116,270),line('RIGHT two continues',320,116,550),
  line('LEFT three ends.',50,132,270),line('RIGHT three ends.',320,132,550)
 ])]);
 assert.ok(result.text.indexOf('LEFT three')<result.text.indexOf('RIGHT one'));
 assert.ok(result.text.startsWith('Full-width title'));
});
test('full-width headings divide independent column blocks',()=>{
 const lines=[];
 for(const [start,prefix] of [[100,'BEFORE'],[300,'AFTER']])for(let i=0;i<3;i++){
  lines.push(line(`${prefix} left ${i}.`,50,start+i*16,270),line(`${prefix} right ${i}.`,320,start+i*16,550));
 }
 lines.push(line('Middle heading',50,220,550,20));
 const {text}=cleanPdfPages([page(lines)]);
 assert.ok(text.indexOf('BEFORE right 2')<text.indexOf('Middle heading'));
 assert.ok(text.indexOf('Middle heading')<text.indexOf('AFTER left 0'));
});
test('soft line wraps reflow, but paragraph gaps, headings and lists remain',()=>{
 const {text}=cleanPdfPages([page([
  line('A heading',50,60,200,18),line('This is a sentence which',50,100),line('continues across a printed line.',50,116),
  line('A new paragraph starts here.',50,152),line('1. First list item',50,178),line('2. Second list item',50,194),
  line('A well-',50,225),line('known word and a dis\u00ad',50,241),line('cretionary break.',50,257)
 ])]);
 assert.match(text,/sentence which continues/);
 assert.match(text,/line\.\n\nA new paragraph/);
 assert.match(text,/item\n\n2\./);
 assert.match(text,/well-known word and a discretionary break/);
});

test('superscript references stay on their text line and multiline titles stay together',()=>{
 const viewport={transform:[1,0,0,-1,0,800],width:600,height:800};
 const lines=pageLines([
  {str:'Author',transform:[12,0,0,12,50,700],width:38},
  {str:'*',transform:[7,0,0,7,89,705],width:4}
 ],viewport);
 assert.equal(lines.length,1);assert.equal(lines[0].text,'Author*');
 const {text}=cleanPdfPages([page([line('A long title that',50,40,240,20),line('wraps to another line',50,62,270,20),line('The article begins here with its story.',50,120)])]);
 assert.match(text,/title that wraps to another line\n\nThe article/);
});
test('hard hyphen joins only when the unhyphenated word occurs elsewhere',()=>{
 const {text}=cleanPdfPages([page([line('We compile the code using a com-',50,100),line('piler. A compiler handles this well-',50,116),line('known task.',50,132)])]);
 assert.match(text,/using a compiler/);assert.match(text,/well-known/);
});
