// Original Undertone compositions and rendered audio: CC0-1.0. See LICENSE.md.
// Common C-major / A-minor pitch material keeps neighboring scenes compatible.
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
const names=['Still water','Paper lantern','Window light','Slow morning','Quiet steps','Distant shore','Small hours','Open sky','Soft rain','Evening room','Long shadows','Drifting clouds','Afterglow','Hushed garden','First light','Homeward'];
const clamp=value=>Math.max(0,Math.min(1,value));
export function hash(text){let value=2166136261;for(const c of String(text)){value^=c.codePointAt(0);value=Math.imul(value,16777619);}return value>>>0;}
export const TRACKS=PROFILES.flatMap((profile,p)=>names.map((name,v)=>({
 id:`${profile.id}-${String(v+1).padStart(2,'0')}`,title:`${name} · ${profile.name}`,profile:profile.id,
 mood:profile.mood,secondaryMood:profile.secondaryMood,energy:clamp(profile.energy+(v%4-1.5)*.045),
 brightness:clamp(profile.brightness+(Math.floor(v/4)-1.5)*.045),tension:profile.tension,
 texture:TEXTURES[v%TEXTURES.length],seed:hash(`${profile.id}:${v}:undertone-1`),variation:v,
 progression:(p*3+v)%8,duration:48,bpm:80,key:'C major / A minor',license:'CC0-1.0'
})));
export function selectTrack(section,{recent=[],salt=0}={}){
 const available=TRACKS.filter(track=>!recent.slice(-12).includes(track.id));
 const ranked=available.map(track=>{
  const distance=(key,fallback)=>Math.abs(track[key]-(Number.isFinite(section[key])?section[key]:fallback));
  let cost=track.mood===section.mood?0:3;
  if(section.sceneProfile)cost+=track.profile===section.sceneProfile?-5:0;
  if(section.secondaryMood)cost+=track.secondaryMood===section.secondaryMood?-.6:0;
  if(section.texture)cost+=track.texture===section.texture?-.12:0;
  cost+=distance('energy',.2)*1.1+distance('brightness',.5)+distance('tension',.2)*.7;
  // Stable within a reading, varied between passages and successive arrangements.
  cost+=(hash(`${section.text||''}:${track.id}:${salt}`)%1000)/1000*.24;
  return {track,cost};
 }).sort((a,b)=>a.cost-b.cost);
 return ranked[0].track;
}
