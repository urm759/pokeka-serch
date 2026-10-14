const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const merge=require('./integrate_saved_snapshots');
const files=['data/completion-acquisition.json','data/focus-monitor.json','data/hareruya2-stock-summary.json','data/one-item-completion-audit.json','data/pokemon-cards.json','data/priority-price-monitor.json','data/psa-linkage-priority.json','data/state-a-url-discovery.json','work/candidate-shop-refresh.json','work/completion-acquisition-checkpoint.json','work/hareruya2_catalog.json','work/hareruya2_stock_history.json','work/priority-freshness-history.json','work/priority-price-checkpoint.json','work/priority-price-http-cache.json','work/psa-linkage-all.json','work/psa_priority_queue.json','work/source-update-history.json','work/source-update-runs.json','work/state-a-url-discovery-checkpoint.json'];
const generated=new Set(['data/focus-monitor.json','data/one-item-completion-audit.json','data/priority-price-monitor.json','data/psa-linkage-priority.json','work/psa-linkage-all.json','work/psa_priority_queue.json']);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const at=o=>Math.max(0,...['observedAt','confirmedAt','lastConfirmedAt','fetchedAt','checkedAt','lastAttemptAt','lastSuccessAt','lastRunAt','endedAt','recordedAt','startedAt'].map(k=>Date.parse(o?.[k])).filter(Number.isFinite));
function reconcile(base,ours,theirs,where=''){
  if(equal(ours,theirs)||equal(base,theirs))return ours;
  if(equal(base,ours))return theirs;
  if(Array.isArray(ours)&&Array.isArray(theirs))return [...new Map([...ours,...theirs].map(r=>[JSON.stringify(r),r])).values()];
  if(ours&&theirs&&typeof ours==='object'&&typeof theirs==='object'){
    // Choose the later individual observation, never a later whole-file generation date.
    if(at(ours)&&at(theirs)&&at(ours)!==at(theirs)&&!['','/sources'].includes(where))return at(ours)>at(theirs)?ours:theirs;
    const out={};for(const k of new Set([...Object.keys(base||{}),...Object.keys(ours),...Object.keys(theirs)])){
      const v=reconcile(base?.[k],ours[k],theirs[k],where+'/'+k);if(v!==undefined)out[k]=v;
    }return out;
  }
  if(typeof ours==='string'&&typeof theirs==='string'&&/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(ours)&&Number.isFinite(Date.parse(ours))&&Number.isFinite(Date.parse(theirs)))return Date.parse(ours)>Date.parse(theirs)?ours:theirs;
  throw Error('Unresolved value; both stages retained: '+where);
}
const unresolved=cp.execFileSync('git',['diff','--name-only','--diff-filter=U'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
assert.deepEqual(unresolved.sort(),files.slice().sort(),'only the audited conflict set may be resolved');
const output=[];
for(const file of files){
  const rows=[1,2,3].map(stage=>{const bytes=cp.execFileSync('git',['show',`:${stage}:${file}`],{maxBuffer:96e6});const target=path.join('work/four-period-merge-stages',String(stage),file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);return JSON.parse(bytes);});
  let value;
  if(['data/pokemon-cards.json','work/hareruya2_catalog.json'].includes(file))value=merge.mergeRows(...rows,file.startsWith('data/')?'id':'cardId');
  else if(file==='work/hareruya2_stock_history.json')value=merge.mergeHistory(...rows);
  else if(generated.has(file))value=rows[2];
  else if(['data/completion-acquisition.json','data/state-a-url-discovery.json'].includes(file))value=at(rows[1])>at(rows[2])?rows[1]:rows[2];
  else if(file==='work/priority-price-checkpoint.json'){
    value={sources:{}};
    for(const source of new Set(rows.flatMap(r=>Object.keys(r.sources||{})))){
      const b=rows[0].sources?.[source]||{},a=rows[1].sources?.[source]||{},t=rows[2].sources?.[source]||{};
      value.sources[source]={...(at(a)>at(t)?a:t),jobs:reconcile(b.jobs||{},a.jobs||{},t.jobs||{})};
    }
  }
  else if(file==='work/candidate-shop-refresh.json'){
    value=reconcile(...rows.map(r=>({...r,checkpoints:{}})));
    value.checkpoints={};
    for(const source of new Set(rows.flatMap(r=>Object.keys(r.checkpoints||{})))){
      const b=rows[0].checkpoints?.[source]||{},a=rows[1].checkpoints?.[source]||{},t=rows[2].checkpoints?.[source]||{};
      const latest=at(rows[1].sources?.[source])>at(rows[2].sources?.[source])?a:t;
      value.checkpoints[source]={...latest,manualWait:reconcile(b.manualWait||{},a.manualWait||{},t.manualWait||{})};
      if(a.cycleDate===t.cycleDate)value.checkpoints[source].completedIds=[...new Set([...(a.completedIds||[]),...(t.completedIds||[])])];
    }
  }
  else value=reconcile(...rows);
  output.push([file,value]);
}
for(const [file,value]of output)fs.writeFileSync(file,JSON.stringify(value));
console.log(JSON.stringify({resolved:output.length,backup:'work/four-period-merge-stages',generatedRequiresRebuild:[...generated]}));
