import test from 'node:test';
import assert from 'node:assert/strict';
import {sectionAtFocus} from '../extension/reader/reading-position.js';
const bounds=[{top:0,bottom:500},{top:500,bottom:1000},{top:1000,bottom:1020}];
test('focus holds through boundary jitter in either direction',()=>{
 assert.equal(sectionAtFocus(bounds,525,0),0);assert.equal(sectionAtFocus(bounds,540,0),1);
 assert.equal(sectionAtFocus(bounds,475,1),1);assert.equal(sectionAtFocus(bounds,460,1),0);
});
test('focus handles rapid skips, short final sections and overscroll',()=>{
 assert.equal(sectionAtFocus(bounds,1070,0),2);assert.equal(sectionAtFocus(bounds,-80,2),0);
 assert.equal(sectionAtFocus(bounds,650,-1),1);assert.equal(sectionAtFocus([],100),-1);
});
