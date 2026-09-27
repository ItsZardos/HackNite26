import test from 'node:test';
import assert from 'node:assert/strict';
import {chunkText,validateAnalysis} from '../shared/analysis.js';
import {analyze} from '../server/gemini.js';
const words=n=>Array.from({length:n},(_,i)=>`word${i}`).join(' ');
const item=id=>({id,mood:'calm',intensity:.3,energy:.2,brightness:.8,musicPrompt:'Soft piano'});
test('chunking preserves words and caps long paragraphs',()=>{const c=chunkText(words(1200)+'\n\n'+words(180));assert.equal(c.map(s=>s.text).join(' ').split(/\s+/).length,1380);assert.ok(c.every(s=>s.text.split(/\s+/).length<=500));});
test('preserves paragraph boundaries',()=>{const a=words(150),b=words(160);assert.equal(chunkText(a+'\n\n'+b)[0].text,a+'\n\n'+b);});
test('rejects empty and oversized inputs',()=>{for(const text of ['',null,'a'.repeat(100001)])assert.throws(()=>chunkText(text));});
test('maps out-of-order IDs to original text',()=>{const out=validateAnalysis({overallTone:'quiet',sections:[item(1),item(0)]},[{id:0,text:'first'},{id:1,text:'second'}]);assert.equal(out.sections[0].text,'first');assert.equal(out.sections[0].id,0);});
test('rejects malformed metadata and missing or duplicate IDs',()=>{const chunks=[{id:0,text:'a'},{id:1,text:'b'}];for(const sections of [[item(0),item(0)],[item(0)],[item(0),{...item(1),mood:'evil'}],[item(0),{...item(1),intensity:2}],[item(0),{...item(1),energy:NaN}]])assert.throws(()=>validateAnalysis({overallTone:'x',sections},chunks));});
test('Gemini request uses secret header and structured JSON',async()=>{const chunks=[{id:0,text:words(100)}];const result=await analyze(chunks,{key:'test-key',fetcher:async(url,options)=>{assert.equal(options.headers['x-goog-api-key'],'test-key');assert.ok(!url.includes('test-key'));assert.equal(JSON.parse(options.body).generationConfig.responseMimeType,'application/json');return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({overallTone:'quiet',sections:[item(0)]})}]}}]})};}});assert.equal(result.source,'gemini');assert.equal(result.sections[0].text,chunks[0].text);});
test('missing key and rate limits give actionable errors',async()=>{await assert.rejects(()=>analyze([],{key:''}),/GEMINI_API_KEY/);await assert.rejects(()=>analyze([],{key:'test',fetcher:async()=>({ok:false,status:429})}),/rate limited/);});

test('long prose sections end at sentence boundaries without losing or moving words',()=>{
 const sentences=Array.from({length:35},(_,i)=>`Sentence${i} ${Array.from({length:22},()=> 'word').join(' ')} ends.`);
 const text=sentences.join(' '),chunks=chunkText(text);
 assert.ok(chunks.length>1);
 assert.ok(chunks.every(c=>/^Sentence\d+ /.test(c.text)&&c.text.endsWith('ends.')));
 assert.deepEqual(chunks.map(c=>c.text).join(' ').split(/\s+/),text.split(/\s+/));
 assert.ok(chunks.every(c=>c.text.split(/\s+/).length<=500));
});

test('Gemini schema requests blended emotional direction and validates returned catalog fields',async()=>{
 const section={...item(0),sceneProfile:'bittersweet',secondaryMood:'happy',tension:.3,texture:'felt'},chunks=[{id:0,text:words(100)}];
 await analyze(chunks,{key:'test',fetcher:async(url,options)=>{
  const body=JSON.parse(options.body),fields=body.generationConfig.responseJsonSchema.properties.sections.items;
  for(const field of ['sceneProfile','secondaryMood','tension','texture'])assert.ok(fields.required.includes(field));
  assert.match(body.systemInstruction.parts[0].text,/quiet-focus/);assert.match(body.systemInstruction.parts[0].text,/Never rewrite/);
  return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({overallTone:'Reflective',sections:[section]})}]}}]})};
 }});
 for(const bad of [{sceneProfile:'unknown'},{secondaryMood:'rage'},{tension:2},{texture:'vocals'}])assert.throws(()=>validateAnalysis({overallTone:'Reflective',sections:[{...section,...bad}]},chunks),/soundtrack direction/);
});
