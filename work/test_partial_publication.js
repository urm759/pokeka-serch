const assert=require('node:assert/strict'),{verify}=require('./price_publication_evidence');
const run={id:1,event:'schedule',conclusion:'failure'},jobs={jobs:[{steps:[
  ...['Refresh due purchase prices','Verify safety','Publish validated data'].map(name=>({name,conclusion:'success'})),
  {name:'Report independent acquisition failures without hiding them',conclusion:'failure'}]}]};
const result={runId:1,runs:[{processStatus:'failed',failureClass:'source-acquisition'}]},pages={conclusion:'success'};
assert(verify(run,jobs,result,pages).confirmed);assert(verify(run,jobs,result,pages).partial);
assert(!verify(run,jobs,{...result,runId:2},pages).confirmed);
assert(!verify(run,jobs,{...result,runs:[{processStatus:'failed',failureClass:'required-calculation'}]},pages).confirmed);
jobs.jobs[0].steps[1].conclusion='failure';assert(!verify(run,jobs,result,pages).confirmed);
console.log('PASS independent source failure with verified publication is partial; validation/save/mismatched receipts remain blocked');
