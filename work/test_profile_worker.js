const assert=require('node:assert/strict');
const {isolatedPair}=require('./build_priority_search_targets');
const input={profile:{id:'fixture',url:'https://example.test/'},at:'2026-10-23T00:00:00Z',inspectIds:[],overlay:{}};
const output={urlOnly:{id:'fixture',ids:['x'],profit:0},knownSavedConditions:{id:'fixture',ids:[],profit:null}};
assert.deepEqual(isolatedPair(input,(exe,args,options)=>{
  assert(args.includes('--max-old-space-size=2048'));
  assert(args.includes('--evaluate-worker'));
  assert.deepEqual(JSON.parse(options.input),input);
  assert.equal(options.timeout,180000);
  return {status:0,stdout:JSON.stringify(output)};
}),output);
assert.throws(()=>isolatedPair(input,()=>({status:134,stderr:'heap out of memory'})),/previous outputs retained/);
assert.throws(()=>isolatedPair(input,()=>({status:0,stdout:JSON.stringify({...output,urlOnly:{id:'other'}})})),/identity mismatch/);
assert.throws(()=>isolatedPair(input,()=>({status:0,stdout:'truncated'})));
assert.deepEqual(isolatedPair({...input,single:true},()=>({status:0,stdout:JSON.stringify({urlOnly:output.urlOnly})})),{urlOnly:output.urlOnly});
const cycle=require('node:fs').readFileSync(require('node:path').join(__dirname,'search_profile_cycle.js'),'utf8');
assert(cycle.includes('isolatedEvaluation(p,at)')&&cycle.includes('isolatedEvaluation(p,now,'),'before and after cycle audits release caches between profiles');
assert(!cycle.includes('const calculationCache=new Map()'));
console.log('PASS bounded sequential profile workers; no partial publication or identity substitution');
