import {MAX_FILE_BYTES, readDocument} from './document-file.js';

const fail=(code,message)=>Object.assign(new Error(message),{code,stage:'import'});
function checkName(name) {
  if(typeof name!=='string'||name.length>1024||! /\.(pdf|docx)$/i.test(name)) {
    throw fail('FILE_UNSUPPORTED','Choose a PDF or Word DOCX file. For older .doc files, save a DOCX copy first.');
  }
}

// Chrome messages use JSON. Base64 keeps a 20 MB file below the message limit;
// raw file bytes are never placed in extension storage or diagnostic reports.
export async function encodeDocument(file) {
  checkName(file?.name);
  if(file.size>MAX_FILE_BYTES)throw fail('FILE_TOO_LARGE','File exceeds 20 MB. Choose a smaller document.');
  let buffer;
  try { buffer=await file.arrayBuffer(); }
  catch { throw fail('FILE_READ_FAILED','The selected file could not be read. Choose it again.'); }
  if(buffer.byteLength>MAX_FILE_BYTES)throw fail('FILE_TOO_LARGE','File exceeds 20 MB. Choose a smaller document.');
  const bytes=new Uint8Array(buffer),parts=[];
  for(let offset=0;offset<bytes.length;offset+=32768)parts.push(String.fromCharCode(...bytes.subarray(offset,offset+32768)));
  return {name:file.name,base64:btoa(parts.join(''))};
}

export async function readTransferredDocument(file,fetcher=fetch) {
  checkName(file?.name);
  if(typeof file.base64!=='string')throw fail('FILE_INVALID','Choose the document again before opening the reader.');
  if(file.base64.length>4*Math.ceil(MAX_FILE_BYTES/3))throw fail('FILE_TOO_LARGE','File exceeds 20 MB. Choose a smaller document.');
  let binary;
  try { binary=atob(file.base64); }
  catch { throw fail('FILE_INVALID','The document transfer was interrupted. Choose the file again.'); }
  if(binary.length>MAX_FILE_BYTES)throw fail('FILE_TOO_LARGE','File exceeds 20 MB. Choose a smaller document.');
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return readDocument({name:file.name,size:bytes.length,arrayBuffer:async()=>bytes.buffer},fetcher);
}
