import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PROFILES,TRACKS,selectTrack} from '../extension/public/music/catalog.js';
import {renderTrack} from '../extension/public/music/synth.js';
import {encodeWave} from '../scripts/export-music.js';

test('catalog has 320 uniquely seeded compositions, 16 for every emotional profile',()=>{
 assert.equal(TRACKS.length,320);assert.equal(PROFILES.length,20);
 assert.equal(new Set(TRACKS.map(t=>t.id)).size,320);assert.equal(new Set(TRACKS.map(t=>t.seed)).size,320);
 for(const p of PROFILES)assert.equal(TRACKS.filter(t=>t.profile===p.id).length,16);
 assert.ok(TRACKS.every(t=>t.license==='CC0-1.0'&&t.duration===48&&t.bpm===80));
});
test('Gemini scene profiles and musical dimensions affect the chosen composition',()=>{
 const mixed={text:'They smiled, unsure what waited beyond the door.',mood:'happy',secondaryMood:'tense',sceneProfile:'nervous-excitement',energy:.4,brightness:.67,tension:.58,texture:'felt'};
 const track=selectTrack(mixed);assert.equal(track.profile,'nervous-excitement');
 const study=selectTrack({...mixed,mood:'calm',sceneProfile:'quiet-focus',energy:.1,tension:.05});assert.equal(study.profile,'quiet-focus');
 assert.notEqual(track.id,study.id);
});
test('selection avoids the last twelve tracks and varies deterministically',()=>{
 const section={mood:'calm',sceneProfile:'quiet-focus',text:'Focus on this reading.'},recent=[];
 assert.equal(selectTrack(section).id,selectTrack(section).id);
 for(let i=0;i<32;i++){const track=selectTrack(section,{recent,salt:i});assert.ok(!recent.slice(-12).includes(track.id));assert.equal(track.profile,'quiet-focus');recent.push(track.id);}
 assert.ok(new Set(recent).size>=13);
});
test('rendered emotional profiles are distinct, quiet stereo loops with consistent level',()=>{
 const hashes=new Set();
 for(const profile of PROFILES){
  const track=TRACKS.find(t=>t.profile===profile.id),a=renderTrack(track,4000);
  assert.equal(a.channels.length,2);assert.equal(a.channels[0].length,48*4000);
  let peak=0,power=0,step=0;
  for(const c of a.channels)for(let i=0;i<c.length;i++){assert.ok(Number.isFinite(c[i]));peak=Math.max(peak,Math.abs(c[i]));power+=c[i]**2;if(i)step=Math.max(step,Math.abs(c[i]-c[i-1]));}
  const rms=Math.sqrt(power/(a.channels[0].length*2));assert.ok(rms>.065&&rms<.076);assert.ok(peak<=.421);
  for(const c of a.channels)assert.ok(Math.abs(c[0]-c.at(-1))<=step*1.02,'loop join should be no sharper than ordinary audio');
  hashes.add(createHash('sha256').update(Buffer.from(a.channels[0].buffer)).digest('hex'));
 }
 assert.equal(hashes.size,20);
});
test('a composition renders reproducibly and different arrangements produce different audio',()=>{
 const a=renderTrack(TRACKS[0],2000),b=renderTrack(TRACKS[0],2000),c=renderTrack(TRACKS[1],2000);
 assert.deepEqual(a.channels,b.channels);assert.notDeepEqual(a.channels,c.channels);
});

test('exported compositions use standard complete stereo PCM WAV files',()=>{
 const audio=renderTrack(TRACKS[0],4000),bytes=encodeWave(audio);
 assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');
 assert.equal(bytes.readUInt32LE(4)+8,bytes.length);assert.equal(bytes.readUInt16LE(20),1);
 assert.equal(bytes.readUInt16LE(22),2);assert.equal(bytes.readUInt16LE(34),16);
 assert.equal(bytes.readUInt32LE(24),4000);assert.equal(bytes.readUInt32LE(40),48*4000*4);
});
