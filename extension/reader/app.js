import {AudioEngine} from './audio.js';
import {paginateSections,pageAtScroll} from './reading-position.js';
const $=id=>document.getElementById(id),audio=new AudioEngine();
let score,current=-1,currentPage=-1,pages=[],settleTimer,resizeTimer,fadeTimer,soundToken=0,playToken=0,starting=false;
function message(text){$('message').textContent=text;$('message').hidden=!text;}
function status(text){$('play-status').textContent=text;}
audio.onTrackChange=({track,fallback})=>{ $('mood').title=fallback?'Bundled WAV fallback':track?`${track.title} · ${track.artist} · CC0`: 'Original CC0 music'; };
function updatePlayButton(){
 $('play').dataset.playing=String(audio.playing||starting);
 $('play').setAttribute('aria-label',audio.playing||starting?'Pause soundtrack':'Play soundtrack');
 $('play').setAttribute('aria-busy',String(starting));
 $('play').title=audio.playing||starting?'Pause (Space)':'Play (Space)';
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
 const next=score.sections[current+1];
 if(next)audio.preloadScene(next);
}
async function changeSoundtrack(section){
 const token=++soundToken;clearTimeout(fadeTimer);
 if(audio.playing)status(`Gently moving into ${section.mood}`);
 try{
  const transition=await audio.setScene(section);
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
 clearTimeout(settleTimer);if(!score||!pages.length)return;
 const viewport=$('sections'),height=pageHeight();
 const index=pageAtScroll(viewport.scrollTop,height,pages.length);
 // Only commit a fully landed page. Two passages passing through the viewport
 // during a scroll gesture must not fight over the soundtrack.
 if(index<0||Math.abs(viewport.scrollTop-index*height)>3)return;
 currentPage=index;
 [...viewport.children].forEach((page,i)=>{page.inert=i!==index;page.setAttribute('aria-hidden',String(i!==index));});
 $('page-progress').textContent=`${index+1} / ${pages.length}`;
 $('page-progress').setAttribute('aria-label',`Page ${index+1} of ${pages.length}`);
 $('reading-hint').textContent=pages.length===1?'Your reading':index===pages.length-1?'End of reading':'Scroll to continue';
 setCurrent(pages[index].sectionIndex);
}
function pageHeight(){return $('sections').firstElementChild?.getBoundingClientRect().height||$('sections').clientHeight;}
function scheduleTrack(){clearTimeout(settleTimer);settleTimer=setTimeout(track,100);}
$('sections').addEventListener('scroll',scheduleTrack,{passive:true});
$('sections').addEventListener('scrollend',scheduleTrack);
function fillText(element,text){
 element.replaceChildren(...text.split(/\n\s*\n/).filter(part=>part.trim()).map(part=>{
  const paragraph=document.createElement('p');paragraph.textContent=part;return paragraph;
 }));
}
function layout(){
 if(!score)return;
 const viewport=$('sections'),anchor=pages[currentPage],height=viewport.clientHeight;
 if(!height)return;
 const measure=document.createElement('div');measure.className='reader-page page-measure';measure.setAttribute('aria-hidden','true');measure.inert=true;
 const prose=document.createElement('div');prose.className='page-prose';measure.append(prose);viewport.append(measure);
 const fits=text=>{fillText(prose,text);return prose.scrollHeight<=measure.clientHeight-48;};
 pages=paginateSections(score.sections,fits);measure.remove();
 const elements=pages.map((page,index)=>{
  const sheet=document.createElement('section');sheet.className='reader-page';sheet.dataset.section=String(page.sectionIndex);
  sheet.setAttribute('aria-label',`Page ${index+1}`);
  const content=document.createElement('div');content.className='page-prose';fillText(content,page.text);sheet.append(content);
  if(page.text.trim().split(/\s+/).length<120)sheet.classList.add('short-page');
  return sheet;
 });
 viewport.replaceChildren(...elements);
 // Larger type gives short passages presence, but must never clip the words.
 elements.forEach(sheet=>{if(sheet.firstChild.scrollHeight>height-48)sheet.classList.remove('short-page');});
 currentPage=anchor?pages.findIndex(page=>page.sectionIndex===anchor.sectionIndex&&page.start<=anchor.start&&page.end>anchor.start):0;
 if(currentPage<0)currentPage=0;
 viewport.scrollTop=currentPage*pageHeight();track();
}
function scheduleLayout(){clearTimeout(resizeTimer);resizeTimer=setTimeout(layout,140);}
addEventListener('resize',scheduleLayout);
if(typeof ResizeObserver==='function')new ResizeObserver(scheduleLayout).observe($('sections'));
addEventListener('keydown',event=>{
 if(!score||event.ctrlKey||event.metaKey||event.altKey||event.isComposing||event.target.closest('input:not([type=range]),textarea,select,[contenteditable]:not([contenteditable=false])'))return;
 // Space always controls audio, including when another reader button has focus.
 // Prevent the native button click and held-key repeats from toggling it twice.
 if(event.key===' '){event.preventDefault();if(!event.repeat)togglePlayback();return;}
 if(event.target.closest('input'))return;
 const delta={ArrowDown:1,ArrowUp:-1,PageDown:1,PageUp:-1}[event.key];
 if(delta===undefined&&event.key!=='Home'&&event.key!=='End')return;
 event.preventDefault();
 const viewport=$('sections'),height=pageHeight(),from=pageAtScroll(viewport.scrollTop,height,pages.length);
 const to=event.key==='Home'?0:event.key==='End'?pages.length-1:Math.max(0,Math.min(pages.length-1,from+delta));
 viewport.scrollTo({top:to*height,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
});
function render(data,meta={}){
 stop();score=data;current=-1;
 $('welcome').hidden=true;$('reading').hidden=false;$('player').hidden=false;$('exit').hidden=false;
 $('article-title').textContent=meta.title||data.title||'Untitled';$('article-title').title=$('article-title').textContent;
 $('byline').textContent=`${meta.author||data.author||'Your reading selection'} · ${Math.max(1,Math.ceil(data.sections.reduce((n,s)=>n+s.text.split(/\s+/).length,0)/220))} min read`;
 pages=[];currentPage=-1;layout();
 message('');
 document.fonts?.ready.then(scheduleLayout);
 $('sections').focus({preventScroll:true});
 startPlayback({autoplay:true});
}
async function startPlayback({autoplay=false}={}){
 if(!score||starting||audio.playing)return;
 track();const token=++playToken;starting=true;updatePlayButton();status('Preparing audio');
 try{
  await audio.play({autoplay});if(token!==playToken)return;
  starting=false;updatePlayButton();status(audio.playing?'Playing':'Press play for background music');message('');preloadNext();
 }catch(error){if(token===playToken){
  stop();
  if(autoplay&&(error.code==='AUTOPLAY_BLOCKED'||error.name==='NotAllowedError')){
   status('Press Space or Play to start');message('Press Space or Play to start the music.');
  }else{status('Press Space or Play to retry');message(error.message||'Audio could not start. Press Space or Play to retry.');}
 }}
}
function togglePlayback(){if(starting||audio.playing){stop();return;}return startPlayback();}
$('play').onclick=togglePlayback;
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
addEventListener('pagehide',()=>{clearTimeout(settleTimer);clearTimeout(resizeTimer);stop();});
