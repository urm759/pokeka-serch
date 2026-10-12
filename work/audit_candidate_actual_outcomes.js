const fs=require('node:fs'),path=require('node:path');
const {snapshot,compare,pack,unpack}=require('./audit_completion_outcomes');
const root=path.join(__dirname,'..'),baseline=path.join(root,'work/candidate-reduction-acquisition-before.json');
const {atomicWrite}=require('./acquisition_retry');
if(process.argv.includes('--baseline')){
  atomicWrite(baseline,pack(snapshot(root)));
  console.log('Saved fixed-card completion baseline; no HTTP');
}else{
  const before=unpack(JSON.parse(fs.readFileSync(baseline,'utf8'))),after=snapshot(root);
  const report={at:after.at,...compare(before,after),
    evidence:'Saved official PSA rows reprocessed without HTTP. Collector rows, valid domestic values and analysis transitions are distinct.',llmCalls:0,codexCalls:0};
  atomicWrite(path.join(root,'data/candidate-reduction-outcomes.json'),report);
  console.log(JSON.stringify(report));
}
