import {Worker} from 'node:worker_threads';

export const MAX_PDF_BYTES=20*1024*1024;
const messages={
  PDF_TOO_LARGE:'PDF exceeds 20 MB. Choose a smaller file or export only the pages you need.',
  PDF_TOO_MANY_PAGES:'PDF exceeds 200 pages. Export the pages you want to read as a smaller PDF.',
  PDF_TEXT_TOO_LONG:'PDF contains more than 100,000 characters. Export a shorter selection of pages.',
  PDF_NO_TEXT:'PDF has fewer than 80 readable characters. Image-only scans need OCR first; export a searchable PDF or paste recognized text.',
  PDF_PASSWORD_REQUIRED:'PDF is password protected. Unlock it locally and select the unlocked copy.',
  PDF_INVALID:'PDF could not be read. Download a fresh copy and choose Import file.',
  PDF_TIMEOUT:'PDF text extraction took too long. Choose a smaller file.',
  PDF_DEPENDENCY_MISSING:'PDF support is not installed. Run npm ci in the checkout, then restart npm start.'
};
export const pdfFailure=code=>Object.assign(new Error(messages[code]||messages.PDF_INVALID),{code,status:code==='PDF_TOO_LARGE'?413:422});

export function extractPdf(bytes,{signal,timeoutMs=30000}={}) {
  if(bytes.length>MAX_PDF_BYTES)return Promise.reject(pdfFailure('PDF_TOO_LARGE'));
  if(Buffer.from(bytes).subarray(0,1024).indexOf('%PDF-')<0)return Promise.reject(pdfFailure('PDF_INVALID'));
  if(signal?.aborted)return Promise.reject(signal.reason);
  // Isolate parsing from the HTTP server; bound memory, time and cancellation.
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./pdf-worker.js',import.meta.url),{workerData:bytes,
      resourceLimits:{maxOldGenerationSizeMb:256},execArgv:[]});
    let settled=false;
    const finish=(error,result)=>{
      if(settled)return;settled=true;
      clearTimeout(timer);signal?.removeEventListener('abort',abort);
      void worker.terminate();
      if(error)reject(error);else resolve(result);
    };
    const abort=()=>finish(signal.reason);
    const timer=setTimeout(()=>finish(pdfFailure('PDF_TIMEOUT')),timeoutMs);
    signal?.addEventListener('abort',abort,{once:true});
    worker.once('message',result=>result.code?finish(pdfFailure(result.code)):finish(null,result));
    worker.once('error',error=>finish(pdfFailure(error.code==='ERR_MODULE_NOT_FOUND'?'PDF_DEPENDENCY_MISSING':'PDF_INVALID')));
    worker.once('exit',()=>{if(!settled)finish(pdfFailure('PDF_INVALID'));});
  });
}
