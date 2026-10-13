const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const files=['data/acquisition-resilience.json','data/completion-outcomes.json','data/focus-monitor.json','data/one-item-completion-audit.json','data/performance-guard.json','data/performance-history.json','data/priority-price-monitor.json','data/proactive-refresh-audit.json','data/psa10-period-summary.json','data/runtime-availability-audit.json','data/ui/manifest.json','data/ui/update-status.json','data/update-health-banner.json','data/update-status.json','work/completion-outcomes-last.json','work/priority-freshness-history.json'];
const unresolved=cp.execFileSync('git',['diff','--name-only','--diff-filter=U'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
assert.deepEqual(unresolved.slice().sort(),files.slice().sort(),'only known generated conflicts may be regenerated');
const root=path.resolve('.'),backup=path.resolve('work/observation-merge-stages');
const read=(ref,file)=>cp.execFileSync('git',['show',ref+':'+file],{maxBuffer:96e6});
const union=(a,b)=>[...new Map([...a,...b].map(row=>[JSON.stringify(row),row])).values()];
for(const file of files){
  const target=path.resolve(root,file);assert(target.startsWith(root+path.sep));
  const ours=read('679906fb',file),incoming=read('origin/main',file);
  for(const[side,content]of [['local',ours],['scheduled',incoming]]){const out=path.join(backup,side,file);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,content);}
  let value=JSON.parse(incoming),previous=JSON.parse(ours);
  if(file==='data/performance-history.json')value.records=union(previous.records,value.records).sort((a,b)=>Date.parse(a.generatedAt||a.at)-Date.parse(b.generatedAt||b.at));
  if(file==='work/priority-freshness-history.json')for(const[id,row]of Object.entries(previous.sources)){
    const next=value.sources[id];if(!next){value.sources[id]=row;continue;}
    assert.deepEqual(row.cohort,next.cohort,'fixed cohort must not shrink or change during integration');
    next.observations=union(row.observations,next.observations).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    next.intervalMinima=union(row.intervalMinima||[],next.intervalMinima||[]).sort((a,b)=>Date.parse(a.to)-Date.parse(b.to));
  }
  // Incoming canonical acquisition data are authoritative; all derived output is rebuilt next.
  fs.writeFileSync(target,JSON.stringify(value));
}
console.log(JSON.stringify({conflictsPreserved:files.length,canonicalData:'origin/main',fixedCohortsPreserved:true,backup:'work/observation-merge-stages',derivedRebuildRequired:true}));
