export const MAX_PDF_BYTES=20*1024*1024;
const fail=(code,message)=>Object.assign(new Error(message),{code,stage:'pdf'});

export async function readPdfBytes(bytes,fetcher=fetch) {
  if(bytes.byteLength>MAX_PDF_BYTES)throw fail('PDF_TOO_LARGE','PDF exceeds 20 MB. Choose a smaller file.');
  if(!new TextDecoder().decode(new Uint8Array(bytes).slice(0,1024)).includes('%PDF-'))throw fail('PDF_INVALID','This file is not a PDF. Download the document and choose Open PDF file.');
  let response;
  try { response=await fetcher('http://127.0.0.1:8787/api/pdf-text',{
    method:'POST',headers:{'Content-Type':'application/pdf'},body:bytes,signal:AbortSignal.timeout(40000)
  }); } catch(error) {
    throw fail(error.name==='TimeoutError'?'PDF_TIMEOUT':'SERVER_UNREACHABLE',error.name==='TimeoutError'?'PDF extraction timed out. Choose a smaller file.':'Start Undertone with npm start, then try again.');
  }
  let result;
  try {result=await response.json();}catch{throw fail('PDF_SERVER_RESPONSE','The server could not extract the PDF. Pull the latest update, run npm ci, and restart npm start.');}
  if(!response.ok||result.error)throw fail(/^PDF_[A-Z_]+$/.test(result.code)?result.code:'PDF_SERVER_RESPONSE',typeof result.error==='string'?result.error:'PDF extraction failed.');
  if(typeof result.text!=='string'||result.text.length<80)throw fail('PDF_NO_TEXT','PDF has insufficient readable text. Image-only scans need OCR first.');
  return {text:result.text,title:result.title||'PDF reading',author:'',kind:'pdf',pages:result.pages};
}

export async function readPdfUrl(url,fetcher=fetch,{probe=false}={}) {
  if(!['https:','http:','file:'].includes(new URL(url).protocol))throw fail('PDF_URL_UNSUPPORTED','Open the original PDF or choose Open PDF file.');
  let response;
  try {response=await fetcher(url,{credentials:'include',signal:AbortSignal.timeout(25000)});}
  catch {
    if(probe)return null;
    throw fail('PDF_DOWNLOAD_FAILED','Chrome could not fetch this PDF. For local files, enable Allow access to file URLs in Undertone’s extension details. Otherwise download the PDF and choose Open PDF file.');
  }
  const type=response.headers.get('content-type')||'';
  if(probe&&type&&!/application\/(pdf|octet-stream)/i.test(type)){await response.body?.cancel();return null;}
  if(!response.ok){await response.body?.cancel();throw fail('PDF_DOWNLOAD_FAILED',`PDF download returned HTTP ${response.status}. Sign in to its site if needed, or download it and choose Open PDF file.`);}
  if(Number(response.headers.get('content-length'))>MAX_PDF_BYTES){await response.body?.cancel();throw fail('PDF_TOO_LARGE','PDF exceeds 20 MB. Choose a smaller file.');}
  const reader=response.body?.getReader();
  if(!reader)throw fail('PDF_DOWNLOAD_FAILED','The PDF download was empty. Download it and choose Open PDF file.');
  const parts=[];let length=0;
  try {
    while(true){
      const {value,done}=await reader.read();if(done)break;
      length+=value.byteLength;
      if(length>MAX_PDF_BYTES){await reader.cancel();throw fail('PDF_TOO_LARGE','PDF exceeds 20 MB. Choose a smaller file.');}
      parts.push(value);
      if(probe&&length>=1024){
        const prefix=new Uint8Array(1024);let position=0;
        for(const part of parts){const slice=part.subarray(0,1024-position);prefix.set(slice,position);position+=slice.length;if(position===1024)break;}
        if(!new TextDecoder().decode(prefix).includes('%PDF-')){await reader.cancel();return null;}
      }
    }
  }catch(error){if(error.code?.startsWith('PDF_'))throw error;throw fail('PDF_DOWNLOAD_FAILED','The PDF download was interrupted. Download it and choose Open PDF file.');}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;
  for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
  if(probe&&!new TextDecoder().decode(bytes.subarray(0,1024)).includes('%PDF-'))return null;
  return readPdfBytes(bytes,fetcher);
}
