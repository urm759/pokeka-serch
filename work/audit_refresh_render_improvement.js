const fs=require('node:fs'),path=require('node:path');
const outcomes=require('./audit_completion_outcomes');
const root=path.join(__dirname,'..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const baseline='work/refresh-render-baseline.json';
function observation() {
  require('./priority_price_queue').write(root);
  return {at:new Date().toISOString(),counts:read('data/card-catalog-completion.json').summary,
    snapshot:outcomes.pack(outcomes.snapshot(root)),fixed:read('data/priority-price-monitor.json').fixedCohortFreshness.sources.hareruya2.latest};
}
function build() {
  const current=observation();
  if(process.argv.includes('--baseline')) {
    fs.writeFileSync(path.join(root,baseline),JSON.stringify(current));
    console.log(JSON.stringify({at:current.at,total:current.counts.siteTotal,analyzable:current.counts.analyzable,fixed:current.fixed}));
    return current;
  }
  const before=read(baseline);
  const diff=outcomes.compare(outcomes.unpack(before.snapshot),outcomes.unpack(current.snapshot));
  const shop=read('work/candidate-shop-refresh.json').sources.hareruya2;
  const prior=fs.existsSync(path.join(root,'work/refresh-render-acquisition-runs.json'))?read('work/refresh-render-acquisition-runs.json'):[];
  const runs=[...prior.filter(r=>r.startedAt!==shop.startedAt),shop];
  const records=runs.flatMap(r=>r.records);
  const baselineConfirmed=new Set(records.filter(r=>r.status==='verified'&&r.fixedTarget).map(r=>r.id));
  const rows=read('work/priority-freshness-history.json').sources.hareruya2.lastConfirmedRows;
  const byId=new Map(rows.map(r=>[r.id,r]));
  const previousTimes=new Map(records.filter(r=>r.status==='verified').map(r=>[r.id,r.previousConfirmedAt]));
  const fixedIds=read('work/priority-freshness-history.json').sources.hareruya2.cohort;
  const beforeProjected=fixedIds.filter(id=>{
    const row=byId.get(id),at=Date.parse(baselineConfirmed.has(id)?previousTimes.get(id):row?.lastConfirmedAt);
    return Number.isFinite(at)&&at<=Date.parse(current.at)&&Date.parse(current.at)-at<=6*3600000;
  }).length;
  const report={version:1,before:{at:before.at,counts:before.counts,fixed:before.fixed},
    after:{at:current.at,counts:current.counts,fixed:current.fixed},outcomes:diff,
    fixedComparisonAtSameTime:{at:current.at,withoutThisBatch:beforeProjected,withThisBatch:current.fixed.fresh6h,
      recovered:current.fixed.fresh6h-beforeProjected,denominator:fixedIds.length,
      note:'Before prices projected to the same after timestamp; elapsed-time expirations are not market decline.'},
    acquisition:{startedAt:runs[0].startedAt,attempted:runs.reduce((n,r)=>n+r.attemptedCount,0),confirmed:runs.reduce((n,r)=>n+r.refreshedCount,0),
      changed:runs.reduce((n,r)=>n+r.changedCount,0),newLinked:runs.reduce((n,r)=>n+r.newLinkedCount,0),newAcquired:runs.reduce((n,r)=>n+r.newAcquiredCount,0),http:runs.reduce((n,r)=>n+r.httpRequests,0),
      durationMs:runs.reduce((n,r)=>n+r.durationMs,0),stopReason:shop.stopReason,checkpoint:shop.nextId,
      fixedConfirmed:records.filter(r=>r.status==='verified'&&r.fixedTarget).length,
      normalConfirmed:records.filter(r=>r.status==='verified'&&!r.important).length,
      batches:runs.map(r=>({startedAt:r.startedAt,confirmed:r.refreshedCount,http:r.httpRequests,durationMs:r.durationMs,stopReason:r.stopReason}))},
    safety:'Financial model, GO, freshness, time budget and access interval unchanged. Manual recovery is not sustained scheduled freshness.',
    llmCalls:0,codexCalls:0};
  fs.writeFileSync(path.join(root,'data/refresh-render-improvement.json'),JSON.stringify(report));
  console.log(JSON.stringify(report));return report;
}
if(require.main===module)build();
module.exports={build};
