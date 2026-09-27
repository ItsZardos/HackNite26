// Layout pages inherit their source section's score; the submitted text is never rescored.
export function paginateSections(sections, fits) {
 const pages=[];
 sections.forEach((section,sectionIndex)=>{
  let paragraphs=[],offset=0,start=0;
  const flush=()=>{if(paragraphs.length){pages.push({sectionIndex,start,paragraphs});paragraphs=[];start=offset;}};
  for(const original of section.text.split(/\n\s*\n/).filter(text=>text.trim())){
   let remaining=original.trim();
   while(remaining){
    if(fits([...paragraphs,remaining])){if(!paragraphs.length)start=offset;paragraphs.push(remaining);offset+=remaining.length;remaining='';continue;}
    if(paragraphs.length){flush();continue;}
    // Prefer whole words, then a sentence boundary. Extremely long words and
    // unspaced languages fall back to graphemes, never half a surrogate pair.
    let ends=Array.from(remaining.matchAll(/\S+\s*/gu),match=>match.index+match[0].length);
    const largest=boundaries=>{
     let low=0,high=boundaries.length;
     while(low<high){const mid=Math.ceil((low+high)/2);if(fits([remaining.slice(0,boundaries[mid-1]).trimEnd()]))low=mid;else high=mid-1;}
     return low?boundaries[low-1]:0;
    };
    let cut=largest(ends);
    if(!cut){
     ends=Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(remaining),item=>item.index+item.segment.length);
     cut=largest(ends)||ends[0];
    }
    const sentences=Array.from(remaining.slice(0,cut).matchAll(/[.!?。！？]["'”’)]*\s+/gu),match=>match.index+match[0].length);
    const sentence=sentences.at(-1);if(sentence>=cut*.5)cut=sentence;
    start=offset;paragraphs=[remaining.slice(0,cut).trimEnd()];offset+=cut;remaining=remaining.slice(cut);flush();
   }
   offset+=2;
  }
  flush();
 });
 return pages;
}

export function pageAtPosition(top,height,count) {
 if(!count||height<=0)return 0;
 return Math.max(0,Math.min(count-1,Math.round(top/height)));
}
export function pageForAnchor(pages,sectionIndex,offset) {
 let found=pages.findIndex(page=>page.sectionIndex===sectionIndex);
 if(found<0)return 0;
 for(let i=found;i<pages.length&&pages[i].sectionIndex===sectionIndex;i++)if(pages[i].start<=offset)found=i;
 return found;
}
