import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {selectTrack} from '../extension/public/music/catalog.js';

const audioURL=new URL('../extension/reader/audio.js',import.meta.url);
const audioCode=(await readFile(audioURL,'utf8'))
  .replace(/^import .*;\n/gm,'')
  .replace('export class AudioEngine','class AudioEngine')
  .replaceAll('import.meta.url',JSON.stringify(audioURL.href));

function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}

function audioHarness({fetchResponse,decode,resume,hold=false,supported=true,libraryRender}={}){
  const sources=[],gains=[],requests=[],timers=new Map();
  let context;
  class Param{
    constructor(){this.value=1;this.events=[];if(hold)this.cancelAndHoldAtTime=time=>this.events.push({type:'hold',time});}
    cancelScheduledValues(time){this.events.push({type:'cancel',time});}
    setValueAtTime(value,time){this.value=value;this.events.push({type:'set',value,time});}
    linearRampToValueAtTime(value,time){this.events.push({type:'ramp',value,time});}
    setTargetAtTime(value,time,constant){this.events.push({type:'target',value,time,constant});}
  }
  class Node{
    constructor(){this.connections=[];this.disconnected=false;}
    connect(target){this.connections.push(target);return target;}
    disconnect(){this.disconnected=true;}
  }
  class Context{
    constructor(){context=this;this.currentTime=10;this.state='suspended';this.destination={};this.resumeCalls=0;}
    resume(){this.resumeCalls++;this.state='running';return resume?resume():Promise.resolve();}
    createGain(){const gain=new Node();gain.gain=new Param();gains.push(gain);return gain;}
    createBufferSource(){
      const source=new Node();source.starts=[];source.stops=0;
      source.start=(...args)=>source.starts.push(args);
      source.stop=()=>source.stops++;
      sources.push(source);return source;
    }
    decodeAudioData(bytes){return decode?decode(bytes):Promise.resolve({duration:8,mood:bytes.mood});}
  }
  const globals={
    URL,console,selectTrack,MusicLibrary:class { async render(track){if(libraryRender)return libraryRender(track);throw new Error('Renderer unavailable in legacy harness');} },
    AudioContext:supported?Context:undefined,
    window:{AudioContext:supported?Context:undefined},
    fetch:async url=>{
      const mood=new URL(url).pathname.split('/').at(-1).replace('.wav','');
      requests.push(mood);
      if(fetchResponse)return fetchResponse(mood);
      return {ok:true,arrayBuffer:async()=>Object.assign(new ArrayBuffer(8),{mood})};
    },
    setTimeout:(callback,delay)=>{const id={unref(){}};timers.set(id,{callback,delay});return id;},
    clearTimeout:id=>timers.delete(id)
  };
  vm.runInNewContext(`${audioCode}\nglobalThis.engine=new AudioEngine();`,globals);
  return {
    engine:globals.engine,sources,gains,requests,
    get context(){return context;},
    rotate(){for(const [id,{callback,delay}]of [...timers])if(delay===44800){timers.delete(id);callback();}},
    finishFades(){
      for(const [id,{callback,delay}]of [...timers])if(delay<10000){timers.delete(id);callback();}
    }
  };
}

const ramps=source=>source.connections[0].gain.events.filter(event=>event.type==='ramp');

test('playback works without cancelAndHoldAtTime and the first track fades in promptly',async()=>{
  const h=audioHarness();await h.engine.play();
  assert.equal(h.sources.length,1);
  assert.equal(h.sources[0].starts.length,1);
  assert.equal(h.sources[0].loop,true);
  const firstRamp=ramps(h.sources[0]).at(-1);
  assert.ok(firstRamp.value>0);
  assert.equal(firstRamp.time-h.context.currentTime,.25);
  h.engine.pause();
});

test('audio context resumes synchronously from the play gesture before loading audio',async()=>{
  const resumed=deferred(),h=audioHarness({resume:()=>resumed.promise});
  const playing=h.engine.play();
  assert.equal(h.context.resumeCalls,1);
  assert.equal(h.requests.length,0);
  resumed.resolve();await playing;
  assert.equal(h.sources[0].starts.length,1);
  h.engine.pause();
});

test('pausing while audio is decoding prevents delayed playback',async()=>{
  const entered=deferred(),decoded=deferred();
  const h=audioHarness({decode:()=>{entered.resolve();return decoded.promise;}});
  const playing=h.engine.play();await entered.promise;
  h.engine.pause();decoded.resolve({duration:8,mood:'calm'});await playing;
  assert.equal(h.sources.length,0);
});

test('pausing while context resume is pending prevents playback',async()=>{
  const resumed=deferred(),h=audioHarness({resume:()=>resumed.promise});
  const playing=h.engine.play();h.engine.pause();resumed.resolve();await playing;
  assert.equal(h.requests.length,0);
  assert.equal(h.sources.length,0);
});

test('rapid mood changes start only the latest decoded track',async()=>{
  const pending=new Map(),entered=new Map(['tense','mysterious'].map(mood=>[mood,deferred()]));
  const h=audioHarness({decode:bytes=>{
    if(bytes.mood==='calm')return Promise.resolve({duration:8,mood:'calm'});
    const result=deferred();pending.set(bytes.mood,result);entered.get(bytes.mood).resolve();return result.promise;
  }});
  await h.engine.play();
  const older=h.engine.setMood('tense',.7);await entered.get('tense').promise;
  const latest=h.engine.setMood('mysterious',.4);await entered.get('mysterious').promise;
  pending.get('mysterious').resolve({duration:8,mood:'mysterious'});await latest;
  pending.get('tense').resolve({duration:8,mood:'tense'});await older;
  assert.deepEqual(h.sources.filter(source=>source.starts.length).map(source=>source.buffer.mood),['calm','mysterious']);
  assert.ok(Math.abs(ramps(h.sources[1]).at(-1).time-h.context.currentTime-3.2)<1e-9);
  h.engine.pause();
});

test('crossfade cleanup stops and disconnects the old track while the current track keeps playing',async()=>{
  const h=audioHarness();await h.engine.play();h.context.currentTime+=1;
  await h.engine.setMood('tense',.8);h.finishFades();
  assert.equal(h.sources[0].stops,1);
  assert.equal(h.sources[0].disconnected,true);
  assert.equal(h.sources[0].connections[0].disconnected,true);
  assert.equal(h.sources[1].stops,0);
  assert.equal(h.sources[1].disconnected,false);
  h.engine.pause();h.finishFades();
  assert.equal(h.sources[1].stops,1);
  assert.equal(h.sources[1].disconnected,true);
});

test('interrupting a crossfade preserves the current audible gain instead of jumping',async()=>{
  const h=audioHarness();await h.engine.play();h.context.currentTime+=1;
  const firstTarget=ramps(h.sources[0]).at(-1).value;
  await h.engine.setMood('tense',.8);
  const secondTarget=ramps(h.sources[1]).at(-1).value;
  h.context.currentTime+=1.6;
  await h.engine.setMood('mysterious',.4);
  const heldGain=source=>source.connections[0].gain.events.filter(event=>event.type==='set').at(-1).value;
  assert.ok(Math.abs(heldGain(h.sources[0])-firstTarget/2)<1e-9);
  assert.ok(Math.abs(heldGain(h.sources[1])-secondTarget/2)<1e-9);
  assert.equal(h.sources[0].starts.length,1);
  assert.equal(h.sources[1].starts.length,1);
  h.engine.pause();
});

test('failed soundtrack fetch can be retried successfully',async()=>{
  let attempts=0;
  const h=audioHarness({fetchResponse:async mood=>{
    if(++attempts===1)return {ok:false,status:404};
    return {ok:true,arrayBuffer:async()=>Object.assign(new ArrayBuffer(8),{mood})};
  }});
  await assert.rejects(h.engine.play(),/load|fetch|soundtrack|audio/i);
  assert.equal(h.sources.length,0);
  await h.engine.play();
  assert.equal(attempts,2);
  assert.equal(h.sources[0].starts.length,1);
  h.engine.pause();
});

test('an unreachable soundtrack reports recovery instructions and allows retry',async()=>{
  let attempts=0;
  const h=audioHarness({fetchResponse:async mood=>{
    if(++attempts===1)throw new Error('Failed to fetch');
    return {ok:true,arrayBuffer:async()=>Object.assign(new ArrayBuffer(8),{mood})};
  }});
  await assert.rejects(h.engine.play(),/reload|repository|connection/i);
  await h.engine.play();
  assert.equal(h.sources[0].starts.length,1);
  h.engine.pause();
});

test('failed soundtrack decode can be retried successfully',async()=>{
  let attempts=0;
  const h=audioHarness({decode:async bytes=>{
    if(++attempts===1)throw new Error('Invalid audio data');
    return {duration:8,mood:bytes.mood};
  }});
  await assert.rejects(h.engine.play(),/decode|audio|soundtrack/i);
  assert.equal(h.sources.length,0);
  await h.engine.play();
  assert.equal(h.requests.length,2);
  assert.equal(h.sources[0].starts.length,1);
  h.engine.pause();
});

test('unsupported Web Audio reports an actionable error',async()=>{
  const h=audioHarness({supported:false});
  await assert.rejects(h.engine.play(),/support|available|browser/i);
  assert.equal(h.requests.length,0);
});

test('prefetch warms the upcoming mood without starting another voice',async()=>{
 const h=audioHarness();await h.engine.preload('tense');assert.deepEqual(h.requests,[]);
 await h.engine.play();await h.engine.preload('tense');
 assert.deepEqual(h.requests,['calm','tense']);assert.equal(h.sources.length,1);
 const transition=await h.engine.setMood('tense',.7);
 assert.equal(transition.duration,3.2);assert.deepEqual(h.requests,['calm','tense']);
 assert.equal(h.sources.length,2);h.engine.pause();
});

test('cleanup keeps the audible track alive while a later mood is still decoding',async()=>{
 const entered=deferred(),decoded=deferred();
 const h=audioHarness({decode:bytes=>{
  if(bytes.mood==='happy'){entered.resolve();return decoded.promise;}
  return Promise.resolve({duration:8,mood:bytes.mood});
 }});
 await h.engine.play();await h.engine.setMood('tense',.7);
 const next=h.engine.setMood('happy',.4);await entered.promise;
 h.finishFades();
 assert.equal(h.sources[1].stops,0,'the last committed track must keep playing during a download');
 decoded.resolve({duration:8,mood:'happy'});await next;h.finishFades();
 assert.equal(h.sources[1].stops,1);assert.equal(h.sources[2].stops,0);h.engine.pause();h.finishFades();
});
test('identical moods do not restart their ramp, and pause fades out before stopping',async()=>{
 const h=audioHarness();await h.engine.play();const before=ramps(h.sources[0]).length;
 await h.engine.setMood('calm',.3);assert.equal(ramps(h.sources[0]).length,before);
 h.engine.pause();assert.equal(h.engine.playing,false);assert.equal(h.sources[0].stops,0);
 assert.equal(ramps(h.sources[0]).at(-1).value,0);h.finishFades();assert.equal(h.sources[0].stops,1);
});
test('an old pause cleanup cannot stop a freshly resumed voice',async()=>{
 const h=audioHarness();await h.engine.play();h.engine.pause();await h.engine.play();
 h.finishFades();assert.equal(h.sources[0].stops,1);assert.equal(h.sources[1].stops,0);h.engine.pause();h.finishFades();
});

test('Gemini scene direction selects a rendered composition and repeats keep the same voice',async()=>{
 const rendered=[],h=audioHarness({libraryRender:async track=>{rendered.push(track);return {duration:48};}});
 const scene={mood:'happy',secondaryMood:'tense',sceneProfile:'nervous-excitement',intensity:.5,energy:.3,brightness:.6,tension:.5,text:'Nervous anticipation.'};
 await h.engine.setScene(scene);assert.equal(rendered.length,0);await h.engine.play();
 assert.equal(rendered[0].profile,'nervous-excitement');assert.equal(h.requests.length,0);assert.equal(h.sources.length,1);
 await h.engine.setScene({...scene,text:'The anticipation continues.'});assert.equal(h.sources.length,1);
 h.rotate();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.sources.length,2);assert.notEqual(rendered[0].id,rendered[1].id);
 h.engine.pause();h.finishFades();assert.equal(h.engine.playing,false);
});
test('unavailable rendering falls back to a playable bundled WAV and reports the fallback',async()=>{
 const h=audioHarness(),changes=[];h.engine.onTrackChange=event=>changes.push(event);
 await h.engine.setScene({mood:'calm',intensity:.2,sceneProfile:'quiet-focus'});await h.engine.play();
 assert.deepEqual(h.requests,['calm']);assert.equal(h.sources.length,1);assert.equal(changes[0].fallback,true);
 h.engine.pause();h.finishFades();
});
test('rendered buffer cache remains bounded across many scene changes',async()=>{
 const h=audioHarness({libraryRender:async()=>({duration:48})});await h.engine.play();
 for(const mood of ['happy','hopeful','melancholy','mysterious','tense','dark','triumphant']){
  await h.engine.setScene({mood,intensity:.3});h.finishFades();assert.ok(h.engine.buffers.size<=4);
 }
 h.engine.pause();h.finishFades();
});

test('returning to the audible track during a pending change restores automatic variation',async()=>{
 const waiting=deferred(),entered=deferred();let block=false;
 const h=audioHarness({libraryRender:async()=>{if(block){entered.resolve();return waiting.promise;}return {duration:48};}});
 const scene={mood:'calm',intensity:.2,sceneProfile:'quiet-focus'};
 await h.engine.setScene(scene);await h.engine.play();const original=h.engine.track;
 block=true;const pending=h.engine.setMood('tense',.3,{id:'pending-track'});await entered.promise;
 await h.engine.setMood(scene.mood,scene.intensity,original);
 waiting.resolve({duration:48});await pending;assert.equal(h.sources.length,1);
 block=false;h.rotate();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.sources.length,2,'the next variation must still start after a cancelled change');
 h.engine.pause();h.finishFades();
});
