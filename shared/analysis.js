export const MOODS = ['calm','happy','hopeful','melancholy','mysterious','tense','dark','triumphant'];
export function chunkText(text) {
  if (typeof text !== 'string' || text.trim().length < 80) throw new Error('Please provide at least 80 characters of reading text.');
  if (text.length > 100000) throw new Error('Please use an article under 100,000 characters.');
  const paragraphs = text.trim().split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const units = paragraphs.flatMap(p => {
    const words = p.split(/\s+/);
    if (words.length <= 500) return [p];
    const parts = []; for (let i=0;i<words.length;i+=400) parts.push(words.slice(i,i+400).join(' ')); return parts;
  });
  const result=[]; let group=[], count=0;
  const flush=()=>{if(group.length)result.push({id:result.length,text:group.join('\n\n')});group=[];count=0;};
  for (const p of units) { const n=p.split(/\s+/).length; if(count+n>500)flush(); group.push(p);count+=n;if(count>=300)flush(); }
  flush(); if(result.length>60)throw new Error('Please use a shorter article (maximum 60 sections).'); return result;
}
export const schema = {type:'object',properties:{overallTone:{type:'string'},sections:{type:'array',items:{type:'object',properties:{id:{type:'integer'},mood:{type:'string',enum:MOODS},intensity:{type:'number',minimum:0,maximum:1},energy:{type:'number',minimum:0,maximum:1},brightness:{type:'number',minimum:0,maximum:1},musicPrompt:{type:'string'}},required:['id','mood','intensity','energy','brightness','musicPrompt']}}},required:['overallTone','sections']};
export function validateAnalysis(data, chunks) {
  if(!data || typeof data.overallTone!=='string' || !Array.isArray(data.sections) || data.sections.length!==chunks.length)throw new Error('Gemini returned an incomplete score. Please try again.');
  const byId=new Map();
  for(const s of data.sections){
    if(!Number.isInteger(s.id)||s.id<0||s.id>=chunks.length||byId.has(s.id)||!MOODS.includes(s.mood)||typeof s.musicPrompt!=='string'||s.musicPrompt.length>2000||!['intensity','energy','brightness'].every(k=>Number.isFinite(s[k])&&s[k]>=0&&s[k]<=1))throw new Error('Gemini returned invalid emotional metadata. Please try again.');
    byId.set(s.id,s);
  }
  return {overallTone:data.overallTone,sections:chunks.map(c=>({...byId.get(c.id),...c}))};
}
