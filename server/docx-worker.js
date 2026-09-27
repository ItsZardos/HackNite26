import {parentPort,workerData} from 'node:worker_threads';
import mammoth from 'mammoth';
try {
 const buffer=Buffer.from(workerData);
 // DOCX is a ZIP archive. Bound the declared expanded size before parsing.
 let end=-1;
 for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw new Error();
 const count=buffer.readUInt16LE(end+10);let offset=buffer.readUInt32LE(end+16),expanded=0,hasDocument=false;
 if(count>2000)throw Object.assign(new Error(),{code:'DOCX_TOO_COMPLEX'});
 for(let i=0;i<count;i++){
  if(offset+46>buffer.length||buffer.readUInt32LE(offset)!==0x02014b50)throw new Error();
  expanded+=buffer.readUInt32LE(offset+24);
  if(expanded>40*1024*1024)throw Object.assign(new Error(),{code:'DOCX_TOO_COMPLEX'});
  const nameLength=buffer.readUInt16LE(offset+28);
  if(buffer.subarray(offset+46,offset+46+nameLength).toString()==='word/document.xml')hasDocument=true;
  offset+=46+nameLength+buffer.readUInt16LE(offset+30)+buffer.readUInt16LE(offset+32);
 }
 if(!hasDocument)throw new Error();
 // Extract text only. Never render document HTML or follow external file links.
 const result=await mammoth.extractRawText({buffer},{externalFileAccess:false});
 const text=result.value.trim();
 if(text.length<80)throw Object.assign(new Error(),{code:'DOCX_NO_TEXT'});
 if(text.length>100000)throw Object.assign(new Error(),{code:'DOCX_TEXT_TOO_LONG'});
 parentPort.postMessage({text});
}catch(error){parentPort.postMessage({code:error.code?.startsWith('DOCX_')?error.code:'DOCX_INVALID'});}
