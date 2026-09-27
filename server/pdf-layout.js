const median=values=>{const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)]||12;};
const byPosition=(a,b)=>a.y-b.y||a.x-b.x;

// PDF content streams are drawing instructions, not a reading-order contract.
// Group positioned text into lines before deciding the order of columns.
export function pageLines(items,viewport) {
 const t=viewport.transform;
 const words=items.filter(item=>typeof item.str==='string'&&item.str.trim()).map(item=>{
  const [a,b,,,x,y]=item.transform;
  const size=Math.max(1,Math.hypot(t[0]*a+t[2]*b,t[1]*a+t[3]*b));
  return {text:item.str,x:t[0]*x+t[2]*y+t[4],y:t[1]*x+t[3]*y+t[5],width:Math.abs(item.width),size,dir:item.dir};
 }).sort(byPosition);
 const rows=[];
 for(const word of words){
  let row=rows.at(-1);
  if(!row||Math.abs(word.y-row.y)>Math.max(2,Math.max(word.size,row.size)*.75)){row={y:word.y,size:word.size,words:[]};rows.push(row);}
  row.words.push(word);
 }
 const lines=[];
 for(const row of rows){
  const sorted=row.words.sort((a,b)=>a.x-b.x);let line;
  for(const word of sorted){
   const gap=line?word.x-line.end:0;
   if(!line||gap>Math.max(16,word.size*2)){
    line={text:word.text,x:word.x,end:word.x+word.width,y:row.y,size:word.size};lines.push(line);
   }else{
    // Close glyph fragments stay in the same word; real gaps become spaces.
    const superscript=word.size<line.size*.85&&/^[\d*†‡]+$/.test(word.text);
    line.text+=(gap>word.size*.12&&!superscript&&!/\s$/.test(line.text)&&!/^\s|^[,.;:!?…)}\]]/.test(word.text)?' ':'')+word.text;
    line.end=Math.max(line.end,word.x+word.width);line.size=Math.max(line.size,word.size);
   }
  }
 }
 return lines.map(line=>({...line,text:line.text.replace(/[\t ]+/g,' ').trim()}));
}

function columnOrder(lines,width) {
 const starts=[...new Set(lines.map(line=>Math.round(line.x)))].sort((a,b)=>a-b);
 let rightStart;
 for(const candidate of starts){
  if(candidate<width*.35||candidate>width*.75)continue;
  const left=lines.filter(l=>l.end<candidate-10&&l.x<candidate-width*.16);
  const right=lines.filter(l=>l.x>=candidate-3);
  if(left.length<3||right.length<3||median(left.map(l=>l.end-l.x))<width*.13||median(right.map(l=>l.end-l.x))<width*.13)continue;
  // Parallel baselines distinguish two prose columns from ordinary indentation.
  const paired=left.filter(l=>right.some(r=>Math.abs(l.y-r.y)<Math.max(l.size,r.size)*.7));
  if(paired.length>=3){rightStart=candidate;break;}
 }
 if(rightStart===undefined)return lines.sort(byPosition).map(l=>({...l,flow:0}));
 const wide=lines.filter(l=>l.x<rightStart-10&&l.end>rightStart).sort(byPosition);
 let pending=lines.filter(l=>!wide.includes(l)),ordered=[],band=0;
 const addBand=part=>{
  for(const [column,group] of [part.filter(l=>l.x<rightStart-3),part.filter(l=>l.x>=rightStart-3)].entries()){
   ordered.push(...group.sort(byPosition).map(l=>({...l,flow:band*3+column})));
  }
 };
 for(const heading of wide){
  addBand(pending.filter(l=>l.y<heading.y));pending=pending.filter(l=>l.y>=heading.y);
  ordered.push({...heading,flow:band*3+2});band++;
 }
 addBand(pending);return ordered;
}

const margin=(line,page)=>line.y<page.height*.08?'top':line.y>page.height*.92?'bottom':null;
const fingerprint=text=>text.toLowerCase().replace(/\d+/g,'#').replace(/\s+/g,' ').trim();
const pageNumber=text=>/^(?:[-–—]\s*)?(?:page\s+)?(?:\d{1,5}|[ivxlcdm]{1,8})(?:\s*(?:of|\/)\s*\d{1,5})?(?:\s*[-–—])?$/i.test(text.trim());
const sentenceEnd=text=>/[.!?。！？][”’"')\]]*$/.test(text);
const listStart=text=>/^(?:[•●▪‣]|[-–]\s|\d+[.)]\s|[a-z][.)]\s)/i.test(text);

export function cleanPdfPages(pages) {
 const seen=new Map();
 for(const [index,page] of pages.entries())for(const line of page.lines){
  const edge=margin(line,page);if(!edge||line.text.length>120)continue;
  const key=edge+':'+fingerprint(line.text);
  if(!seen.has(key))seen.set(key,new Set());seen.get(key).add(index);
 }
 const repeated=Math.max(2,Math.ceil(pages.length*.35));
 let removed=0;const ordered=[];
 for(const [index,page] of pages.entries()){
  const bodySize=median(page.lines.filter(l=>!margin(l,page)).map(l=>l.size));
  const lines=page.lines.filter(line=>{
   const edge=margin(line,page);
   const running=edge&&line.size<=bodySize*1.15&&(seen.get(edge+':'+fingerprint(line.text))?.size||0)>=repeated;
   if(edge&&(pageNumber(line.text)||running)){removed++;return false;}
   return true;
  });
  ordered.push(...columnOrder(lines,page.width).map(line=>({...line,page:index,bodySize})));
 }
 const gaps=new Map();
 for(let i=1;i<ordered.length;i++){
  const current=ordered[i],before=ordered[i-1],gap=current.y-before.y;
  if(current.page===before.page&&current.flow===before.flow&&gap>current.size*.6&&gap<current.size*4){
   const key=current.page+':'+current.flow;if(!gaps.has(key))gaps.set(key,[]);gaps.get(key).push(gap);
  }
 }
 const knownWords=new Set(ordered.flatMap(line=>line.text.toLowerCase().match(/\p{L}{3,}/gu)||[]));
 const paragraphs=[];let text='',previous;
 const flush=()=>{if(text.trim())paragraphs.push(text.trim());text='';};
 for(const line of ordered){
  const heading=line.size>line.bodySize*1.2;
  const transition=previous&&(line.page!==previous.page||line.flow!==previous.flow);
  const gap=previous?line.y-previous.y:0;
  const pitches=(gaps.get(line.page+':'+line.flow)||[line.size*1.25]).slice().sort((a,b)=>a-b);
  const pitch=pitches[Math.floor(pitches.length*.25)];
  const paragraphBreak=previous&&(heading!==previous.heading||
   (heading&&previous.heading&&Math.abs(line.size-previous.size)>Math.min(line.size,previous.size)*.15)||listStart(line.text)||
   (!transition&&(gap>pitch*1.45||line.x>previous.x+line.size*1.1))||
   (transition&&sentenceEnd(previous.text)));
  if(paragraphBreak)flush();
  if(text){
   if(text.endsWith('\u00ad'))text=text.slice(0,-1); // Explicit discretionary hyphen.
   else if(text.endsWith('-')){
    const before=text.match(/(\p{L}{2,})-$/u)?.[1],after=line.text.match(/^(\p{L}{2,})/u)?.[1];
    // Remove a hard wrap hyphen only with evidence of the intact word in
    // this document. Preserve real compounds such as "well-known".
    if(before&&after&&knownWords.has((before+after).toLowerCase()))text=text.slice(0,-1);
   }
   else if(!/-$/.test(text))text+=' ';
  }
  text+=line.text.replace(/\u00ad(?!$)/g,'');
  previous={...line,heading};
 }
 flush();
 return {text:paragraphs.join('\n\n'),removedMarginLines:removed};
}
