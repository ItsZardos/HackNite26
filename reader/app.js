import {demo} from './demo.js';
import {AudioEngine} from './audio.js';
const $=id=>document.getElementById(id), audio=new AudioEngine();
const colors={calm:'#bfd6a4',happy:'#e1cb83',hopeful:'#d5dc9c',melancholy:'#94afca',mysterious:'#b9a6d5',tense:'#dfab7b',dark:'#bd8b96',triumphant:'#e2cd85'};
let score,current=-1,playingBusy=false,frame=0;
function message(text){$('message').textContent=text;$('message').hidden=!text;}
function stop(){audio.pause();$('play').textContent='▶';$('play').setAttribute('aria-label','Play soundtrack');$('play-status').textContent='Paused';}
async function newText(){
 if(typeof globalThis.chrome?.action?.openPopup==='function'){
  try{await chrome.action.openPopup();message('');return;}catch{}
 }
 message('Open Undertone from your browser toolbar, then choose Paste text or Scan page.');
}
$('exit').onclick=newText;$('another').onclick=newText;
function render(data,meta={}){
 stop();score=data;current=-1;$('welcome').hidden=true;$('reading').hidden=false;$('player').hidden=false;$('exit').hidden=false;
 $('article-title').textContent=meta.title||data.title||'Untitled';$('byline').textContent=`${meta.author||data.author||'Your reading selection'}  ·  ${Math.max(1,Math.ceil(data.sections.reduce((n,s)=>n+s.text.split(/\s+/).length,0)/220))} min read`;
 $('source-label').textContent=data.source==='demo'?'Sample story · curated score':'Analyzed with Gemini';$('article-type').textContent=data.source==='demo'?'SAMPLE TEXT':'READER';
 $('sections').replaceChildren();$('timeline').replaceChildren();
 for(const s of data.sections){
  const section=document.createElement('section');section.dataset.section=s.id;section.id=`section-${s.id}`;
  const label=document.createElement('div');label.className='section-label';label.textContent=`MOVEMENT ${String(s.id+1).padStart(2,'0')}`;section.append(label);
  for(const text of s.text.split(/\n\s*\n/)){const p=document.createElement('p');p.textContent=text;section.append(p);}
  $('sections').append(section);
  const button=document.createElement('button');button.textContent=s.mood;button.title=`Movement ${s.id+1}: ${s.mood}, ${Math.round(s.intensity*100)}% intensity`;button.setAttribute('aria-label',button.title);button.onclick=()=>section.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});$('timeline').append(button);
 }
 window.scrollTo(0,0);setCurrent(0);track();message('');$('play-status').textContent='Press play to start';
}
function setCurrent(id){
 if(id===current)return;current=id;const s=score.sections[id];$('mood').textContent=s.mood;$('intensity').textContent=`${Math.round(s.intensity*100)}%`;$('music-direction').textContent=s.musicPrompt;document.documentElement.style.setProperty('--mood',colors[s.mood]);$('chapter-count').textContent=`Movement ${id+1} of ${score.sections.length}`;
 [...$('timeline').children].forEach((b,i)=>b.setAttribute('aria-current',String(i===id)));
 audio.setMood(s.mood,s.intensity).catch(e=>{stop();message(e.message);});
}
function track(){
 frame=0;if(!score)return;const center=(innerHeight-$('player').offsetHeight)/2;const elements=[...$('sections').children];
 let best=0,distance=Infinity;elements.forEach((el,i)=>{const r=el.getBoundingClientRect();const d=r.top<=center&&r.bottom>=center?0:Math.min(Math.abs(r.top-center),Math.abs(r.bottom-center));if(d<distance){best=i;distance=d;}});setCurrent(best);
 const start=elements[0].getBoundingClientRect().top+scrollY,end=elements.at(-1).getBoundingClientRect().bottom+scrollY;
 $('progress').textContent=`${Math.round(Math.max(0,Math.min(1,(scrollY+center-start)/(end-start)))*100)}%`;
}
addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(track);},{passive:true});addEventListener('resize',track);
$('play').onclick=async()=>{
 if(playingBusy)return;
 if(audio.playing){stop();return;}
 playingBusy=true;$('play').disabled=true;$('play').setAttribute('aria-busy','true');$('play-status').textContent='Preparing audio…';
 try{
  await audio.play();
  if(!audio.playing){$('play-status').textContent='Press play to start';return;}
  $('play').textContent='Ⅱ';$('play').setAttribute('aria-label','Pause soundtrack');$('play-status').textContent='The score follows your scroll';message('');
 }catch(e){
  $('play-status').textContent='Press play to retry';message(e.message||'Audio could not start. Press play to retry.');
 }finally{
  playingBusy=false;$('play').disabled=false;$('play').removeAttribute('aria-busy');
 }
};
$('volume').oninput=e=>audio.setVolume(Number(e.target.value)/100);
$('demo').onclick=()=>{render(demo);$('play').click();};
function showEmpty(title = 'Open a text.', copy = 'Open Undertone from your browser toolbar, then choose Paste text or Scan page.') {
 $('reading').hidden = true;
 $('player').hidden = true;
 $('exit').hidden = true;
 $('welcome').hidden = false;
 $('welcome').removeAttribute('aria-busy');
 $('entry-title').textContent = title;
 $('entry-copy').textContent = copy;
 $('demo').hidden = location.protocol === 'chrome-extension:';
 window.scrollTo({top: 0, behavior: 'instant'});
 $('entry-title').focus({preventScroll: true});
}

const articleId = new URLSearchParams(location.search).get('article');
if (articleId && location.protocol === 'chrome-extension:') {
 $('welcome').setAttribute('aria-busy', 'true');
 $('entry-title').textContent = 'Opening your text…';
 $('entry-copy').textContent = '';
 try {
  const stored = await chrome.storage.session.get(articleId);
  const article = stored[articleId];
  if (!article?.score?.sections?.length) throw new Error('Missing reading session.');
  // Retain the session entry so reloading an open reader keeps its finalized text.
  render(article.score, article);
 } catch {
  showEmpty('Text unavailable.', 'Open Undertone from your browser toolbar and prepare the text again.');
 }
} else showEmpty();
addEventListener('pagehide',()=>audio.pause());
