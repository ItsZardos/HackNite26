import {readDocument} from './document-file.js';
const $=id=>document.getElementById(id);
const form=$('import-form'),input=$('document-file'),submit=$('read-file'),status=$('status');
let busy=false;
form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(busy)return;
  const file=input.files?.[0];
  if(!file){status.hidden=false;status.textContent='Choose a PDF or DOCX file first.';input.focus();return;}
  busy=true;input.disabled=true;submit.disabled=true;$('debug').hidden=true;
  status.hidden=false;status.textContent='Reading your file locally…';
  try {
    const article=await readDocument(file);
    status.textContent='Preparing your text and soundtrack…';
    const result=await chrome.runtime.sendMessage({type:'open-reader',mode:'import',text:article.text,title:article.title});
    if(!result?.ok)throw Object.assign(new Error(result?.error||'Could not prepare the reader.'),{diagnostic:result?.diagnostic});
    window.close();
  }catch(error){
    const diagnostic=error.diagnostic||{code:/^(FILE|PDF|DOCX|SERVER)_[A-Z_]+$/.test(error.code)?error.code:'IMPORT_FAILED',stage:'import',mode:'import',version:chrome.runtime.getManifest().version};
    status.textContent=`[${diagnostic.code}] ${error.message||'Import failed. Please try again.'}`;
    $('debug-report').textContent=JSON.stringify(diagnostic,null,2);$('debug').hidden=false;
    console.error('[Undertone]',diagnostic);
    try{await chrome.storage.session.set({'undertone-last-error':{ok:false,error:status.textContent,diagnostic}});}catch{}
    busy=false;input.disabled=false;submit.disabled=false;
  }
});
