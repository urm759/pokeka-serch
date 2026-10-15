const assert=require('node:assert/strict'),{sourceTiming}=require('./workflow_schedule');
const at=new Date('2026-10-15T13:00:00Z');
const held=sourceTiming('yuyutei',{status:'partial',diagnostics:{externalBlock:{httpStatus:403}}},[],at);
assert.equal(held.acquisitionStopped,true);assert.equal(held.nextScheduledAt,null);
const normal=sourceTiming('torecacamp',{status:'partial',sourceRetry:{scope:'url',manual:true}},[],at);
assert.equal(normal.acquisitionStopped,false);assert(normal.nextScheduledAt,'one held product cannot stop the whole shop');
assert(sourceTiming('hareruya2',{status:'partial'},[],at).nextScheduledAt);
assert.equal(sourceTiming('yuyutei',{status:'success',lastSuccessAt:'2026-10-15T12:00:00Z',diagnostics:{externalBlock:{detectedAt:'2026-09-28T22:23:11Z',httpStatus:403}}},[],at).acquisitionStopped,false,'a proven newer regular success distinguishes a historical block');
console.log('PASS persistent external block is stopped, independent shops and URL-scoped holds stay separate');
