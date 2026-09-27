import test from 'node:test';
import assert from 'node:assert/strict';
import {checkScoring} from '../scripts/doctor.js';

test('doctor checks both schemas even if paste fails, without printing raw errors or text', async () => {
  const events=[], modes=[];
  const passed=await checkScoring({report:e=>events.push(e),analyzer:async(chunks,options)=>{
    modes.push(options.cleanPage);
    assert.ok(chunks[0].text.length>80);
    if(!options.cleanPage)throw Object.assign(new Error('private-key private-article'),{code:'GEMINI_UNAVAILABLE',upstreamStatus:503});
    return {sections:[{}]};
  }});
  assert.equal(passed,false);
  assert.deepEqual(modes,[false,true]);
  assert.equal(events[1].code,'GEMINI_UNAVAILABLE');
  assert.equal(events[1].upstreamStatus,503);
  assert.equal(events.at(-1).passed,true);
  assert.doesNotMatch(JSON.stringify(events),/private-key|private-article/);
});

test('doctor succeeds only when paste and scan both work', async () => {
  assert.equal(await checkScoring({report:()=>{},analyzer:async()=>({sections:[{}]})}),true);
});
