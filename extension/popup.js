const $ = id => document.getElementById(id);
const paste = $('paste'), scan = $('scan'), status = $('status');
const choices = $('choices'), form = $('paste-form'), text = $('text');
const back = $('back'), submit = $('open-reader');
let opening = false;

function message(value) {
  status.textContent = value;
  status.hidden = !value;
}

function setBusy(value) {
  opening = value;
  for (const control of [paste, scan, back, submit, text]) control.disabled = value;
  submit.textContent = value ? 'Preparing reader…' : 'Open reader';
}

async function openReader(mode) {
  if (opening) return;
  const readingText = text.value.trim();
  if (mode === 'paste' && readingText.length < 80) {
    message('Paste at least 80 characters of reading text.');
    text.focus();
    return;
  }
  setBusy(true);
  message(mode === 'scan' ? 'Reading this page and preparing its soundtrack…' : 'Preparing your text and soundtrack…');
  try {
    const request = {type: 'open-reader', mode};
    if (mode === 'scan') {
      // Capture the source tab before the worker creates the reader tab.
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      request.tabId = tab?.id;
    } else request.text = readingText;
    const result = await chrome.runtime.sendMessage(request);
    if (!result?.ok) throw new Error(result?.error || 'Could not prepare the reader. Please try again.');
    window.close();
  } catch (error) {
    message(error.message || 'Could not prepare the reader. Please try again.');
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
