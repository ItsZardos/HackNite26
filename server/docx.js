import {Worker} from 'node:worker_threads';

export const MAX_DOCX_BYTES=20*1024*1024;
const messages={
 DOCX_TOO_LARGE:'DOCX exceeds 20 MB. Choose a smaller file.',
 DOCX_TOO_COMPLEX:'DOCX expands to too much data. Save a smaller copy without large embedded media.',
 DOCX_TEXT_TOO_LONG:'DOCX contains more than 100,000 characters. Import a shorter selection.',
 DOCX_NO_TEXT:'DOCX has fewer than 80 readable characters. Image-only documents need OCR first.',
 DOCX_INVALID:'DOCX could not be read. Unlock it if needed, then save a fresh .docx copy in Word.',
 DOCX_TIMEOUT:'DOCX extraction took too long. Choose a smaller file.',
 DOCX_DEPENDENCY_MISSING:'DOCX support is not installed. Run npm ci, then restart npm start.'
};
export const docxFailure=code=>Object.assign(new Error(messages[code]||messages.DOCX_INVALID),{code,status:code==='DOCX_TOO_LARGE'?413:422});

export function extractDocx(bytes,{signal,timeoutMs=30000}={}) {
  if(bytes.length>MAX_DOCX_BYTES)return Promise.reject(docxFailure('DOCX_TOO_LARGE'));
  if(bytes[0]!==0x50||bytes[1]!==0x4b)return Promise.reject(docxFailure('DOCX_INVALID'));
  if(signal?.aborted)return Promise.reject(signal.reason);
  // Isolate parsing from the HTTP server; bound memory, time and cancellation.
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./docx-worker.js',import.meta.url),{workerData:bytes,
      resourceLimits:{maxOldGenerationSizeMb:256},execArgv:[]});
    let settled=false;
    const finish=(error,result)=>{
      if(settled)return;settled=true;
      clearTimeout(timer);signal?.removeEventListener('abort',abort);
      void worker.terminate();
      if(error)reject(error);else resolve(result);
    };
    const abort=()=>finish(signal.reason);
    const timer=setTimeout(()=>finish(docxFailure('DOCX_TIMEOUT')),timeoutMs);
    signal?.addEventListener('abort',abort,{once:true});
    worker.once('message',result=>result.code?finish(docxFailure(result.code)):finish(null,result));
    worker.once('error',error=>finish(docxFailure(error.code==='ERR_MODULE_NOT_FOUND'?'DOCX_DEPENDENCY_MISSING':'DOCX_INVALID')));
    worker.once('exit',()=>{if(!settled)finish(docxFailure('DOCX_INVALID'));});
  });
}
