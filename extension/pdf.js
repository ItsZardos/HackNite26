export const MAX_PDF_BYTES=20*1024*1024;
const fail=(code,message)=>Object.assign(new Error(message),{code,stage:'pdf'});

export async function readPdfBytes(bytes,fetcher=fetch) {
  if(bytes.byteLength>MAX_PDF_BYTES)throw fail('PDF_TOO_LARGE','PDF exceeds 20 MB. Choose a smaller file.');
  if(!new TextDecoder().decode(new Uint8Array(bytes).slice(0,1024)).includes('%PDF-'))throw fail('PDF_INVALID','This file is not a PDF. Download the document and choose Import file.');
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
