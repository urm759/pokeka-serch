const assert=require('node:assert/strict');
const {violations}=require('./measure_performance_guard');
assert.deepEqual(violations({searchMs:500},{maximum:{searchMs:500}}),[]);
assert.equal(violations({searchMs:501},{maximum:{searchMs:500}}).length,1);
assert.equal(violations({initialBytes:25000000},{maximum:{initialBytes:24000000}}).length,1);
assert.equal(violations({searchMs:NaN},{maximum:{searchMs:500}}).length,1);
assert.equal(violations({},{maximum:{searchMs:500}}).length,1);
console.log('PASS: fixed performance thresholds reject payload and search regressions');
