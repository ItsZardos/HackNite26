export class MusicLibrary {
 constructor(context){this.context=context;this.pending=new Map();this.sequence=0;}
 render(track){
  if(typeof Worker!=='function')return Promise.reject(new Error('Local music rendering is unavailable.'));
  if(!this.worker){
   this.worker=new Worker(new URL('../public/music/render-worker.js',import.meta.url),{type:'module'});
   this.worker.onmessage=({data})=>{
    const request=this.pending.get(data.id);if(!request)return;
    clearTimeout(request.timer);this.pending.delete(data.id);
    if(data.error){request.reject(new Error(data.error));return;}
    try{
     if(data.channels?.length!==2||data.sampleRate!==22050||data.channels.some(channel=>channel.length!==48*22050))throw new Error('Incomplete rendered composition.');
     const buffer=this.context.createBuffer(2,data.channels[0].length,data.sampleRate);
     data.channels.forEach((channel,index)=>buffer.copyToChannel(channel,index));request.resolve(buffer);
    }catch(error){request.reject(error);}
   };
   this.worker.onerror=()=>this.close(new Error('Local music renderer could not start.'));
  }
  const id=++this.sequence;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>this.close(new Error('Local music rendering timed out.')),15000);
   this.pending.set(id,{resolve,reject,timer});
   try{this.worker.postMessage({id,trackId:track.id});}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}
  });
 }
 close(error=new Error('Music renderer closed.')){
  this.worker?.terminate();this.worker=null;
  for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(error);}
  this.pending.clear();
 }
}
