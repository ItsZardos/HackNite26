import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chunkText} from '../shared/analysis.js';
import {analyze} from './gemini.js';
import {isPublicPath} from './static-path.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PORT||8787); let active=0; const calls=[];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wav':'audio/wav','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin; const local=`http://127.0.0.1:${port}`;
 const extension=origin&&/^chrome-extension:\/\/[a-p]{32}$/.test(origin)&&(!process.env.EXTENSION_ID||origin===`chrome-extension://${process.env.EXTENSION_ID}`);
 if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`){res.writeHead(403);res.end();return;}
 if(origin&&origin!==local&&origin!==`http://localhost:${port}`&&!extension){res.writeHead(403);res.end();return;}
 if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
 res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 const json=(status,obj)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(obj));};
 try {
  const url=new URL(req.url,local);
  if(url.pathname==='/api/health'){json(200,{ready:Boolean(process.env.GEMINI_API_KEY)});return;}
  if(url.pathname==='/api/analyze'&&req.method==='POST'){
   if(!req.headers['content-type']?.startsWith('application/json')){json(415,{error:'JSON required.'});return;}
   let body='';for await(const part of req){body+=part;if(Buffer.byteLength(body)>150000){json(413,{error:'Article is too large.'});return;}}
   let input,chunks;try{input=JSON.parse(body);chunks=chunkText(input.text);}catch(e){json(400,{error:e.message});return;}
   while(calls.length&&calls[0]<Date.now()-60000)calls.shift();
   if(active>=2||calls.length>=12){json(429,{error:'Too many requests. Please wait a minute.'});return;}
   calls.push(Date.now());active++;try{json(200,await analyze(chunks));}finally{active--;};return;
  }
  if(req.method!=='GET'){json(405,{error:'Method not allowed.'});return;}
  if(url.pathname==='/'){res.writeHead(302,{Location:'/reader/index.html'});res.end();return;}
  const rel=decodeURIComponent(url.pathname.slice(1));
  if(!isPublicPath(rel)){json(404,{error:'Not found.'});return;}
  const file=path.resolve(root,rel);if(!file.startsWith(root)){json(404,{error:'Not found.'});return;}
  const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(data);
 }catch(e){json(e.code==='ENOENT'?404:e.status||502,{error:e.name==='TimeoutError'?'Gemini timed out. Please retry.':e.code==='ENOENT'?'Not found.':e.message?.startsWith('Gemini')||e.status===503?e.message:'Analysis failed. Please retry or open the sample journey.'});}
});
server.listen(port,'127.0.0.1',()=>console.log(`Undertone ready at http://127.0.0.1:${port}`));
