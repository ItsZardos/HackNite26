import test from 'node:test';
import assert from 'node:assert/strict';
import {isPublicPath} from '../server/static-path.js';

test('static files stay within public namespaces on Windows and POSIX',()=>{
  for(const url of ['reader/..%5c.env','reader/%2e%2e%5cserver/index.js','reader/../.env','public/music/../../.env','reader/%00.env','.env','server/index.js']){
    assert.equal(isPublicPath(decodeURIComponent(url)),false,url);
  }
  for(const file of ['reader/index.html','reader/app.js','public/music/calm.wav','shared/analysis.js'])assert.equal(isPublicPath(file),true,file);
});
