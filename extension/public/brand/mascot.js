const button=document.querySelector('.mascot-toggle');
const preference=matchMedia('(prefers-reduced-motion: reduce)');
let paused=false,greeting;
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
function greet(){
 if(paused||preference.matches)return;
 clearTimeout(greeting);document.body.dataset.mascotGreeting='true';
 greeting=setTimeout(()=>{delete document.body.dataset.mascotGreeting;},1200);
}
button.addEventListener('pointerenter',greet);
button.addEventListener('focus',greet);
addEventListener('storage',event=>{
 if(event.key==='undertone-mascot-paused'){paused=event.newValue==='true';update();}
});
function visibility(){document.body.dataset.mascotHidden=String(document.hidden);}
document.addEventListener('visibilitychange',visibility);visibility();
preference.addEventListener('change',update);update();
if(!document.querySelector('#play'))greet();
