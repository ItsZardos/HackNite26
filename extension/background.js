import {launchReader} from './reader-launch.js';
import {readTransferredDocument} from './document-transfer.js';

let running = null;
const jobKey = 'undertone-job', draftKey = 'undertone-draft';
const session = chrome.storage.session;
function failure(error, mode) {
 const diagnostic={version:chrome.runtime.getManifest().version,time:new Date().toISOString(),
  ...(error.diagnostic||{code:/^(FILE|PDF|DOCX|SERVER)_[A-Z_]+$/.test(error.code)?error.code:'UNEXPECTED_ERROR',stage:error.stage||'handoff',mode,events:[]})};
 console.error('[Undertone]',diagnostic);
 return {ok:false,error:error.message||'Could not prepare the reader. Try again.',diagnostic};
}
async function currentJob() {
 if(running)return running;
 const saved=(await session.get(jobKey))[jobKey];
 if(running)return running; // A new job may have started during the storage read.
 if(saved?.status==='running'){
  const job={...saved,status:'error',result:{ok:false,error:'Preparation was interrupted. Please try again.',diagnostic:{code:'JOB_INTERRUPTED',stage:'handoff',mode:saved.mode,events:[]}}};
  await session.set({[jobKey]:job});return job;
 }
 return saved||null;
}

chrome.runtime.onMessage.addListener((request,sender,respond)=>{
 if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('popup.html'))return;
 if(request?.type==='get-job'){
  currentJob().then(job=>respond({ok:true,job}),()=>respond({ok:true,job:running}));return true;
 }
 if(!['open-reader','prepare-import'].includes(request?.type))return;
 if(!['paste','scan','import'].includes(request.mode)||(request.type==='prepare-import'&&request.mode!=='import')){
  respond({ok:false,error:'Unknown reader action.'});return;
 }
 // A reopened popup must join the existing job instead of charging Gemini twice.
 if(running){respond({ok:true,pending:true,job:running});return;}
 const job={id:crypto.randomUUID(),action:request.type,mode:request.mode,status:'running',startedAt:Date.now()};
 running=job;
 const heartbeat=setInterval(()=>{Promise.resolve().then(()=>chrome.runtime.getPlatformInfo()).catch(()=>{});},20000);
 (async()=>{
  let result;
  try{
   await session.remove('undertone-last-error');await session.set({[jobKey]:job});
   if(request.type==='prepare-import'){
    const article=await readTransferredDocument(request.file);
    const draft=(await session.get(draftKey))[draftKey]||{};
    await session.set({[draftKey]:{...draft,view:'review',importText:article.text,importTitle:article.title}});
    result={ok:true,preview:true};
   }else{
    await launchReader(request);
    // Submitted text should not linger after its reader has opened.
    try{if(request.mode!=='scan'){
     const draft=(await session.get(draftKey))[draftKey];
     const field=request.mode==='paste'?'pasteText':'importText';
     if(draft&&typeof request.text==='string'&&draft[field]?.trim()===request.text.trim()){
      await session.set({[draftKey]:{...draft,[field]:'',...(field==='importText'?{importTitle:''}:{}),view:'choices'}});
     }
    }}catch{}
    result={ok:true};
   }
  }catch(error){
   result=failure(error,request.mode);
   try{await session.set({'undertone-last-error':result});}catch{}
  }finally{clearInterval(heartbeat);}
  const completed={...job,status:result.ok?'done':'error',result};
  try{await session.set({[jobKey]:completed});}catch{}
  running=null;respond({...result,job:completed});
 })();
 return true;
});
