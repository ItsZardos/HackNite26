// Sample-free additive synthesis. Composition data and output: CC0-1.0.
// Render in a worker so note generation cannot interrupt scrolling or playback.
const chords=[[48,55,60,64],[45,52,57,60],[41,48,57,60],[43,50,59,62],[50,57,62,65],[40,47,55,59],[48,55,59,64],[45,52,59,64]];
const progressions=[[0,2,1,3,0,4,2,3],[1,2,0,3,1,4,2,7],[0,6,2,3,1,2,4,3],[1,7,4,5,2,4,1,7],[2,0,4,3,2,1,6,0],[4,1,5,7,4,2,3,1],[6,0,2,4,1,7,2,3],[1,5,4,7,2,4,6,0]];
function random(seed){let n=seed>>>0;return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
export function renderTrack(track,sampleRate=22050){
 if(!track||!Number.isInteger(track.seed)||!Number.isFinite(sampleRate)||sampleRate<2000||sampleRate>48000)throw new Error('Invalid music rendering request.');
 const duration=48,length=Math.round(sampleRate*duration),left=new Float32Array(length),right=new Float32Array(length),rng=random(track.seed);
 function note(midi,start,seconds,gain,pan,kind){
  const frequency=440*2**((midi-69)/12),count=Math.round(seconds*sampleRate),offset=Math.round(start*sampleRate);
  const l=Math.sqrt((1-pan)/2)*gain,r=Math.sqrt((1+pan)/2)*gain,phase=rng()*Math.PI*2;
  const attack=kind==='pad'?Math.min(2,seconds*.3):track.texture==='airy-pads'?.8:track.texture==='soft-plucks'?.05:.09;
  const release=kind==='pad'?Math.min(3,seconds*.45):Math.min(1.8,seconds*.65);
  for(let i=0;i<count;i++){
   const t=i/sampleRate,a=Math.min(1,t/attack),b=Math.min(1,(seconds-t)/release);
   const envelope=Math.sin(a*Math.PI/2)**2*Math.sin(b*Math.PI/2)**2*(kind==='pad'?1:Math.exp(-t*(track.texture==='airy-pads'?.3:track.texture==='felt'?.9:.65)));
   const w=2*Math.PI*frequency*t;
   const harmonic=kind==='pad'?(track.texture==='warm-strings'?.12:.06):track.texture==='soft-plucks'?.24:track.texture==='felt'?.10:.05;
   const value=(Math.sin(w+phase)+harmonic*Math.sin(2*w+phase*.5)+.025*Math.sin(3*w))*envelope;
   const index=(offset+i)%length;left[index]+=value*l;right[index]+=value*r;
  }
 }
 const reflective=['melancholy','dark','tense','mysterious'].includes(track.mood);
 const progression=progressions[(track.progression%4)*2+(reflective?1:0)];
 for(let bar=0;bar<8;bar++){
  const chord=chords[progression[bar]],start=bar*6;
  // Overlapping slow chords bridge each phrase and the loop boundary.
  chord.forEach((pitch,j)=>note(pitch,start+(j*.14),9,.11+(j===0?.025:0),(j-1.5)*.20,'pad'));
  const count=1+Math.floor(track.energy*5)+(track.variation%3===0?1:0);
  for(let n=0;n<count;n++){
   const slot=Math.floor(rng()*8),pitch=chord[Math.floor(rng()*chord.length)]+12+(track.brightness>.7&&rng()>.7?12:0);
   note(pitch,start+slot*.75,3+rng()*2,.085+track.brightness*.025,(rng()-.5)*.7,'key');
  }
 }
 // Circular, quiet stereo echoes preserve the exact loop seam. No sampled IR.
 const dryL=left.slice(),dryR=right.slice();
 const delay=Math.round(sampleRate*.375),delay2=Math.round(sampleRate*.75);
 let meanL=0,meanR=0;
 for(let i=0;i<length;i++){
  left[i]+=.16*dryR[(i-delay+length)%length]+.07*dryL[(i-delay2+length)%length];
  right[i]+=.16*dryL[(i-delay+length)%length]+.07*dryR[(i-delay2+length)%length];
  meanL+=left[i];meanR+=right[i];
 }
 meanL/=length;meanR/=length;
 let squared=0,peak=0;
 for(let i=0;i<length;i++){left[i]-=meanL;right[i]-=meanR;squared+=left[i]**2+right[i]**2;peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));}
 const rms=Math.sqrt(squared/(length*2)),scale=Math.min(.075/Math.max(rms,1e-9),.42/Math.max(peak,1e-9));
 for(let i=0;i<length;i++){left[i]*=scale;right[i]*=scale;}
 return {channels:[left,right],sampleRate,duration};
}
