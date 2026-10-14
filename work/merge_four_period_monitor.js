const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const files=cp.execFileSync('git',['diff','--name-only','--diff-filter=U'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const expected=['data/acquisition-progress-audit.json','data/acquisition-resilience.json','data/candidate-availability-audit.json','data/candidate-daily-audit.json','data/card-catalog-completion.json','data/card-catalog/index.json','data/card-catalog/manifest.json','data/card-catalog/search-index.json','data/completion-outcomes.json','data/focus-monitor.json','data/link-coverage.json','data/one-item-completion-audit.json','data/operational-limit-history.json','data/performance-guard.json','data/performance-history.json','data/priority-price-monitor.json','data/priority-search-profile-audit.json','data/proactive-refresh-audit.json','data/psa-fetch-progress.json','data/psa-linkage-priority.json','data/purchase-limit-model-audit.json','data/purchase-price-freshness-audit.json','data/runtime-availability-audit.json','data/ui/card-catalog-completion.json','data/ui/card-catalog/search-index.json','data/ui/manifest.json','data/ui/operational-limit-history.json','data/ui/update-status.json','data/update-health-banner.json','data/update-status.json','work/acquisition-progress-last.json','work/candidate-availability-history.json','work/candidate-daily-history.json','work/card-completion-queue.json','work/completion-outcomes-last.json','work/priority-freshness-history.json','work/psa-linkage-all.json','work/purchase-price-observation-snapshot.json','work/purchase-price-targets.json','work/search-profile-targets.json'];
assert.deepEqual(files.sort(),expected.sort(),'only reviewed generated files and observation histories');
const union=(a,b)=>[...new Map([...a,...b].map(v=>[JSON.stringify(v),v])).values()];
for(const file of files){
  const stages=[1,2,3].map(s=>{const bytes=cp.execFileSync('git',['show',`:${s}:${file}`],{maxBuffer:96e6});const dest=path.join('work/four-period-monitor-merge',String(s),file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);return JSON.parse(bytes);});
  const ours=stages[1],theirs=stages[2];let value=ours;
  // Only generated summaries prefer the locally validated, recovered-price corpus.
  // Append remote observations without overwriting the later per-card snapshot.
  if(file==='work/candidate-availability-history.json')value={...ours,runs:union(ours.runs,theirs.runs).sort((a,b)=>String(a.at).localeCompare(String(b.at)))};
  if(file==='data/performance-history.json')value={...ours,records:union(ours.records,theirs.records).sort((a,b)=>a.generatedAt.localeCompare(b.generatedAt))};
  if(file==='work/candidate-daily-history.json')value={...ours,days:[...new Map([...theirs.days,...ours.days].map(v=>[v.date,v])).values()].sort((a,b)=>a.date.localeCompare(b.date))};
  if(file==='work/priority-freshness-history.json'){
    value={...ours,sources:{...ours.sources}};
    for(const [source,prior]of Object.entries(theirs.sources)){
      const current=ours.sources[source];if(!current){value.sources[source]=prior;continue;}
      assert.deepEqual(current.cohort,prior.cohort,'fixed cohort must remain identical');
      value.sources[source]={...current,observations:union(current.observations,prior.observations).sort((a,b)=>a.at.localeCompare(b.at)),intervalMinima:union(current.intervalMinima,prior.intervalMinima).sort((a,b)=>a.to.localeCompare(b.to))};
    }
  }
  fs.writeFileSync(file,JSON.stringify(value));
}
console.log(JSON.stringify({resolved:files.length,backup:'work/four-period-monitor-merge',rawPricesUntouched:true,generatedRevalidationRequired:true}));
