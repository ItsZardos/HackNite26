const paste = document.getElementById('paste');
const scan = document.getElementById('scan');
const status = document.getElementById('status');
let opening = false;

async function openReader(mode) {
  if (opening) return;
  opening = true;
  paste.disabled = scan.disabled = true;
  status.hidden = false;
  status.textContent = mode === 'scan' ? 'Reading the page…' : 'Opening reader…';
  try {
    // Capture the source before the worker opens a different tab.
    let tabId;
    if (mode === 'scan') {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      tabId = tab?.id;
    }
    const result = await chrome.runtime.sendMessage({type: 'open-reader', mode, tabId});
    if (!result?.ok) throw new Error('Could not open the reader. Please try again.');
    window.close();
  } catch {
    status.textContent = 'Could not open the reader. Please try again.';
    opening = false;
    paste.disabled = scan.disabled = false;
  }
}

paste.addEventListener('click', () => openReader('paste'));
scan.addEventListener('click', () => openReader('scan'));
