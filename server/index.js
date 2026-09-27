import http from 'node:http';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chunkText} from '../shared/analysis.js';
import {analyze} from './gemini.js';
import {isPublicPath} from './static-path.js';
import {serveStaticFile} from './static-file.js';
const extensionRoot=fileURLToPath(new URL('../extension/',import.meta.url));
const port=Number(process.env.PORT||8787); let active=0; const calls=[];
function publicError(error, fallback='Could not prepare the reader. Please try again.') {
 const safeMessage=typeof error?.message==='string' && (error.message.startsWith('Gemini') || (error.status===503 && error.message.startsWith('Add GEMINI_API_KEY')));
 const body={error:error?.name==='TimeoutError'?'Gemini timed out. Please try again.':safeMessage?error.message:fallback};
 if(typeof error?.code==='string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)) body.code=error.code;
 if(Number.isFinite(error?.retryAfterSeconds) && error.retryAfterSeconds>=0) body.retryAfterSeconds=error.retryAfterSeconds;
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
  if(url.pathname==='/api/health'){json(200,{ready:Boolean(process.env.GEMINI_API_KEY)});return;}
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
  if(url.pathname==='/'){res.writeHead(302,{Location:'/reader/index.html'});res.end();return;}
  const rel=decodeURIComponent(url.pathname.slice(1));
  if(!isPublicPath(rel)){json(404,{error:'Not found.'});return;}
  const file=path.resolve(extensionRoot,rel);if(!file.startsWith(extensionRoot)){json(404,{error:'Not found.'});return;}
  await serveStaticFile(req,res,file);
 }catch(e){if(!res.destroyed)json(e.code==='ENOENT'?404:errorStatus(e),e.code==='ENOENT'?{error:'Not found.'}:publicError(e,'Analysis failed. Please retry or open the sample journey.'));}
});
server.listen(port,'127.0.0.1',()=>console.log(`Undertone ready at http://127.0.0.1:${port}`));
