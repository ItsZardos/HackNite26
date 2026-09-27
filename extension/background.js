import {launchReader} from './reader-launch.js';

// The worker owns the whole handoff: closing the popup cannot cancel a scan.
chrome.runtime.onMessage.addListener((request, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html') || request?.type !== 'open-reader') return;
  if (request.mode !== 'paste' && request.mode !== 'scan') {
    respond({ok: false});
    return;
  }
  launchReader(request).then(
    () => respond({ok: true}),
    () => respond({ok: false})
  );
  // Preserve the response channel while asynchronous Chrome APIs finish.
  return true;
});
