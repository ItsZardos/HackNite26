import {selectTrack} from '../public/music/catalog.js';
import {MusicLibrary} from './music-library.js';
export class AudioEngine {
 constructor() {
  this.buffers = new Map(); this.voices = new Map();
  this.playing = false; this.volume = .35; this.mood = 'calm'; this.intensity = .3;
  this.recent = []; this.rotationCount = 0; this.scene = null; this.track = null;
  this.playToken = 0; this.generation = 0; this.activeMood = null; this.activeIntensity = null;
 }

 async prepare() {
  if (!this.context) {
   const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
   if (!Context) throw new Error('Audio is unavailable in this preview. Open the reader in Chrome, Edge, Firefox, or Safari.');
   this.context = new Context(); this.master = this.context.createGain();
   this.master.gain.value = this.volume; this.master.connect(this.context.destination);
  }
  // Resume from the Play click, before fetching or decoding audio.
  await this.context.resume();
  if (this.context.state && this.context.state !== 'running') {
   throw new Error('Your browser paused audio. Allow sound for this site, then press Play again.');
  }
 }

 async buffer(mood, track = null) {
  if (track) {
   if (!this.buffers.has(track.id)) {
    this.library ||= new MusicLibrary(this.context);
    this.buffers.set(track.id, this.library.render(track).then(buffer => ({buffer,fallback:false})).catch(async () => ({buffer:await this.buffer(mood),fallback:true})).catch(error => {this.buffers.delete(track.id);throw error;}));
   }
   const result=await this.buffers.get(track.id);
   // Voices retain their own AudioBuffers. Bound the decoded cache separately.
   while(this.buffers.size>4){const oldest=this.buffers.keys().next().value;this.buffers.delete(oldest);}
   return result;
  }
  if (!this.buffers.has(mood)) {
   const url = new URL(`../public/music/${mood}.wav`, import.meta.url);
   this.buffers.set(mood, (async () => {
    let response;
    try { response = await fetch(url); }
    catch { throw new Error('The soundtrack could not be reached. Pull the complete repository and reload Undertone in chrome://extensions.'); }
    if (!response.ok) throw new Error(`Soundtrack missing (${mood}, HTTP ${response.status}). Pull the latest files, run npm run setup, and reload the extension.`);
    const data = await response.arrayBuffer();
    try { return await this.context.decodeAudioData(data); }
    catch { throw new Error(`The ${mood} soundtrack could not be decoded. Pull the complete repository and run npm run setup. Use Audio Preview to check extension/public/music/${mood}.wav in VS Code.`); }
   })().catch(error => { this.buffers.delete(mood); throw error; }));
  }
  return this.buffers.get(mood);
 }

 async setScene(section) {
  const signature=item=>JSON.stringify([item?.mood,item?.secondaryMood,item?.sceneProfile,item?.texture,...['energy','brightness','tension'].map(key=>Math.round((item?.[key]??.3)*4))]);
  const same=signature(section)===signature(this.scene);
  this.scene=section;
  if(!same||!this.track)this.track=selectTrack(section,{recent:this.recent,salt:this.rotationCount});
  return this.setMood(section.mood,section.intensity,this.track);
 }
 preloadScene(section){
  if(!this.context||!this.playing)return Promise.resolve();
  const track=selectTrack(section,{recent:this.recent,salt:this.rotationCount});
  return this.buffer(section.mood,track).catch(()=>{});
 }
 scheduleRotation(){
  clearTimeout(this.rotation);this.rotation=null;
  if(!this.scene||!this.track||!this.playing)return;
  this.rotation=setTimeout(()=>{
   this.rotation=null;
   if(!this.playing)return;
   this.track=selectTrack(this.scene,{recent:this.recent,salt:++this.rotationCount});
   this.setMood(this.scene.mood,this.scene.intensity,this.track).catch(()=>this.scheduleRotation());
  },44800);
 }

 preload(mood) {
  // Download the upcoming mood only after the listener has started audio.
  if (!this.context || !this.playing) return Promise.resolve();
  return this.buffer(mood).catch(() => {});
 }

 async play() {
  const token = ++this.playToken;
  await this.prepare();
  if (token !== this.playToken) return;
  this.playing = true;
  try { await this.setMood(this.mood, this.intensity, this.track); }
  catch (error) { if (token === this.playToken) this.pause(); throw error; }
 }

 pause() {
  this.playToken++; this.generation++; this.playing = false;
  clearTimeout(this.cleanup); clearTimeout(this.rotation); this.rotation=null;
  for (const voice of this.voices.values()) {
   this.fade(voice, 0, this.context.currentTime, .12);
   setTimeout(() => this.removeVoice(voice), 140);
  }
  this.activeMood = null; this.activeIntensity = null;
  this.voices.clear();
 }

 removeVoice(voice) {
  if (voice.stopped) return;
  voice.stopped = true;
  voice.source.stop(); voice.source.disconnect(); voice.gain.disconnect();
 }

 setVolume(value) {
  this.volume = Math.max(0, Math.min(1, value));
  if (this.master) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, .1);
 }

 fade(voice, target, now, duration) {
  // Preserve interrupted linear fades without cancelAndHoldAtTime, which
  // is unavailable in some browsers.
  const old = voice.fade;
  const progress = old ? Math.max(0, Math.min(1, (now - old.start) / old.duration)) : 1;
  const held = old ? old.from + (old.to - old.from) * progress : 0;
  const param = voice.gain.gain;
  param.cancelScheduledValues(now);
  param.setValueAtTime(held, now);
  param.linearRampToValueAtTime(target, now + duration);
  voice.fade = {from: held, to: target, start: now, duration};
 }

 async setMood(mood, intensity, track = null) {
  const key=track?.id||mood;
  this.mood = mood; this.intensity = intensity;
  if (!this.playing) return;
  const generation = ++this.generation;
  if (this.activeMood === key && this.activeIntensity === intensity) {
   if(!this.rotation)this.scheduleRotation();
   return {duration: 0};
  }
  clearTimeout(this.rotation);this.rotation=null;
  let buffer, fallback=false;
  try { const loaded=await this.buffer(mood,track);buffer=track?loaded.buffer:loaded;fallback=track?loaded.fallback:false; }
  catch (error) { if (this.playing && generation === this.generation) throw error; return; }
  if (!this.playing || generation !== this.generation) return;
  const now = this.context.currentTime;
  const duration = this.voices.size ? 3.2 : .25;
  if (!this.voices.has(key)) {
   const source = this.context.createBufferSource(), gain = this.context.createGain();
   source.buffer = buffer; source.loop = true; gain.gain.value = 0;
   source.connect(gain).connect(this.master); source.start(0, now % buffer.duration);
   this.voices.set(key, {source, gain});
  }
  for (const [voiceKey, voice] of this.voices) this.fade(voice, voiceKey === key ? .68 + .07 * intensity : 0, now, duration);
  this.activeMood = key; this.activeIntensity = intensity;
  clearTimeout(this.cleanup);
  this.cleanup = setTimeout(() => {
   for (const [voiceKey, voice] of this.voices) {
    if (voiceKey !== key) { this.removeVoice(voice); this.voices.delete(voiceKey); }
   }
  }, duration * 1000 + 200);
  if(track){this.recent.push(track.id);this.recent=this.recent.slice(-16);}
  this.onTrackChange?.({track,fallback});this.scheduleRotation();
  return {duration};
 }
}
