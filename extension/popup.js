import {readPdfBytes, MAX_PDF_BYTES} from './pdf.js';
const $ = id => document.getElementById(id);
const pdfFile=$('pdf-file'), openPdf=$('open-pdf');
const paste = $('paste'), scan = $('scan'), status = $('status');
const choices = $('choices'), form = $('paste-form'), text = $('text');
const back = $('back'), submit = $('open-reader');
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
  for (const control of [paste, scan, back, submit, text, openPdf, pdfFile]) control.disabled = value;
  submit.textContent = value ? 'Preparing reader…' : 'Open reader';
}

async function openReader(mode, file) {
  if (opening) return;
  const readingText = text.value.trim();
  if (mode === 'paste' && readingText.length < 80) {
    message('Paste at least 80 characters of reading text.');
    text.focus();
    return;
  }
  setBusy(true);
  debug.hidden = true;
  message(mode === 'scan' ? 'Reading this page and preparing its soundtrack…' : 'Preparing your text and soundtrack…');
  try {
    const request = {type: 'open-reader', mode};
    if (mode === 'scan') {
      // Capture the source tab before the worker creates the reader tab.
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      request.tabId = tab?.id;
    } else if (mode === 'pdf') {
      message('Extracting PDF text locally…');
      if(file.size>MAX_PDF_BYTES)throw Object.assign(new Error('PDF exceeds 20 MB. Choose a smaller file.'),{code:'PDF_TOO_LARGE'});
      const article=await readPdfBytes(await file.arrayBuffer());
      request.text=article.text;request.title=article.title==='PDF reading'?file.name:article.title;
      message('Preparing the PDF soundtrack…');
    } else request.text = readingText;
    const result = await chrome.runtime.sendMessage(request);
    if (!result?.ok) throw Object.assign(new Error(result?.error || 'Could not prepare the reader. Please try again.'), {diagnostic: result?.diagnostic});
    window.close();
  } catch (error) {
    const diagnostic = error.diagnostic || {code: /^(PDF|SERVER)_[A-Z_]+$/.test(error.code)?error.code:'POPUP_CONNECTION_FAILED', stage: mode==='pdf'?'pdf':'handoff', mode, version: chrome.runtime.getManifest().version};
    console.error('[Undertone]', diagnostic);
    showDiagnostic(diagnostic);
    message(`[${diagnostic.code}] ${error.message || 'Could not prepare the reader. Please try again.'}`);
    setBusy(false);
  }
}

paste.addEventListener('click', () => {
  if (opening) return;
  choices.hidden = true;
  form.hidden = false;
  paste.setAttribute('aria-expanded', 'true');
  message('');
  text.focus();
});
back.addEventListener('click', () => {
  if (opening) return;
  form.hidden = true;
  choices.hidden = false;
  paste.setAttribute('aria-expanded', 'false');
  message('');
  paste.focus();
});
form.addEventListener('submit', event => {
  event.preventDefault();
  return openReader('paste');
});
scan.addEventListener('click', () => openReader('scan'));
openPdf.addEventListener('click',()=>{if(!opening)pdfFile.click();});
pdfFile.addEventListener('change',async()=>{
  const file=pdfFile.files?.[0];
  if(file)await openReader('pdf',file);
  pdfFile.value='';
});
