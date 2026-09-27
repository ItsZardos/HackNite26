import {AudioEngine} from './audio.js';
import {sectionAtFocus} from './reading-position.js';
const $=id=>document.getElementById(id),audio=new AudioEngine();
let score,current=-1,settleTimer,fadeTimer,soundToken=0,playToken=0,starting=false;
function message(text){$('message').textContent=text;$('message').hidden=!text;}
function status(text){$('play-status').textContent=text;}
function updatePlayButton(){
 $('play').dataset.playing=String(audio.playing||starting);
 $('play').setAttribute('aria-label',audio.playing||starting?'Pause soundtrack':'Play soundtrack');
 $('play').setAttribute('aria-busy',String(starting));
}
function stop(){
 clearTimeout(fadeTimer);soundToken++;playToken++;starting=false;audio.pause();updatePlayButton();status('Paused');
}
$('exit').onclick=async()=>{
 if(typeof globalThis.chrome?.action?.openPopup==='function'){
  try{await chrome.action.openPopup();message('');return;}catch{}
 }
 message('Open Undertone from your browser toolbar, then choose Paste text, Scan page, or Import file.');
};
function preloadNext(){
 if(!audio.playing)return;
 const next=score.sections.slice(current+1).find(section=>section.mood!==score.sections[current].mood);
 if(next)audio.preload(next.mood);
}
async function changeSoundtrack(section){
 const token=++soundToken;clearTimeout(fadeTimer);
 if(audio.playing)status(`Gently moving into ${section.mood}`);
 try{
  const transition=await audio.setMood(section.mood,section.intensity);
  if(token!==soundToken||!audio.playing)return;
  fadeTimer=setTimeout(()=>{if(token===soundToken)status('Playing');},(transition?.duration||0)*1000);
  preloadNext();
 }catch(error){if(token===soundToken){stop();message(error.message);}}
}
function setCurrent(index){
 if(index<0||index===current)return;
 current=index;const section=score.sections[index];
 $('mood').textContent=section.mood;$('mood').setAttribute('aria-label',`Music mood: ${section.mood}`);
 changeSoundtrack(section);
}
function track(){
 clearTimeout(settleTimer);if(!score)return;
 // The upper third approximates the reader's eye line. The soundtrack waits for
 // scrolling to settle, then holds through small movements near the boundary.
 const bottom=Math.max(0,innerHeight-$('player').getBoundingClientRect().height);
 const focus=Math.max(48,bottom*.36);
 const bounds=[...$('sections').children].map(element=>element.getBoundingClientRect());
 const remaining=document.documentElement.scrollHeight-innerHeight-scrollY;
 const atEnd=scrollY>0&&remaining<=(current===bounds.length-1?72:2);
 setCurrent(atEnd?bounds.length-1:sectionAtFocus(bounds,focus,current));
}
function scheduleTrack(){clearTimeout(settleTimer);settleTimer=setTimeout(track,260);}
addEventListener('scroll',scheduleTrack,{passive:true});
// Use the same short dwell on scrollend: tiny separate wheel gestures shouldn't
// repeatedly switch between moods. Native keyboard, touch and Find remain intact.
addEventListener('scrollend',scheduleTrack);
addEventListener('resize',scheduleTrack);
function render(data,meta={}){
 stop();score=data;current=-1;
 $('welcome').hidden=true;$('reading').hidden=false;$('player').hidden=false;$('exit').hidden=false;
 $('article-title').textContent=meta.title||data.title||'Untitled';
 $('byline').textContent=`${meta.author||data.author||'Your reading selection'} · ${Math.max(1,Math.ceil(data.sections.reduce((n,s)=>n+s.text.split(/\s+/).length,0)/220))} min read`;
 $('sections').replaceChildren(...data.sections.map((section,index)=>{
  const group=document.createElement('div');group.className='score-section';group.dataset.section=String(index);
  for(const text of section.text.split(/\n\s*\n/)){
   if(!text.trim())continue;
   const p=document.createElement('p');p.textContent=text;group.append(p);
  }
  return group;
 }));
 setCurrent(0);message('');status('Press play for background music');
 document.fonts?.ready.then(scheduleTrack);
}
$('play').onclick=async()=>{
 if(starting||audio.playing){stop();return;}
 track();const token=++playToken;starting=true;updatePlayButton();status('Preparing audio');
 try{
  await audio.play();if(token!==playToken)return;
  starting=false;updatePlayButton();status(audio.playing?'Playing':'Press play for background music');message('');preloadNext();
 }catch(error){if(token===playToken){starting=false;updatePlayButton();status('Press play to retry');message(error.message||'Audio could not start. Press play to retry.');}}
};
$('volume').oninput=event=>audio.setVolume(Number(event.target.value)/100);
function showEmpty(title='Use the extension.',copy='Choose Paste text, Scan page, or Import file from Undertone in your browser toolbar. Your reader opens when the text is ready.'){
 $('reading').hidden=true;$('player').hidden=true;$('exit').hidden=true;$('welcome').hidden=false;$('welcome').removeAttribute('aria-busy');
 $('entry-title').textContent=title;$('entry-copy').textContent=copy;$('entry-title').focus({preventScroll:true});
}
const articleId=new URLSearchParams(location.search).get('article');
if(articleId&&location.protocol==='chrome-extension:'){
 $('welcome').setAttribute('aria-busy','true');$('entry-title').textContent='Opening your text…';$('entry-copy').textContent='';
 try{
  const stored=await chrome.storage.session.get(articleId),article=stored[articleId];
  if(!article?.score?.sections?.length)throw new Error('Missing reading session.');render(article.score,article);
 }catch{showEmpty('Text unavailable.','Open Undertone from your browser toolbar and prepare the text again.');}
}else showEmpty();
addEventListener('pagehide',()=>{clearTimeout(settleTimer);stop();});
