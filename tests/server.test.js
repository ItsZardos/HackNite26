import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';

test('fresh backend serves reader/music and protects private files on the host OS', {timeout:20000}, async()=>{
  const reservation=net.createServer();
  await new Promise((resolve,reject)=>{reservation.once('error',reject);reservation.listen(0,'127.0.0.1',resolve);});
  const port=reservation.address().port;
  await new Promise(resolve=>reservation.close(resolve));
  const server=spawn(process.execPath,[fileURLToPath(new URL('../scripts/start.js',import.meta.url))],{
    cwd:tmpdir(),env:{...process.env,PORT:String(port),GEMINI_API_KEY:''},stdio:['ignore','pipe','pipe']
  });
  try {
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Server did not start')),8000);
      server.stdout.once('data',()=>{clearTimeout(timer);resolve();});
      server.once('error',error=>{clearTimeout(timer);reject(error);});
      server.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited: ${code}`));});
    });
    const base=`http://127.0.0.1:${port}`;
    let response=await fetch(base+'/');
    assert.equal(response.status,200);
    assert.match(await response.text(),/undertone/);
    for(const route of ['/.env','/reader/..%5c.env','/reader/%2e%2e%5cserver/index.js','/server/index.js']){
      response=await fetch(base+route);assert.equal(response.status,404,route);
    }
    response=await fetch(base+'/api/health',{headers:{Origin:'https://example.org'}});
    assert.equal(response.status,403);
    for(const mood of ['calm','happy','hopeful','melancholy','mysterious','tense','dark','triumphant']){
      response=await fetch(`${base}/public/music/${mood}.wav`);assert.equal(response.status,200);
      const data=Buffer.from(await response.arrayBuffer());assert.equal(data.toString('ascii',0,4),'RIFF');assert.ok(data.length>700000);
    }
    response=await fetch(base+'/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'A calm morning by the sea. '.repeat(30)})});
    assert.equal(response.status,503);assert.match((await response.json()).error,/GEMINI_API_KEY/);
  } finally { server.kill(); }
});
