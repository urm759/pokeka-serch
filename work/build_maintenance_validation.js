const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {snapshot,unpack,compare}=require('./audit_completion_outcomes');
const root=path.join(__dirname,'..');
function build(base) {
  if(!/^[a-f0-9]{7,40}$/.test(base))throw new Error('explicit baseline commit required');
  const before=file=>JSON.parse(cp.execFileSync('git',['show',`${base}:${file}`],{cwd:root,encoding:'utf8',maxBuffer:30000000}));
  const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  const delta=compare(unpack(before('work/completion-outcomes-last.json')),snapshot(root));
  const oldFixed=before('data/priority-price-monitor.json').fixedCohortFreshness;
  const fixed=read('data/priority-price-monitor.json').fixedCohortFreshness;
  const source=read('work/candidate-shop-refresh.json').sources.hareruya2;
  const result={version:1,generatedAt:new Date().toISOString(),baselineCommit:base,event:'manual-validation',
    delta,source:{attempted:source.attemptedCount,confirmed:source.refreshedCount,newAcquired:source.newAcquiredCount,
      newLinked:source.newLinkedCount,changed:source.changedCount,httpRequests:source.httpRequests,durationMs:source.durationMs,
      stopReason:source.stopReason,checkpoint:source.nextId},
    fixedCohorts:Object.fromEntries(Object.entries(fixed.sources).map(([key,value])=>[key,{before:oldFixed.sources[key]?.latest,after:value.latest,
      sameDenominator:oldFixed.sources[key]?.latest?.cohort===value.latest?.cohort}])),
    modelChanged:false,safetyChanged:false,scheduledExecutionConfirmed:false,llmCalls:0,codexCalls:0};
  fs.writeFileSync(path.join(root,'data/maintenance-validation-audit.json'),JSON.stringify(result));
  console.log(JSON.stringify({delta,resultSource:result.source,fixed:result.fixedCohorts.hareruya2}));
}
if(require.main===module)build(process.argv[2]);
module.exports={build};
