import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';

test('fresh backend serves APIs/assets without a standalone reader or private files', {timeout:20000}, async()=>{
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
    assert.match((await response.json()).message,/Chrome toolbar/);
    response=await fetch(base+'/reader/app.js');
    assert.equal(response.status,404);
    response=await fetch(base+'/public/brand/monkey.png');
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'image/png');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()).subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
    for(const route of ['/reader/index.html','/import.html','/.env','/local.env','/reader/..%5c.env','/reader/%2e%2e%5cserver/index.js','/reader/..%5cshared/analysis.js','/server/index.js','/shared/analysis.js','/extension/reader/index.html','/scripts/start.js','/package.json']){
      response=await fetch(base+route);assert.equal(response.status,404,route);
    }
    response=await fetch(base+'/api/health',{headers:{Origin:'https://example.org'}});
    assert.equal(response.status,403);
    for(const mood of ['calm','happy','hopeful','melancholy','mysterious','tense','dark','triumphant']){
      response=await fetch(`${base}/public/music/${mood}.wav`);assert.equal(response.status,200);
      const data=Buffer.from(await response.arrayBuffer());assert.equal(data.toString('ascii',0,4),'RIFF');assert.ok(data.length>700000);
      assert.equal(response.headers.get('content-type'),'audio/wav');
      assert.equal(response.headers.get('content-length'),String(data.length));
      assert.equal(response.headers.get('accept-ranges'),'bytes');
    }
    const mp3=base+'/public/music/recordings/slow-stride.mp3';
    response=await fetch(mp3,{headers:{Range:'bytes=0-2'}});
    assert.equal(response.status,206);assert.equal(response.headers.get('content-type'),'audio/mpeg');
    assert.equal(await response.text(),'ID3');
    response=await fetch(mp3,{method:'HEAD'});
    assert.equal(response.headers.get('content-type'),'audio/mpeg');assert.ok(Number(response.headers.get('content-length'))>100000);
    const musicURL=base+'/public/music/calm.wav';
    const complete=Buffer.from(await (await fetch(musicURL)).arrayBuffer());
    for(const headers of [{},{Range:'bytes=0-43'}]){
      response=await fetch(musicURL,{method:'HEAD',headers});
      assert.equal(response.status,200);
      assert.equal(response.headers.get('content-type'),'audio/wav');
      assert.equal(response.headers.get('content-length'),String(complete.length));
      assert.equal(response.headers.get('accept-ranges'),'bytes');
      assert.equal(response.headers.get('content-range'),null);
      assert.equal((await response.arrayBuffer()).byteLength,0,'HEAD must not send a body');
    }
    const ranges=[
      ['bytes=0-43',0,43],
      ['bytes=-32',complete.length-32,complete.length-1],
      [`bytes=${complete.length-16}-`,complete.length-16,complete.length-1],
      [`bytes=${complete.length-16}-${complete.length+100}`,complete.length-16,complete.length-1],
      [`bytes=-${complete.length+100}`,0,complete.length-1]
    ];
    for(const [range,start,end] of ranges){
      response=await fetch(musicURL,{headers:{Range:range}});
      assert.equal(response.status,206,range);
      assert.equal(response.headers.get('content-type'),'audio/wav');
      assert.equal(response.headers.get('content-range'),`bytes ${start}-${end}/${complete.length}`);
      assert.equal(response.headers.get('content-length'),String(end-start+1));
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),complete.subarray(start,end+1),range);
    }
    for(const range of [`bytes=${complete.length}-`,'bytes=10-9','bytes=-0','bytes=oops','bytes=-','bytes=0-1,4-5','bytes=9007199254740992-']){
      response=await fetch(musicURL,{headers:{Range:range}});
      assert.equal(response.status,416,range);
      assert.equal(response.headers.get('content-range'),`bytes */${complete.length}`);
      assert.equal(response.headers.get('content-length'),'0');
      assert.equal((await response.arrayBuffer()).byteLength,0);
    }
    response=await fetch(base+'/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'A calm morning by the sea. '.repeat(30)})});
    assert.equal(response.status,503);assert.match((await response.json()).error,/GEMINI_API_KEY/);
    response=await fetch(base+'/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'A calm morning by the sea. '.repeat(30),scan:true,stream:true})});
    assert.equal(response.status,200);assert.match((await response.json()).error,/GEMINI_API_KEY/);
  } finally { server.kill(); }
});
