// Split only for display. Every character still belongs to its original scored
// passage, so turning a page within that passage cannot change the soundtrack.
export function paginateSections(sections, fits) {
 const pages=[];
 sections.forEach((section,sectionIndex)=>{
  const text=section.text,ends=[...text.matchAll(/\S+\s*/gu)].map(match=>match.index+match[0].length);
  if(!ends.length)return;
  const sentences=typeof Intl.Segmenter==='function'
   ? [...new Intl.Segmenter(undefined,{granularity:'sentence'}).segment(text)].map(s=>s.index+s.segment.length)
   : [];
  let start=0,word=0;
  while(word<ends.length){
   // A long URL or a language without spaces can exceed a whole page. Split
   // that token at a Unicode code-point boundary rather than clipping it.
   if(!fits(text.slice(start,ends[word]))){
    const units=Array.from(text.slice(start,ends[word]));
    let low=1,high=units.length,best=1;
    while(low<=high){const mid=(low+high)>>1;if(fits(units.slice(0,mid).join(''))){best=mid;low=mid+1;}else high=mid-1;}
    const end=start+units.slice(0,best).join('').length;
    pages.push({sectionIndex,start,end,text:text.slice(start,end)});start=end;
    while(word<ends.length&&ends[word]<=end)word++;
    continue;
   }
   let low=word,high=ends.length-1,best=word;
   while(low<=high){const mid=(low+high)>>1;if(fits(text.slice(start,ends[mid]))){best=mid;low=mid+1;}else high=mid-1;}
   // Balance the remaining pages instead of leaving a tiny last page.
   const capacity=best-word+1,remaining=ends.length-word,count=Math.ceil(remaining/capacity);
   let end=ends[Math.min(best,word+Math.ceil(remaining/count)-1)];
   const minimum=start+(end-start)*.55;
   const boundary=sentences.filter(position=>position>minimum&&position<=end).at(-1);
   if(boundary&&count>1)end=boundary;
   pages.push({sectionIndex,start,end,text:text.slice(start,end)});
   start=end;while(word<ends.length&&ends[word]<=end)word++;
  }
 });
 return pages;
}
export function pageAtScroll(offset,height,count){
 if(!count||height<=0)return -1;
 return Math.max(0,Math.min(count-1,Math.round(offset/height)));
}
