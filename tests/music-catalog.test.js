import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PROFILES,TRACKS,selectTrack} from '../extension/public/music/catalog.js';
const music=new URL('../extension/public/music/',import.meta.url);

test('the catalog ships 45 real, distinct MP3s with CC0 sources and accurate checksums',async()=>{
 assert.equal(TRACKS.length,45);assert.equal(new Set(TRACKS.map(t=>t.id)).size,45);
 const files=await readdir(new URL('recordings/',music));assert.equal(files.length,45);
 const hashes=new Set();
 for(const track of TRACKS){
  assert.equal(track.license,'CC0-1.0');assert.ok(track.artist&&track.title);
  assert.match(track.source,/^https:\/\/opengameart.org\/content\//);
  assert.match(track.file,/^recordings\/[a-z0-9-]+\.mp3$/);
  assert.ok(track.duration>=20&&track.duration<=60);
  const data=await readFile(new URL(track.file,music));assert.ok(data.length>100000);
  assert.equal(data.toString('ascii',0,3),'ID3');
  const hash=createHash('sha256').update(data).digest('hex');assert.equal(hash,track.sha256);hashes.add(hash);
 }
 assert.equal(hashes.size,45);
 const sources=JSON.parse(await readFile(new URL('sources.json',music)));
 assert.equal(sources.tracks.length,45);assert.equal(new Set(sources.tracks.map(t=>t.decodedSha256)).size,45);
 assert.ok(sources.tracks.every(t=>t.peak<.96&&t.duration>=20));
});
test('every Gemini scene profile has at least three matching recordings',()=>{
 assert.equal(PROFILES.length,20);
 for(const p of PROFILES)assert.ok(TRACKS.filter(t=>t.profiles.includes(p.id)).length>=3,p.id);
});
test('selection follows the Gemini profile and repeats remain within that profile',()=>{
 for(const sceneProfile of ['quiet-focus','nervous-excitement','quiet-suspense']){
  const scene={sceneProfile,mood:'calm',text:'A reading passage.'},recent=[];
  const pool=TRACKS.filter(t=>t.profiles.includes(sceneProfile));
  for(let i=0;i<pool.length*3;i++){
   const track=selectTrack(scene,{recent,salt:i});assert.ok(track.profiles.includes(sceneProfile));
   if(recent.length)assert.notEqual(track.id,recent.at(-1));
   if(i<pool.length)assert.ok(!recent.includes(track.id));recent.push(track.id);
  }
 }
});
test('legacy Gemini metadata still selects the requested mood deterministically',()=>{
 for(const mood of ['calm','happy','hopeful','melancholy','mysterious','tense','dark','triumphant']){
  const scene={mood,text:'The same passage.'};assert.equal(selectTrack(scene).id,selectTrack(scene).id);
  assert.equal(selectTrack(scene).mood,mood);
 }
});
