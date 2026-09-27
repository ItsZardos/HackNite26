import {encodeDocument} from './document-transfer.js';
const $=id=>document.getElementById(id),draftKey='undertone-draft';
const text=$('text'),reviewText=$('review-text'),fileInput=$('document-file');
const controls=['paste','scan','back','open-reader','text','import-file','document-file','read-file','import-back','review-back','review-text','open-reviewed'].map($);
let opening=false,view='choices',importTitle='',touched=false,watchedJob=null;
let pendingDraft=null,writing=false,draftWrite=Promise.resolve();
function message(value){$('status').textContent=value;$('status').hidden=!value;}
function setBusy(value){
 opening=value;document.body.dataset.preparing=String(value);
 for(const control of controls)control.disabled=value;
 $('open-reader').textContent=$('open-reviewed').textContent=value?'Preparing…':'Open reader';
 $('read-file').textContent=value?'Reading…':'Review text';
}
function showDiagnostic(diagnostic){
 $('debug-report').textContent=JSON.stringify(diagnostic,null,2);$('debug').hidden=false;$('copy-debug').textContent='Copy debug report';
}
function showError(result,mode){
 const diagnostic=result.diagnostic||{code:/^(FILE|SERVER)_[A-Z_]+$/.test(result.code)?result.code:'POPUP_CONNECTION_FAILED',stage:result.stage||'handoff',mode,version:chrome.runtime.getManifest().version};
 console.error('[Undertone]',diagnostic);showDiagnostic(diagnostic);
 message(result.error||result.message||'Could not prepare the reader. Try again.');
}
function showView(next,{focus=true,save=true}={}){
 if(opening)return;
 view=next;$('choices').hidden=view!=='choices';$('import-file').hidden=view!=='choices';
 for(const [id,name] of [['paste-form','paste'],['import-form','import'],['review-form','review']])$(id).hidden=view!==name;
 $('paste').setAttribute('aria-expanded',String(view==='paste'));$('import-file').setAttribute('aria-expanded',String(view==='import'||view==='review'));
 message('');if(focus)(view==='paste'?text:view==='import'?fileInput:view==='review'?reviewText:$('paste')).focus();
 if(save){touched=true;void saveDraft();}
}
function saveDraft(){
 pendingDraft={view,pasteText:text.value,importText:reviewText.value,importTitle};
 if(!writing){
  writing=true;
  draftWrite=(async()=>{
   try{while(pendingDraft){const value=pendingDraft;pendingDraft=null;await chrome.storage.session.set({[draftKey]:value});}}
   catch{message('Draft could not be saved. Keep this menu open.');}
   finally{writing=false;}
  })();
 }
 return draftWrite;
}
async function restoreDraft(force=false){
 const draft=(await chrome.storage.session.get(draftKey))[draftKey];
 if(!draft||(!force&&touched))return;
 text.value=typeof draft.pasteText==='string'?draft.pasteText.slice(0,100000):'';
 reviewText.value=typeof draft.importText==='string'?draft.importText.slice(0,100000):'';
 importTitle=typeof draft.importTitle==='string'?draft.importTitle.slice(0,300):'';
 const next=['paste','import','review'].includes(draft.view)?draft.view:'choices';
 showView(next==='review'&&!reviewText.value?'import':next,{focus:false,save:false});
}
async function applyJob(job){
 if(!job)return;
 if(job.status==='running'){
  watchedJob=job.id;setBusy(true);$('debug').hidden=true;
  message(job.action==='prepare-import'?'Reading your file…':'Preparing your soundtrack…');return;
 }
 if(job.id!==watchedJob)return;
 watchedJob=null;setBusy(false);
 if(job.status==='error'){showError(job.result,job.mode);return;}
 if(job.result?.preview){await restoreDraft(true);showView('review',{save:false});}
 else window.close();
}
chrome.storage.onChanged.addListener((changes,area)=>{
 if(area==='session'&&changes['undertone-job'])void applyJob(changes['undertone-job'].newValue).catch(()=>message('Reopen Undertone to continue.'));
});
async function submit(action,mode){
 if(opening)return;
 const file=fileInput.files?.[0],reviewing=mode==='import'&&action==='open-reader';
 const readingText=(reviewing?reviewText:text).value.trim();
 if(action==='prepare-import'&&!file){message('Choose a PDF or DOCX.');fileInput.focus();return;}
 if((mode==='paste'||reviewing)&&readingText.length<80){message('Add at least 80 characters.');(reviewing?reviewText:text).focus();return;}
 setBusy(true);$('debug').hidden=true;
 message(action==='prepare-import'?'Reading your file…':mode==='scan'?'Reading this page…':'Preparing your soundtrack…');
 try{
  await saveDraft();
  const request={type:action,mode};
  if(action==='prepare-import')request.file=await encodeDocument(file);
  else if(mode==='scan'){const [tab]=await chrome.tabs.query({active:true,currentWindow:true});request.tabId=tab?.id;}
  else{request.text=readingText;if(reviewing)request.title=importTitle;}
  const result=await chrome.runtime.sendMessage(request);
  if(result?.pending){await applyJob(result.job);return;}
  if(!result?.ok)throw Object.assign(new Error(result?.error||'Could not prepare the reader. Try again.'),{diagnostic:result?.diagnostic});
  if(result.job){
   // The storage event may already have handled this completion.
   if(watchedJob)await applyJob(result.job);
   else if(opening){watchedJob=result.job.id;await applyJob(result.job);}
  }else if(result.preview){setBusy(false);await restoreDraft(true);showView('review',{save:false});}
  else window.close();
 }catch(error){setBusy(false);showError(error,mode);}
}
$('paste').onclick=()=>showView('paste');$('back').onclick=()=>showView('choices');
$('import-file').onclick=()=>showView('import');$('import-back').onclick=()=>showView('choices');$('review-back').onclick=()=>showView('import');
$('scan').onclick=()=>submit('open-reader','scan');
$('paste-form').onsubmit=event=>{event.preventDefault();return submit('open-reader','paste');};
$('import-form').onsubmit=event=>{event.preventDefault();return submit('prepare-import','import');};
$('review-form').onsubmit=event=>{event.preventDefault();return submit('open-reader','import');};
for(const input of [text,reviewText])input.addEventListener('input',()=>{touched=true;void saveDraft();});
$('copy-debug').onclick=async()=>{
 try{await navigator.clipboard.writeText($('debug-report').textContent);$('copy-debug').textContent='Copied';}
 catch{$('copy-debug').textContent='Select and copy the report';}
};
(async()=>{
 try{
  await restoreDraft();
  const saved=await chrome.storage.session.get('undertone-last-error');
  if(!opening&&saved['undertone-last-error']?.diagnostic)showDiagnostic(saved['undertone-last-error'].diagnostic);
  const state=await chrome.runtime.sendMessage({type:'get-job'});
  if(state?.job?.status==='error'&&!opening)showError(state.job.result,state.job.mode);
  else await applyJob(state?.job);
 }catch{}
})();
// Readiness uses the local server only; opening the menu never spends Gemini quota.
fetch('http://127.0.0.1:8787/api/health',{signal:AbortSignal.timeout(3000)}).then(async response=>{
 if(!response.ok)throw new Error();const health=await response.json();
 const note=health.version&&health.version!==chrome.runtime.getManifest().version?'Restart the server to finish updating.':health.ready?'':'Add your Gemini key to .env.';
 $('connection').textContent=note;$('connection').hidden=!note;
}).catch(()=>{$('connection').textContent='Start the server with npm start.';$('connection').hidden=false;});
