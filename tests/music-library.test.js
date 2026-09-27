import test from 'node:test';
import assert from 'node:assert/strict';
import {MusicLibrary} from '../extension/reader/music-library.js';

test('worker rendering copies complete stereo audio and transfers errors to the caller',async t=>{
 const old=globalThis.Worker;let worker;
 globalThis.Worker=class {constructor(){worker=this;}postMessage(data){this.request=data;}terminate(){this.stopped=true;}};
 t.after(()=>{globalThis.Worker=old;});
 const copied=[],context={createBuffer:(channels,length,rate)=>({channels,length,rate,copyToChannel:(data,i)=>copied.push([data.length,i])})};
 const library=new MusicLibrary(context),pending=library.render({id:'quiet-focus-01'});
 worker.onmessage({data:{id:worker.request.id,sampleRate:22050,channels:[new Float32Array(48*22050),new Float32Array(48*22050)]}});
 const audio=await pending;assert.equal(audio.channels,2);assert.deepEqual(copied,[[1058400,0],[1058400,1]]);
 const failure=library.render({id:'unknown'});worker.onmessage({data:{id:worker.request.id,error:'Unknown composition.'}});await assert.rejects(failure,/Unknown composition/);
 const incomplete=library.render({id:'quiet-focus-01'});worker.onmessage({data:{id:worker.request.id,sampleRate:22050,channels:[new Float32Array(1)]}});await assert.rejects(incomplete,/Incomplete/);
 const stopped=library.render({id:'quiet-focus-01'});library.close();await assert.rejects(stopped,/closed/);assert.equal(worker.stopped,true);
});
