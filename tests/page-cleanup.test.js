import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,validatePageAnalysis} from '../server/gemini.js';
const paragraph='Mara followed the path along the sea and watched the distant lighthouse turn in the morning light.';
const chunks=[{id:0,text:`Home · Subscribe · Search\n\n${paragraph}\n\nAccept all cookies`}];
const item=(ids)=>({id:0,mood:'calm',intensity:.2,energy:.3,brightness:.7,musicPrompt:'Soft strings',keepParagraphIds:ids});
const output=ids=>({overallTone:'Reflective',sections:[item(ids)]});

test('page cleanup preserves chosen article text exactly and removes only selected paragraphs',()=>{
 const score=validatePageAnalysis(output([1]),chunks);
 assert.equal(score.sections[0].text,paragraph);
 assert.equal(score.sections[0].id,0);
 assert.equal(score.sections[0].keepParagraphIds,undefined);
});

test('cleanup rejects invented, reordered, duplicate, fractional and missing paragraph IDs',()=>{
 for(const ids of [[8],[1,1],[2,1],[.5],undefined]) assert.throws(()=>validatePageAnalysis(output(ids),chunks),/invalid page selection/);
 assert.throws(()=>validatePageAnalysis(output([]),chunks),/enough article text/);
});

test('discarded furniture sections are removed and retained sections are renumbered',()=>{
 const more=[{id:0,text:'Home · Subscribe · Search'},{id:1,text:paragraph}];
 const score=validatePageAnalysis({overallTone:'Quiet',sections:[item([]),{...item([0]),id:1}]},more);
 assert.equal(score.sections.length,1);
 assert.equal(score.sections[0].id,0);
 assert.equal(score.sections[0].text,paragraph);
});

test('scan performs paragraph selection and scoring in one structured Gemini request',async()=>{
 let calls=0;
 const score=await analyze(chunks,{key:'test',cleanPage:true,fetcher:async(url,options)=>{
  calls++;
  const body=JSON.parse(options.body);
  assert.ok(body.generationConfig.responseJsonSchema.properties.sections.items.required.includes('keepParagraphIds'));
  assert.deepEqual(JSON.parse(body.contents[0].parts[0].text)[0].paragraphs.map(p=>p.id),[0,1,2]);
  assert.match(body.systemInstruction.parts[0].text,/untrusted/);
  return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(output([1]))}]}}]})};
 }});
 assert.equal(calls,1);
 assert.equal(score.source,'gemini');
 assert.equal(score.sections[0].text,paragraph);
});
