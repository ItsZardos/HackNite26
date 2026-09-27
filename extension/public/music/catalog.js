import {RECORDINGS} from './recordings.js';
// Artist-released CC0 recordings, tagged for Gemini's scene directions.
export const TEXTURES = ['felt','warm-strings','soft-plucks','airy-pads'];
export const PROFILES = [
 ['quiet-focus','Quiet focus','calm','calm',.10,.55,.05],
 ['serene','Serene','calm','hopeful',.12,.65,.04],
 ['peaceful-wonder','Peaceful wonder','calm','mysterious',.18,.65,.12],
 ['warm-contentment','Warm contentment','happy','calm',.22,.75,.05],
 ['gentle-joy','Gentle joy','happy','hopeful',.30,.80,.10],
 ['nervous-excitement','Nervous excitement','happy','tense',.40,.67,.58],
 ['cautious-optimism','Cautious optimism','hopeful','tense',.25,.62,.40],
 ['warm-relief','Warm relief','hopeful','calm',.18,.72,.08],
 ['quiet-courage','Quiet courage','hopeful','triumphant',.30,.65,.30],
 ['bittersweet','Bittersweet','melancholy','happy',.18,.48,.22],
 ['nostalgic','Nostalgic','melancholy','calm',.12,.44,.12],
 ['tender-sadness','Tender sadness','melancholy','hopeful',.10,.36,.22],
 ['curious','Quiet curiosity','mysterious','calm',.22,.52,.25],
 ['uneasy-curiosity','Uneasy curiosity','mysterious','tense',.25,.36,.55],
 ['dreamlike','Dreamlike','mysterious','hopeful',.14,.58,.20],
 ['quiet-suspense','Quiet suspense','tense','mysterious',.30,.30,.68],
 ['uncertainty','Uncertainty','tense','hopeful',.22,.40,.50],
 ['somber','Somber','dark','melancholy',.10,.22,.38],
 ['lonely-night','Lonely night','dark','calm',.12,.28,.28],
 ['restrained-triumph','Restrained triumph','triumphant','hopeful',.38,.78,.22]
].map(([id,name,mood,secondaryMood,energy,brightness,tension])=>({id,name,mood,secondaryMood,energy,brightness,tension}));
export const SCENE_IDS=PROFILES.map(profile=>profile.id);
export const TRACKS=RECORDINGS;
export function hash(text){let value=2166136261;for(const c of String(text)){value^=c.codePointAt(0);value=Math.imul(value,16777619);}return value>>>0;}
export function selectTrack(section,{recent=[],salt=0}={}){
 // Keep rotation inside the same emotional family, even after all of its
 // recordings have been heard. A small library must not rotate into a wrong mood.
 const profile=TRACKS.filter(track=>track.profiles.includes(section.sceneProfile));
 const family=TRACKS.filter(track=>track.mood===section.mood);
 const pool=profile.length?profile:family.length?family:TRACKS;
 const fresh=pool.filter(track=>!recent.slice(-12).includes(track.id));
 if(!fresh.length){
  return [...pool].sort((a,b)=>recent.lastIndexOf(a.id)-recent.lastIndexOf(b.id))[0];
 }
 return fresh.map(track=>{
  const distance=(key,fallback)=>Math.abs(track[key]-(Number.isFinite(section[key])?section[key]:fallback));
  let cost=distance('energy',.2)*1.1+distance('brightness',.5)+distance('tension',.2)*.7;
  if(section.secondaryMood&&track.secondaryMood===section.secondaryMood)cost-=.3;
  if(section.texture&&track.texture===section.texture)cost-=.12;
  cost+=(hash(`${section.text||''}:${track.id}:${salt}`)%1000)/1000*.24;
  return {track,cost};
 }).sort((a,b)=>a.cost-b.cost)[0].track;
}
