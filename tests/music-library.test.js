import test from 'node:test';
import assert from 'node:assert/strict';
import {MusicLibrary} from '../extension/reader/music-library.js';

test('recordings load from the extension and decode as ordinary audio files',async t=>{
 const previous=globalThis.fetch,requests=[];t.after(()=>{globalThis.fetch=previous;});
 globalThis.fetch=async(url,options)=>{requests.push({url:String(url),signal:options.signal});return {ok:true,arrayBuffer:async()=>new ArrayBuffer(16)};};
 const library=new MusicLibrary({decodeAudioData:async bytes=>({duration:58,bytes:bytes.byteLength})});
 const buffer=await library.load({id:'example',file:'recordings/example.mp3'});
 assert.equal(buffer.duration,58);assert.equal(buffer.bytes,16);
 assert.match(requests[0].url,/\/extension\/public\/music\/recordings\/example.mp3$/);assert.ok(requests[0].signal);
 await assert.rejects(library.load({file:'https://example.com/music.mp3'}),/Unknown recording/);
 await assert.rejects(library.load({file:'recordings/../../secret.mp3'}),/Unknown recording/);
});
test('missing, corrupt and incomplete recordings fail so the engine can use its WAV fallback',async t=>{
 const previous=globalThis.fetch;t.after(()=>{globalThis.fetch=previous;});
 const track={id:'example',file:'recordings/example.mp3'};
 globalThis.fetch=async()=>({ok:false,status:404});
 await assert.rejects(new MusicLibrary({}).load(track),/404/);
 globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(16)});
 await assert.rejects(new MusicLibrary({decodeAudioData:async()=>{throw new Error('Decode failed');}}).load(track),/Decode failed/);
 await assert.rejects(new MusicLibrary({decodeAudioData:async()=>({duration:0})}).load(track),/Incomplete recording/);
});
