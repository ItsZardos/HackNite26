export class AudioEngine {
 constructor(){this.buffers=new Map();this.voices=new Map();this.playing=false;this.volume=.55;this.mood='calm';this.intensity=.3;}
 async prepare(){
  if(!this.context){this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=this.volume;this.master.connect(this.context.destination);}
  await this.context.resume();
 }
 async buffer(mood){
  if(!this.buffers.has(mood))this.buffers.set(mood,fetch(new URL(`../public/music/${mood}.wav`,import.meta.url)).then(r=>{if(!r.ok)throw new Error('Soundtrack could not load.');return r.arrayBuffer();}).then(b=>this.context.decodeAudioData(b)).catch(e=>{this.buffers.delete(mood);throw e;}));
  return this.buffers.get(mood);
 }
 async play(){const token=this.playToken=(this.playToken||0)+1;await this.prepare();if(token!==this.playToken)return;this.playing=true;try{await this.setMood(this.mood,this.intensity);}catch(e){this.playing=false;throw e;}}
 pause(){this.playToken=(this.playToken||0)+1;clearTimeout(this.cleanup);this.playing=false;this.generation=(this.generation||0)+1;for(const v of this.voices.values()){v.source.stop();v.source.disconnect();v.gain.disconnect();}this.voices.clear();}
 setVolume(value){this.volume=value;if(this.master)this.master.gain.setTargetAtTime(value,this.context.currentTime,.1);}
 async setMood(mood,intensity){
  this.mood=mood;this.intensity=intensity;if(!this.playing)return;
  const generation=this.generation=(this.generation||0)+1;const buffer=await this.buffer(mood);
  if(!this.playing||generation!==this.generation)return;
  const now=this.context.currentTime;
  if(!this.voices.has(mood)){const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=buffer;source.loop=true;gain.gain.value=0;source.connect(gain).connect(this.master);source.start(0,now%buffer.duration);this.voices.set(mood,{source,gain});}
  for(const [key,v] of this.voices){v.gain.gain.cancelAndHoldAtTime(now);v.gain.gain.linearRampToValueAtTime(key===mood?.65+.25*intensity:0,now+4);}
  clearTimeout(this.cleanup);this.cleanup=setTimeout(()=>{for(const [key,v]of this.voices){if(key!==this.mood){v.source.stop();v.source.disconnect();v.gain.disconnect();this.voices.delete(key);}}},4200);
 }
}
