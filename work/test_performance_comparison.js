const assert=require('node:assert/strict');
const {compare,append}=require('./performance_comparison');
const base={comparisonKey:'linux/24/v2',generatedAt:'2026-10-07',cardCount:100,
  codeFingerprint:'a',dataFingerprint:'b',status:'pass',initialBytes:1000000,fullCalculationMs:1000,searchMs:0.2};
assert.equal(compare(base,null).status,'baseline-pending');
assert.equal(compare({...base,comparisonKey:'win/24/v2'},base).status,'baseline-pending');
assert.equal(compare({...base,searchMs:0.4},base).warnings.length,0);
const data=compare({...base,cardCount:200,dataFingerprint:'c',initialBytes:2000000},base);
assert(data.dataChanged && !data.codeChanged);
assert.equal(data.normalized[0].before,data.normalized[0].after);
assert(data.warnings.includes('initialBytes'));
const code=compare({...base,codeFingerprint:'d',fullCalculationMs:1500},base);
assert(code.codeChanged && !code.dataChanged && code.warnings.includes('fullCalculationMs'));
assert.equal(compare({...base,fullCalculationMs:NaN},base).rows.find(r=>r.metric==='fullCalculationMs').after,null);
const h=append({records:[base,{...base,status:'regression',fullCalculationMs:5000}]},{...base,fullCalculationMs:1200});
assert.equal(h.records.at(-1).comparison.rows.find(r=>r.metric==='fullCalculationMs').before,1000);
assert.equal(append({records:Array(100).fill(base)},{...base}).records.length,90);
console.log('PASS: repeated same-environment baselines, noise floors, data/code attribution, failed baseline exclusion');
