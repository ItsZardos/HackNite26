import {SCENE_IDS,TEXTURES} from '../extension/public/music/catalog.js';
export const MOODS = ['calm','happy','hopeful','melancholy','mysterious','tense','dark','triumphant'];
export function chunkText(text) {
  if (typeof text !== 'string' || text.trim().length < 80) throw new Error('Please provide at least 80 characters of reading text.');
  if (text.length > 100000) throw new Error('Please use an article under 100,000 characters.');
  const paragraphs = text.trim().split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const units = paragraphs.flatMap(p => {
    const words = p.split(/\s+/);
    if (words.length <= 500) return [p];
    const sentences=Array.from(new Intl.Segmenter(undefined,{granularity:'sentence'}).segment(p),s=>s.segment.trim()).filter(Boolean);
    const parts=[];let section=[],count=0;
    const finish=()=>{if(section.length)parts.push(section.join(' '));section=[];count=0;};
    for(const sentence of sentences){
      const sentenceWords=sentence.split(/\s+/);
      // Only a single oversized sentence requires a hard split to respect
      // the API section limit. Normal prose always breaks at sentence ends.
      if(sentenceWords.length>500){finish();for(let i=0;i<sentenceWords.length;i+=400)parts.push(sentenceWords.slice(i,i+400).join(' '));continue;}
      if(count+sentenceWords.length>500)finish();
      section.push(sentence);count+=sentenceWords.length;
      if(count>=400)finish();
    }
    finish();return parts;
  });
  const result=[]; let group=[], count=0;
  const flush=()=>{if(group.length)result.push({id:result.length,text:group.join('\n\n')});group=[];count=0;};
  for (const p of units) { const n=p.split(/\s+/).length; if(count+n>500)flush(); group.push(p);count+=n;if(count>=300)flush(); }
  flush(); if(result.length>60)throw new Error('Please use a shorter article (maximum 60 sections).'); return result;
}
export const schema = {type:'object',properties:{overallTone:{type:'string'},sections:{type:'array',items:{type:'object',properties:{id:{type:'integer'},mood:{type:'string',enum:MOODS},intensity:{type:'number',minimum:0,maximum:1},energy:{type:'number',minimum:0,maximum:1},brightness:{type:'number',minimum:0,maximum:1},musicPrompt:{type:'string'},sceneProfile:{type:'string',enum:SCENE_IDS},secondaryMood:{type:'string',enum:MOODS},tension:{type:'number',minimum:0,maximum:1},texture:{type:'string',enum:TEXTURES}},required:['id','mood','intensity','energy','brightness','musicPrompt','sceneProfile','secondaryMood','tension','texture']}}},required:['overallTone','sections']};
export function validateAnalysis(data, chunks) {
  if(!data || typeof data.overallTone!=='string' || !Array.isArray(data.sections) || data.sections.length!==chunks.length)throw new Error('Gemini returned an incomplete score. Please try again.');
  const byId=new Map();
  for(const s of data.sections){
    if(!Number.isInteger(s.id)||s.id<0||s.id>=chunks.length||byId.has(s.id)||!MOODS.includes(s.mood)||typeof s.musicPrompt!=='string'||s.musicPrompt.length>2000||!['intensity','energy','brightness'].every(k=>Number.isFinite(s[k])&&s[k]>=0&&s[k]<=1))throw new Error('Gemini returned invalid emotional metadata. Please try again.');
    if(s.sceneProfile!==undefined&&!SCENE_IDS.includes(s.sceneProfile)||s.secondaryMood!==undefined&&!MOODS.includes(s.secondaryMood)||s.texture!==undefined&&!TEXTURES.includes(s.texture)||s.tension!==undefined&&(!Number.isFinite(s.tension)||s.tension<0||s.tension>1))throw new Error('Gemini returned invalid soundtrack direction. Please try again.');
    byId.set(s.id,s);
  }
  return {overallTone:data.overallTone,sections:chunks.map(c=>({...byId.get(c.id),...c}))};
}
