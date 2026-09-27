import {launchReader} from './reader-launch.js';

// The worker owns the whole handoff: closing the popup cannot cancel a scan.
chrome.runtime.onMessage.addListener((request, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html') || request?.type !== 'open-reader') return;
  if (!['paste','scan','import'].includes(request.mode)) {
    respond({ok: false, error: 'Unknown reader action.'});
    return;
  }
  launchReader(request).then(async () => {
    try { await chrome.storage.session.remove('undertone-last-error'); } catch {}
    respond({ok: true});
  }, async error => {
    const diagnostic = {
      version: chrome.runtime.getManifest().version,
      time: new Date().toISOString(),
      ...(error.diagnostic || {code: 'UNEXPECTED_ERROR', stage: 'handoff', mode: request.mode, events: []})
    };
    console.error('[Undertone]', diagnostic);
    const result = {ok: false, error: error.message || 'Could not prepare the reader. Please try again.', diagnostic};
    try { await chrome.storage.session.set({'undertone-last-error': result}); } catch {}
    respond(result);
  });
  // Preserve the response channel while asynchronous Chrome APIs finish.
  return true;
});
