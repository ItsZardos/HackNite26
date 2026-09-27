// Demo recordings ship with the extension. No third-party requests during play.
export class MusicLibrary {
 constructor(context){this.context=context;}
 async load(track){
  if(!/^recordings\/[a-z0-9-]+\.mp3$/.test(track?.file||''))throw new Error('Unknown recording.');
  const url=new URL(`../public/music/${track.file}`,import.meta.url);
  const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`Recording unavailable (${track.id}, HTTP ${response.status}).`);
  const buffer=await this.context.decodeAudioData(await response.arrayBuffer());
  if(!Number.isFinite(buffer.duration)||buffer.duration<3)throw new Error('Incomplete recording.');
  return buffer;
 }
}
