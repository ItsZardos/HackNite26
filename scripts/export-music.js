import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {TRACKS} from '../extension/public/music/catalog.js';
import {renderTrack} from '../extension/public/music/synth.js';
export function encodeWave(audio){
 const frames=audio.channels[0].length,channels=audio.channels.length,bytes=Buffer.alloc(44+frames*channels*2);
 bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(channels,22);bytes.writeUInt32LE(audio.sampleRate,24);bytes.writeUInt32LE(audio.sampleRate*channels*2,28);bytes.writeUInt16LE(channels*2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(frames*channels*2,40);
 for(let i=0;i<frames;i++)for(let c=0;c<channels;c++)bytes.writeInt16LE(Math.round(Math.max(-1,Math.min(1,audio.channels[c][i]))*32767),44+(i*channels+c)*2);
 return bytes;
}
export async function exportMusic(ids,directory=new URL('../music-exports/',import.meta.url)){
 const tracks=ids.map(id=>{const track=TRACKS.find(item=>item.id===id);if(!track)throw new Error(`Unknown track: ${id}. Use --list to see the catalog.`);return track;});
 await mkdir(directory,{recursive:true});await copyFile(new URL('../extension/public/music/LICENSE.md',import.meta.url),new URL('LICENSE.md',directory));
 for(const track of tracks){await writeFile(new URL(`${track.id}.wav`,directory),encodeWave(renderTrack(track)));console.log(`Exported ${track.id}.wav`);}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const args=process.argv.slice(2);
 if(args[0]==='--list')console.log(TRACKS.map(track=>`${track.id}\t${track.title}`).join('\n'));
 else if(!args.length)console.log('Usage: npm run music:export -- <track-id> | --all | --list\nExports 48-second stereo WAVs to music-exports/. --all needs about 1.4 GB.');
 else await exportMusic(args[0]==='--all'?TRACKS.map(track=>track.id):args);
}
