const button=document.querySelector('.mascot-toggle');
const preference=matchMedia('(prefers-reduced-motion: reduce)');
let paused=false;
try { paused=localStorage.getItem('undertone-mascot-paused')==='true'; } catch {}
function update(){
 const still=paused||preference.matches;
 document.body.dataset.mascotPaused=String(still);
 button.setAttribute('aria-pressed',String(!still));
 const label=preference.matches?'Mascot animation follows your reduced motion setting':still?'Animate mascot':'Pause mascot animation';
 button.setAttribute('aria-label',label);button.title=label;
}
button.addEventListener('click',()=>{
 if(preference.matches)return;
 paused=!paused;try{localStorage.setItem('undertone-mascot-paused',String(paused));}catch{}update();
});
preference.addEventListener('change',update);update();
