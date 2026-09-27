import {readPdfBytes, MAX_PDF_BYTES} from './pdf.js';
export const MAX_FILE_BYTES=MAX_PDF_BYTES;
const fail=(code,message)=>Object.assign(new Error(message),{code,stage:'import'});
export async function readDocument(file,fetcher=fetch) {
  const extension=file.name.toLowerCase().split('.').pop();
  if(!['pdf','docx'].includes(extension))throw fail('FILE_UNSUPPORTED','Choose a PDF or Word DOCX file. For older .doc files, save a DOCX copy in Word first.');
  if(file.size>MAX_FILE_BYTES)throw fail('FILE_TOO_LARGE','File exceeds 20 MB. Choose a smaller document.');
  const bytes=await file.arrayBuffer();
  if(extension==='pdf')return {...await readPdfBytes(bytes,fetcher),title:file.name};
  if(bytes.byteLength>MAX_FILE_BYTES)throw fail('FILE_TOO_LARGE','File exceeds 20 MB. Choose a smaller document.');
  const prefix=new Uint8Array(bytes);
  if(prefix[0]!==0x50||prefix[1]!==0x4b)throw fail('DOCX_INVALID','This is not a readable DOCX file. Open it in Word and save a new .docx copy.');
  let response,result;
  try {
    response=await fetcher('http://127.0.0.1:8787/api/docx-text',{method:'POST',
      headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},body:bytes,signal:AbortSignal.timeout(40000)});
    result=await response.json();
  }catch(error){throw fail(error.name==='TimeoutError'?'FILE_TIMEOUT':'SERVER_UNREACHABLE',error.name==='TimeoutError'?'Document extraction timed out. Choose a smaller file.':'Start or update the server: run npm ci, then npm start.');}
  if(!response.ok||result.error)throw fail(/^DOCX_[A-Z_]+$/.test(result.code)?result.code:'DOCX_SERVER_RESPONSE',typeof result.error==='string'?result.error:'DOCX support is unavailable. Run npm ci and restart the server.');
  if(typeof result.text!=='string'||result.text.length<80||result.text.length>100000)throw fail('DOCX_TEXT_LIMIT','Use a document with 80 to 100,000 readable characters.');
  return {text:result.text,title:file.name,author:'',kind:'docx'};
}

export async function readLocalDocument(address,api=chrome,fetcher=fetch) {
  const url=new URL(address);
  if(url.protocol!=='file:'||! /\.(pdf|docx)$/i.test(url.pathname))throw fail('FILE_UNSUPPORTED','Automatic local scanning supports PDF and DOCX. Use Import file for a saved copy.');
  if(!await api.extension.isAllowedFileSchemeAccess())throw fail('FILE_ACCESS_REQUIRED','Enable Allow access to file URLs in chrome://extensions → Undertone → Details, then click Scan page again. This permission is needed once for automatic local PDF and DOCX reading.');
  let response;
  try{response=await fetcher(url.href,{signal:AbortSignal.timeout(25000)});}catch{throw fail('FILE_READ_FAILED','Chrome could not read this local file. Check file access in Undertone’s extension details and reopen the file tab. Import file is also available.');}
  if(!response.ok)throw fail('FILE_READ_FAILED','This local file could not be opened. Reopen it in Chrome or choose Import file.');
  if(Number(response.headers.get('content-length'))>MAX_FILE_BYTES){await response.body?.cancel();throw fail('FILE_TOO_LARGE','File exceeds 20 MB. Choose a smaller document.');}
  const reader=response.body?.getReader();
  if(!reader)throw fail('FILE_READ_FAILED','The local file was empty. Reopen it or choose Import file.');
  const parts=[];let length=0;
  try{
    while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;
      if(length>MAX_FILE_BYTES){await reader.cancel();throw fail('FILE_TOO_LARGE','File exceeds 20 MB. Choose a smaller document.');}
      parts.push(value);
    }
  }catch(error){if(error.code?.startsWith('FILE_'))throw error;throw fail('FILE_READ_FAILED','Reading the local file was interrupted. Click Scan page to retry.');}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  let name=url.pathname.split('/').pop();try{name=decodeURIComponent(name);}catch{}
  return readDocument({name,size:length,arrayBuffer:async()=>bytes.buffer},fetcher);
}
