import test from 'node:test';
import assert from 'node:assert/strict';
import {isPublicPath} from '../server/static-path.js';

test('static files stay within public namespaces on Windows and POSIX',()=>{
  for(const url of ['reader/index.html','reader/app.js','reader/audio.js','reader/..%5c.env','reader/%2e%2e%5cserver/index.js','reader/..%5cshared/analysis.js','reader/../.env','public/music/../../.env','reader/%00.env','.env','local.env','server/index.js','shared/analysis.js','extension/reader/index.html','scripts/start.js']){
    assert.equal(isPublicPath(decodeURIComponent(url)),false,url);
  }
  for(const file of ['public/brand/monkey.png','public/music/calm.wav'])assert.equal(isPublicPath(file),true,file);
});
