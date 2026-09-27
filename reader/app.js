import {demo} from './demo.js';
import {AudioEngine} from './audio.js';
const $=id=>document.getElementById(id), audio=new AudioEngine();
const colors={calm:'#bfd6a4',happy:'#e1cb83',hopeful:'#d5dc9c',melancholy:'#94afca',mysterious:'#b9a6d5',tense:'#dfab7b',dark:'#bd8b96',triumphant:'#e2cd85'};
let score,current=-1,busy=false,playingBusy=false,frame=0,article={};
function message(text){$('message').textContent=text;$('message').hidden=!text;}
function stop(){audio.pause();$('play').textContent='▶';$('play').setAttribute('aria-label','Play soundtrack');$('play-status').textContent='Paused — stay a little longer';}
function home(){stop();score=null;delete document.body.dataset.entry;$('entry-title').textContent='Set the scene.';$('entry-copy').textContent='Paste an article, a chapter, or something you wrote.';$('reading').hidden=true;$('player').hidden=true;$('exit').hidden=true;$('welcome').hidden=false;message('');window.scrollTo(0,0);}
$('exit').onclick=home;$('another').onclick=home;
function render(data,meta={}){
 stop();score=data;current=-1;$('welcome').hidden=true;$('reading').hidden=false;$('player').hidden=false;$('exit').hidden=false;
 $('article-title').textContent=meta.title||data.title||'An untitled adventure';$('byline').textContent=`${meta.author||data.author||'Your reading selection'}  ·  ${Math.max(1,Math.ceil(data.sections.reduce((n,s)=>n+s.text.split(/\s+/).length,0)/220))} min read`;
 $('source-label').textContent=data.source==='demo'?'Sample story · curated score':'Analyzed with Gemini';$('article-type').textContent=data.source==='demo'?'THE UNDERTONE COLLECTION · NO. 01':'YOUR CINEMATIC READER';
 $('sections').replaceChildren();$('timeline').replaceChildren();
 for(const s of data.sections){
  const section=document.createElement('section');section.dataset.section=s.id;section.id=`section-${s.id}`;
  const label=document.createElement('div');label.className='section-label';label.textContent=`MOVEMENT ${String(s.id+1).padStart(2,'0')}`;section.append(label);
  for(const text of s.text.split(/\n\s*\n/)){const p=document.createElement('p');p.textContent=text;section.append(p);}
  $('sections').append(section);
  const button=document.createElement('button');button.textContent=s.mood;button.title=`Movement ${s.id+1}: ${s.mood}, ${Math.round(s.intensity*100)}% intensity`;button.setAttribute('aria-label',button.title);button.onclick=()=>section.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});$('timeline').append(button);
 }
 window.scrollTo(0,0);setCurrent(0);track();message('');$('play-status').textContent='Press play to enter the story';
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
$('play').onclick=async()=>{if(playingBusy)return;if(audio.playing){stop();return;}playingBusy=true;try{await audio.play();if(!audio.playing)return;$('play').textContent='Ⅱ';$('play').setAttribute('aria-label','Pause soundtrack');$('play-status').textContent='The score follows your scroll';message('');}catch(e){message(e.message||'Audio could not start. Press play to retry.');}finally{playingBusy=false;}};
$('volume').oninput=e=>audio.setVolume(Number(e.target.value)/100);
$('demo').onclick=()=>{render(demo);$('play').click();};
$('form').onsubmit=async e=>{
 e.preventDefault();if(busy)return;busy=true;$('analyze').disabled=true;$('analyze').textContent='Listening to the words…';message('Gemini is composing the emotional arc. This may take a moment.');
 try{
 const response=await fetch(`${location.protocol==='chrome-extension:'?'http://127.0.0.1:8787':''}/api/analyze`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:$('text').value}),signal:AbortSignal.timeout(70000)});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not score this text.');render(data,{title:$('title').value,author:article.author});
 }catch(e){message(e.name==='TypeError'?'Start the local Undertone server, then retry. The sample journey works offline.':e.message);}
 finally{busy=false;$('analyze').disabled=false;$('analyze').textContent='Compose my reading experience ↗';}
};
function showEntry(mode) {
 document.body.dataset.entry = mode;
 $('exit').hidden = false;
 $('entry-title').textContent = mode === 'scan' ? 'Page ready.' : 'Paste text.';
 $('entry-copy').textContent = mode === 'scan'
  ? 'Review the text below, then compose its soundtrack.'
  : 'Add your text, then compose its soundtrack.';
 window.scrollTo({top: 0, behavior: 'instant'});
 (mode === 'scan' ? $('entry-title') : $('text')).focus({preventScroll: true});
}

const entryParams = new URLSearchParams(location.search);
const articleId = entryParams.get('article');
if (entryParams.get('mode') === 'paste') showEntry('paste');
else if (entryParams.get('mode') === 'scan' || articleId) {
 showEntry('scan');
 try {
  if (location.protocol !== 'chrome-extension:' || !articleId) throw new Error('Missing article.');
  const stored = await chrome.storage.session.get(articleId);
  article = stored[articleId];
  if (!article) throw new Error('Missing article.');
  await chrome.storage.session.remove(articleId);
  $('title').value = article.title || '';
  $('text').value = article.text || '';
  if (article.error) { showEntry('paste'); message(article.error); }
 } catch {
  showEntry('paste');
  message('The scanned text is no longer available. Scan the page again or paste its text below.');
 }
}
addEventListener('pagehide',()=>audio.pause());
