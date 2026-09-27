import {AudioEngine} from './audio.js';
import {paginateSections,pageAtPosition,pageForAnchor} from './passages.js';
const $=id=>document.getElementById(id),audio=new AudioEngine();
const colors={calm:'#bfd6a4',happy:'#e1cb83',hopeful:'#d5dc9c',melancholy:'#94afca',mysterious:'#b9a6d5',tense:'#dfab7b',dark:'#bd8b96',triumphant:'#e2cd85'};
const scroller=$('sections');
let score,pages=[],currentPage=-1,currentSection=-1,playingBusy=false,settleTimer,resizeTimer,fadeTimer,soundToken=0;
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function message(text){$('message').textContent=text;$('message').hidden=!text;}
function stop(){clearTimeout(fadeTimer);soundToken++;audio.pause();$('play').textContent='▶';$('play').setAttribute('aria-label','Play soundtrack');$('play-status').textContent='Paused';delete document.body.dataset.crossfading;}
async function newText(){
 if(typeof globalThis.chrome?.action?.openPopup==='function'){
  try{await chrome.action.openPopup();message('');return;}catch{}
 }
 message('Open Undertone from your browser toolbar, then choose Paste text, Scan page, or Import file.');
}
$('exit').onclick=newText;
function fill(element,paragraphs){element.replaceChildren(...paragraphs.map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));}
function jumpTo(page){scroller.scrollTo({top:page*scroller.clientHeight,behavior:reducedMotion()?'instant':'smooth'});}
function preloadNext(){
 if(!audio.playing)return;
 const next=pages.slice(currentPage+1).find(page=>page.sectionIndex!==currentSection);
 if(next)audio.preload(score.sections[next.sectionIndex].mood);
}
async function changeSoundtrack(section){
 const token=++soundToken;clearTimeout(fadeTimer);
 if(audio.playing){$('play-status').textContent=`Moving into ${section.mood}…`;document.body.dataset.crossfading='true';}
 try{
  const transition=await audio.setMood(section.mood,section.intensity);
  if(token!==soundToken||!audio.playing)return;
  fadeTimer=setTimeout(()=>{
   if(token===soundToken){$('play-status').textContent='Playing this passage';delete document.body.dataset.crossfading;}
  },(transition?.duration||0)*1000);
  preloadNext();
 }catch(error){if(token===soundToken){stop();message(error.message);}}
}
function setCurrentPage(index){
 if(!pages[index]||index===currentPage)return;
 currentPage=index;const sectionIndex=pages[index].sectionIndex,section=score.sections[sectionIndex];
 [...scroller.children].forEach((element,i)=>{element.dataset.active=String(i===index);element.inert=i!==index;element.setAttribute('aria-hidden',String(i!==index));});
 $('chapter-count').textContent=`Passage ${index+1} of ${pages.length}`;
 $('position-hint').textContent=index===pages.length-1?'End of the text. Scroll up to revisit a passage.':'Scroll to continue';
 $('progress').textContent=`${index+1} / ${pages.length}`;
 [...$('timeline').children].forEach((button,i)=>button.setAttribute('aria-current',String(i===sectionIndex)));
 if(sectionIndex!==currentSection){
  currentSection=sectionIndex;$('mood').textContent=section.mood;$('intensity').textContent=`${Math.round(section.intensity*100)}%`;
  $('music-direction').textContent=section.musicPrompt||'Original ambient score';
  document.documentElement.style.setProperty('--mood',colors[section.mood]);
  changeSoundtrack(section);
 }
}
function settle(){
 clearTimeout(settleTimer);if(!pages.length)return;
 setCurrentPage(pageAtPosition(scroller.scrollTop,scroller.clientHeight,pages.length));
 $('position-hint').textContent=currentPage===pages.length-1?'End of the text. Scroll up to revisit a passage.':'Scroll to continue';
 delete document.body.dataset.turning;
}
function layoutPages(){
 if(!score)return;
 clearTimeout(settleTimer);
 const anchor=pages[currentPage],probe=$('page-measure');
 // A hidden page has exactly the same typography and dimensions as a real one.
 document.documentElement.style.setProperty('--page-height',`${scroller.clientHeight}px`);
 probe.style.width=`${scroller.clientWidth}px`;
 const fits=paragraphs=>{fill(probe,paragraphs);return probe.scrollHeight<=probe.clientHeight+1;};
 pages=paginateSections(score.sections,fits);
 scroller.replaceChildren(...pages.map((page,index)=>{
  const element=document.createElement('section');element.className='passage';element.id=`passage-${index}`;
  element.dataset.section=String(page.sectionIndex);element.setAttribute('aria-label',`Passage ${index+1}`);fill(element,page.paragraphs);return element;
 }));
 probe.replaceChildren();
 const index=anchor?pageForAnchor(pages,anchor.sectionIndex,anchor.start):0;
 currentPage=-1;scroller.scrollTop=index*scroller.clientHeight;setCurrentPage(index);
}
function render(data,meta={}){
 stop();score=data;pages=[];currentPage=-1;currentSection=-1;
 $('welcome').hidden=true;$('reading').hidden=false;$('player').hidden=false;$('exit').hidden=false;document.body.classList.add('has-reading');
 $('article-title').textContent=meta.title||data.title||'Untitled';
 $('byline').textContent=`${meta.author||data.author||'Your reading selection'} · ${Math.max(1,Math.ceil(data.sections.reduce((n,s)=>n+s.text.split(/\s+/).length,0)/220))} min read`;
 $('timeline').replaceChildren(...data.sections.map((section,index)=>{
  const button=document.createElement('button');button.textContent=section.mood;button.title=`Part ${index+1}: ${section.mood}`;button.setAttribute('aria-label',button.title);
  button.onclick=()=>jumpTo(pages.findIndex(page=>page.sectionIndex===index));return button;
 }));
 layoutPages();message('');$('play-status').textContent='Press play to start';
 document.fonts?.ready.then(()=>{if(score===data)layoutPages();});
}
scroller.addEventListener('scroll',()=>{
 if(!pages.length)return;
 const next=pageAtPosition(scroller.scrollTop,scroller.clientHeight,pages.length);
 if(next!==currentPage){$('position-hint').textContent=`Settling on passage ${next+1}…`;document.body.dataset.turning='true';}
 clearTimeout(settleTimer);settleTimer=setTimeout(settle,180);
},{passive:true});
scroller.addEventListener('scrollend',settle);
scroller.addEventListener('keydown',event=>{
 if(event.altKey||event.ctrlKey||event.metaKey)return;
 let next;
 if(['ArrowDown','PageDown',' '].includes(event.key))next=currentPage+(event.shiftKey?-1:1);
 else if(['ArrowUp','PageUp'].includes(event.key))next=currentPage-1;
 else if(event.key==='Home')next=0;else if(event.key==='End')next=pages.length-1;else return;
 event.preventDefault();jumpTo(Math.max(0,Math.min(pages.length-1,next)));
});
const resize=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(layoutPages,120);};
addEventListener('resize',resize);
if(typeof ResizeObserver==='function')new ResizeObserver(resize).observe(scroller);
$('play').onclick=async()=>{
 if(playingBusy)return;if(audio.playing){stop();return;}
 playingBusy=true;$('play').disabled=true;$('play').setAttribute('aria-busy','true');$('play-status').textContent='Preparing audio…';
 try{
  await audio.play();if(!audio.playing){$('play-status').textContent='Press play to start';return;}
  $('play').textContent='Ⅱ';$('play').setAttribute('aria-label','Pause soundtrack');$('play-status').textContent='Playing this passage';message('');preloadNext();
 }catch(error){$('play-status').textContent='Press play to retry';message(error.message||'Audio could not start. Press play to retry.');}
 finally{playingBusy=false;$('play').disabled=false;$('play').removeAttribute('aria-busy');}
};
$('volume').oninput=event=>audio.setVolume(Number(event.target.value)/100);
function showEmpty(title='Use the extension.',copy='Choose Paste text, Scan page, or Import file from Undertone in your browser toolbar. Your reader opens when the text is ready.'){
 document.body.classList.remove('has-reading');$('reading').hidden=true;$('player').hidden=true;$('exit').hidden=true;$('welcome').hidden=false;$('welcome').removeAttribute('aria-busy');
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
