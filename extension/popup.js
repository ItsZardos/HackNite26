import {encodeDocument} from './document-transfer.js';
const $ = id => document.getElementById(id);
const importFile=$('import-file');
const paste = $('paste'), scan = $('scan'), status = $('status');
const choices = $('choices'), form = $('paste-form'), text = $('text');
const back = $('back'), submit = $('open-reader');
const importForm=$('import-form'),fileInput=$('document-file'),fileSubmit=$('read-file'),importBack=$('import-back');
const debug = $('debug'), debugReport = $('debug-report'), copyDebug = $('copy-debug');
let opening = false;

function showDiagnostic(diagnostic) {
  debugReport.textContent = JSON.stringify(diagnostic, null, 2);
  debug.hidden = false;
  copyDebug.textContent = 'Copy debug report';
}
// Keep the last failure available even if the popup was closed accidentally.
chrome.storage.session.get('undertone-last-error').then(saved => {
  if (!opening && saved['undertone-last-error']?.diagnostic) showDiagnostic(saved['undertone-last-error'].diagnostic);
}).catch(() => {});
copyDebug.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(debugReport.textContent); copyDebug.textContent = 'Copied'; }
  catch { copyDebug.textContent = 'Select the report text and copy it manually'; }
});

function message(value) {
  status.textContent = value;
  status.hidden = !value;
}

function setBusy(value) {
  opening = value;
  for (const control of [paste, scan, back, submit, text, importFile, fileInput, fileSubmit, importBack]) control.disabled = value;
  submit.textContent = value ? 'Preparing reader…' : 'Open reader';
  fileSubmit.textContent = value ? 'Preparing reader…' : 'Open reader';
}

async function openReader(mode) {
  if (opening) return;
  const selectedFile=fileInput.files?.[0];
  if(mode==='import'&&!selectedFile){message('Choose a PDF or DOCX file first.');fileInput.focus();return;}
  const readingText = text.value.trim();
  if (mode === 'paste' && readingText.length < 80) {
    message('Paste at least 80 characters of reading text.');
    text.focus();
    return;
  }
  setBusy(true);
  debug.hidden = true;
  message(mode === 'scan' ? 'Reading this page and preparing its soundtrack…' : mode==='import' ? 'Reading your file and preparing its soundtrack…' : 'Preparing your text and soundtrack…');
  try {
    const request = {type: 'open-reader', mode};
    if (mode === 'scan') {
      // Capture the source tab before the worker creates the reader tab.
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      request.tabId = tab?.id;
    } else if(mode==='import') request.file=await encodeDocument(selectedFile);
    else request.text = readingText;
    const result = await chrome.runtime.sendMessage(request);
    if (!result?.ok) throw Object.assign(new Error(result?.error || 'Could not prepare the reader. Please try again.'), {diagnostic: result?.diagnostic});
    window.close();
  } catch (error) {
    const diagnostic = error.diagnostic || {code: /^(FILE|SERVER)_[A-Z_]+$/.test(error.code)?error.code:'POPUP_CONNECTION_FAILED', stage: error.stage || 'handoff', mode, version: chrome.runtime.getManifest().version};
    console.error('[Undertone]', diagnostic);
    showDiagnostic(diagnostic);
    message(`[${diagnostic.code}] ${error.message || 'Could not prepare the reader. Please try again.'}`);
    setBusy(false);
  }
}

function showView(view) {
  if (opening) return;
  choices.hidden = view !== 'choices';
  importFile.hidden = view !== 'choices';
  form.hidden = view !== 'paste';
  importForm.hidden = view !== 'import';
  paste.setAttribute('aria-expanded', String(view==='paste'));
  importFile.setAttribute('aria-expanded', String(view==='import'));
  message('');
  (view==='paste'?text:view==='import'?fileInput:paste).focus();
}
paste.addEventListener('click',()=>showView('paste'));
back.addEventListener('click',()=>showView('choices'));
importFile.addEventListener('click',()=>showView('import'));
importBack.addEventListener('click',()=>{showView('choices');if(!opening)importFile.focus();});
form.addEventListener('submit', event => {
  event.preventDefault();
  return openReader('paste');
});
scan.addEventListener('click', () => openReader('scan'));
importForm.addEventListener('submit',event=>{event.preventDefault();return openReader('import');});
