import {TRACKS} from './catalog.js';
import {renderTrack} from './synth.js';
self.onmessage=({data})=>{
 try{
  const track=TRACKS.find(item=>item.id===data.trackId);
  if(!track)throw new Error('Unknown composition.');
  const audio=renderTrack(track);
  self.postMessage({id:data.id,...audio},audio.channels.map(channel=>channel.buffer));
 }catch(error){self.postMessage({id:data.id,error:error.message});}
};
