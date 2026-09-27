import {readFileSync} from 'node:fs';
const appVersion=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chunkText} from '../shared/analysis.js';
import {analyze} from './gemini.js';
import {isPublicPath} from './static-path.js';
import {serveStaticFile} from './static-file.js';
import {extractPdf, MAX_PDF_BYTES} from './pdf.js';
import {extractDocx} from './docx.js';
let activePdfs=0;
const extensionRoot=fileURLToPath(new URL('../extension/',import.meta.url));
const port=Number(process.env.PORT||8787); let active=0; const calls=[];
function publicError(error, fallback='Could not prepare the reader. Please try again.') {
 const safeMessage=typeof error?.message==='string' && (error.message.startsWith('Gemini') || (error.status===503 && error.message.startsWith('Add GEMINI_API_KEY')));
 const body={error:error?.name==='TimeoutError'?'Gemini timed out. Please try again.':safeMessage?error.message:fallback};
 if(typeof error?.code==='string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)) body.code=error.code;
 if(Number.isFinite(error?.retryAfterSeconds) && error.retryAfterSeconds>=0) body.retryAfterSeconds=error.retryAfterSeconds;
 if(Number.isInteger(error?.upstreamStatus) && error.upstreamStatus>=400 && error.upstreamStatus<=599) body.upstreamStatus=error.upstreamStatus;
 return body;
}
function errorStatus(error) { return Number.isInteger(error?.status) && error.status>=400 && error.status<=599?error.status:502; }
const server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin; const local=`http://127.0.0.1:${port}`;
 const extension=origin&&/^chrome-extension:\/\/[a-p]{32}$/.test(origin)&&(!process.env.EXTENSION_ID||origin===`chrome-extension://${process.env.EXTENSION_ID}`);
 if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`){res.writeHead(403);res.end();return;}
 if(origin&&origin!==local&&origin!==`http://localhost:${port}`&&!extension){res.writeHead(403);res.end();return;}
 if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
 res.setHeader('Access-Control-Allow-Headers','Content-Type, Range');res.setHeader('Access-Control-Allow-Methods','GET, HEAD, POST, OPTIONS');res.setHeader('Access-Control-Expose-Headers','Accept-Ranges, Content-Length, Content-Range');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 const json=(status,obj)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(obj));};
 try {
  const url=new URL(req.url,local);
  if(url.pathname==='/api/health'){json(200,{ready:Boolean(process.env.GEMINI_API_KEY),version:appVersion});return;}
  if(['/api/pdf-text','/api/docx-text'].includes(url.pathname)&&req.method==='POST'){
   const docx=url.pathname==='/api/docx-text',prefix=docx?'DOCX':'PDF';
   const contentType=docx?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/pdf';
   if(req.headers['content-type']?.split(';')[0]!==contentType){json(415,{code:prefix+'_CONTENT_TYPE',error:'Document upload required.'});return;}
   if(activePdfs>=2){json(429,{code:prefix+'_BUSY',error:'Document extraction is busy. Wait a moment and retry.'});return;}
   activePdfs++;
   const controller=new AbortController();
   const disconnected=()=>{if(!res.writableEnded)controller.abort(new DOMException('Client disconnected.','AbortError'));};
   res.once('close',disconnected);
   try{
    const parts=[];let bytes=0;
    for await(const part of req){bytes+=part.length;if(bytes>MAX_PDF_BYTES){json(413,{code:prefix+'_TOO_LARGE',error:'File exceeds 20 MB. Choose a smaller file.'});return;}parts.push(part);}
    const result=await (docx?extractDocx:extractPdf)(Buffer.concat(parts),{signal:controller.signal});
    if(!res.destroyed)json(200,result);
   }catch(error){if(!res.destroyed)json(errorStatus(error),{code:/^(PDF|DOCX)_[A-Z_]+$/.test(error.code)?error.code:prefix+'_INVALID',error:/^(PDF|DOCX)_[A-Z_]+$/.test(error.code)?error.message:'Document could not be read. Choose a fresh copy.'});}
   finally{activePdfs--;res.off('close',disconnected);}
   return;
  }
  if(url.pathname==='/api/analyze'&&req.method==='POST'){
   if(!req.headers['content-type']?.startsWith('application/json')){json(415,{error:'JSON required.'});return;}
   const parts=[];let bytes=0;for await(const part of req){bytes+=part.length;if(bytes>600000){json(413,{error:'Article is too large.'});return;}parts.push(part);}
   const body=Buffer.concat(parts).toString('utf8');
   let input,chunks;try{input=JSON.parse(body);chunks=chunkText(input.text);}catch(e){json(400,{error:e.message});return;}
   while(calls.length&&calls[0]<Date.now()-60000)calls.shift();
   if(active>=2||calls.length>=12){json(429,{error:'Too many requests. Please wait a minute.'});return;}
   calls.push(Date.now());active++;
   let heartbeat;
   const controller=new AbortController();
   let cleaned=false;
   const cleanup=()=>{
    if(cleaned)return;
    cleaned=true;clearInterval(heartbeat);res.off('close',disconnected);active--;
   };
   const disconnected=()=>{
    if(!res.writableEnded)controller.abort(new DOMException('Client disconnected.','AbortError'));
    cleanup();
   };
   res.once('close',disconnected);
   const streaming=input.stream===true;
   try {
    // Send headers promptly so a slow Gemini response does not exceed the
    // extension worker's fetch-header timeout. Whitespace remains valid JSON.
    if(streaming){res.writeHead(200,{'Content-Type':'application/json'});res.write(' ');heartbeat=setInterval(()=>{if(!res.destroyed)res.write(' ');},10000);}
    const score=await analyze(chunks,{cleanPage:input.scan===true,signal:controller.signal});
    if(res.destroyed)return;
    if(streaming)res.end(JSON.stringify(score));else json(200,score);
   }catch(error){
    if(res.destroyed)return;
    const failure=publicError(error);
    if(streaming)res.end(JSON.stringify(failure));else json(errorStatus(error),failure);
   }finally{cleanup();}
   return;
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){json(405,{error:'Method not allowed.'});return;}
  if(url.pathname==='/'){json(200,{service:'Undertone',message:'Use Undertone from the Chrome toolbar. The reader opens after your text is ready.'});return;}
  const rel=decodeURIComponent(url.pathname.slice(1));
  if(!isPublicPath(rel)){json(404,{error:'Not found.'});return;}
  const file=path.resolve(extensionRoot,rel);if(!file.startsWith(extensionRoot)){json(404,{error:'Not found.'});return;}
  await serveStaticFile(req,res,file);
 }catch(e){if(!res.destroyed)json(e.code==='ENOENT'?404:errorStatus(e),e.code==='ENOENT'?{error:'Not found.'}:publicError(e,'Analysis failed. Please retry from the extension menu.'));}
});
server.listen(port,'127.0.0.1',()=>console.log(`Undertone server ready at http://127.0.0.1:${port}. Open Undertone from the Chrome toolbar to read.`));
