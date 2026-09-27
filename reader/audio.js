export class AudioEngine {
 constructor() {
  this.buffers = new Map(); this.voices = new Map();
  this.playing = false; this.volume = .55; this.mood = 'calm'; this.intensity = .3;
  this.playToken = 0; this.generation = 0;
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

 async buffer(mood) {
  if (!this.buffers.has(mood)) {
   const url = new URL(`../public/music/${mood}.wav`, import.meta.url);
   this.buffers.set(mood, (async () => {
    let response;
    try { response = await fetch(url); }
    catch { throw new Error('The soundtrack could not be reached. Run npm start and open the reader from the extension or http://127.0.0.1:8787.'); }
    if (!response.ok) throw new Error(`Soundtrack missing (${mood}, HTTP ${response.status}). Pull the latest files, run npm run setup, and reload the extension.`);
    const data = await response.arrayBuffer();
    try { return await this.context.decodeAudioData(data); }
    catch { throw new Error(`The ${mood} soundtrack could not be decoded. Pull the complete repository and run npm run setup. Use Audio Preview to check public/music/${mood}.wav in VS Code.`); }
   })().catch(error => { this.buffers.delete(mood); throw error; }));
  }
  return this.buffers.get(mood);
 }

 async play() {
  const token = ++this.playToken;
  await this.prepare();
  if (token !== this.playToken) return;
  this.playing = true;
  try { await this.setMood(this.mood, this.intensity); }
  catch (error) { if (token === this.playToken) this.pause(); throw error; }
 }

 pause() {
  this.playToken++; this.generation++; this.playing = false;
  clearTimeout(this.cleanup);
  for (const voice of this.voices.values()) this.removeVoice(voice);
  this.voices.clear();
 }

 removeVoice(voice) {
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

 async setMood(mood, intensity) {
  this.mood = mood; this.intensity = intensity;
  if (!this.playing) return;
  const generation = ++this.generation;
  let buffer;
  try { buffer = await this.buffer(mood); }
  catch (error) { if (this.playing && generation === this.generation) throw error; return; }
  if (!this.playing || generation !== this.generation) return;
  const now = this.context.currentTime;
  const duration = this.voices.size ? 4 : .25;
  if (!this.voices.has(mood)) {
   const source = this.context.createBufferSource(), gain = this.context.createGain();
   source.buffer = buffer; source.loop = true; gain.gain.value = 0;
   source.connect(gain).connect(this.master); source.start(0, now % buffer.duration);
   this.voices.set(mood, {source, gain});
  }
  for (const [key, voice] of this.voices) this.fade(voice, key === mood ? .65 + .25 * intensity : 0, now, duration);
  clearTimeout(this.cleanup);
  this.cleanup = setTimeout(() => {
   for (const [key, voice] of this.voices) {
    if (key !== this.mood) { this.removeVoice(voice); this.voices.delete(key); }
   }
  }, duration * 1000 + 200);
 }
}
