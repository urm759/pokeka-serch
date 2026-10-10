// One-time merge of the two committed acquisition snapshots; no network fetches.
const fs = require('node:fs');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const read = (ref, file) => JSON.parse(cp.execFileSync('git', ['show', `${ref}:${file}`], { maxBuffer: 150e6 }));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
const stamp = r => Math.max(0, ...['observedAt','confirmedAt','checkedAt','lastAttemptAt','lastRunAt','startedAt','endedAt','updatedAt','generatedAt','at'].map(k => Date.parse(r?.[k]) || 0));
const newer = (a,b) => stamp(a) >= stamp(b) ? a : b;
const unique = (rows, key) => [...new Map(rows.map(r => [key(r), r])).values()];
const left = 'c7a25bce', right = '18d05822';
const conflicts = cp.execFileSync('git',['diff','--name-only','--diff-filter=U'],{encoding:'utf8'}).trim().split('\n');
assert(conflicts.includes('work/hareruya2_catalog.json'), 'Only run during the recorded acquisition merge');
const handled = new Set();
function save(file, fn) { const a=read(left,file), b=read(right,file); write(file,fn(a,b)); handled.add(file); }
const mapLatest = (a,b) => Object.fromEntries([...new Set([...Object.keys(a||{}),...Object.keys(b||{})])].map(k => [k,a?.[k]&&b?.[k]?newer(a[k],b[k]):a?.[k]||b?.[k]]));
save('work/hareruya2_catalog.json', (a,b) => {
  const key=r=>[r.detailUrl,r.cardId,r.state].join('|');
  const out=unique([...a,...b].sort((x,y)=>stamp(x)-stamp(y)), key);
  assert(out.length >= Math.max(a.length,b.length));
  for(const r of [...a,...b]) assert(stamp(out.find(x=>key(x)===key(r)))>=stamp(r));
  return out;
});
save('data/hareruya2-stock-summary.json', (a,b)=>({...newer(a,b),cards:mapLatest(a.cards,b.cards)}));
save('work/hareruya2_stock_history.json',(a,b)=>{
  const dates=[...new Set([...a.dates,...b.dates])].sort(), stocks={};
  const ac=read(left,'work/hareruya2_catalog.json'),bc=read(right,'work/hareruya2_catalog.json');
  const times=list=>Object.fromEntries(list.filter(r=>r.cardId).map(r=>[r.cardId,stamp(r)]));
  const at=times(ac),bt=times(bc);
  for(const id of new Set([...Object.keys(a.stocks),...Object.keys(b.stocks)])) stocks[id]=dates.map(d=>{
    const av=a.stocks[id]?.[a.dates.indexOf(d)],bv=b.stocks[id]?.[b.dates.indexOf(d)];
    return av==null?bv??null:bv==null?av:(at[id]||0)>=(bt[id]||0)?av:bv;
  });
  return {...newer(a,b),dates,stocks};
});
save('work/priority-price-http-cache.json',mapLatest);
save('work/priority-price-checkpoint.json',(a,b)=>({...newer(a,b),sources:Object.fromEntries([...new Set([...Object.keys(a.sources),...Object.keys(b.sources)])].map(k=>[k,{...newer(a.sources[k],b.sources[k]),jobs:mapLatest(a.sources[k]?.jobs,b.sources[k]?.jobs)}]))}));
save('work/candidate-shop-refresh.json',(a,b)=>{
  const sources=mapLatest(a.sources,b.sources),checkpoints={};
  for(const k of Object.keys(sources)) checkpoints[k]={...(sources[k]===a.sources[k]?a.checkpoints[k]:b.checkpoints[k]),completedIds:[...new Set([...(a.checkpoints[k]?.completedIds||[]),...(b.checkpoints[k]?.completedIds||[])])],manualWait:mapLatest(a.checkpoints[k]?.manualWait,b.checkpoints[k]?.manualWait)};
  return {sources,checkpoints};
});
save('work/source-update-runs.json',(a,b)=>({...newer(a,b),sources:mapLatest(a.sources,b.sources)}));
for(const file of ['work/source-update-history.json','data/update-history.json']) save(file,(a,b)=>{
  const sources={};
  for(const k of new Set([...Object.keys(a.sources),...Object.keys(b.sources)])) sources[k]=unique([...(a.sources[k]||[]),...(b.sources[k]||[])],r=>r.startedAt||r.lastAttemptAt).sort((x,y)=>stamp(x)-stamp(y)).slice(-90);
  return {...newer(a,b),sources};
});
save('work/priority-freshness-history.json',(a,b)=>{
  assert.equal(a.baselineAt,b.baselineAt);
  const sources={};
  for(const k of Object.keys(a.sources)) {
    const x=a.sources[k],y=b.sources[k]; assert.deepEqual(x.cohort,y.cohort);
    sources[k]={...newer(x,y),cohort:x.cohort,observations:unique([...x.observations,...y.observations],r=>r.at).sort((p,q)=>stamp(p)-stamp(q)),intervalMinima:unique([...x.intervalMinima,...y.intervalMinima],r=>r.from+'|'+r.to),lastConfirmedRows:unique([...x.lastConfirmedRows,...y.lastConfirmedRows].sort((p,q)=>(Date.parse(p.lastConfirmedAt)||0)-(Date.parse(q.lastConfirmedAt)||0)),r=>r.id)};
  }
  return {...a,sources};
});
save('work/candidate-availability-history.json',(a,b)=>({...newer(a,b),runs:unique([...a.runs,...b.runs],r=>r.generatedAt).sort((x,y)=>stamp(x)-stamp(y))}));
save('work/candidate-daily-history.json',(a,b)=>({...newer(a,b),days:unique([...b.days,...a.days],r=>r.date)}));
save('data/performance-history.json',(a,b)=>{
  const field=Object.keys(a).find(k=>Array.isArray(a[k])); assert(field);
  return {...newer(a,b),[field]:unique([...a[field],...b[field]],r=>r.generatedAt)};
});
save('data/operational-limit-history.json',(a,b)=>{
  assert.equal(a.modelVersion,b.modelVersion); assert.deepEqual(a.settings,b.settings);
  const cards={};
  for(const id of new Set([...Object.keys(a.cards),...Object.keys(b.cards)])) {
    cards[id]={};
    for(const cond of new Set([...Object.keys(a.cards[id]||{}),...Object.keys(b.cards[id]||{})])) cards[id][cond]=unique([...(b.cards[id]?.[cond]||[]),...(a.cards[id]?.[cond]||[])],r=>r.date).sort((x,y)=>x.date.localeCompare(y.date));
  }
  return {...newer(a,b),cards};
});
// The following files are derived projections, regenerated before validation/publication.
const derived = new Set(['data/acquisition-resilience.json','data/candidate-availability-audit.json','data/candidate-daily-audit.json','data/card-catalog-completion.json','data/card-catalog/index.json','data/card-catalog/manifest.json','data/card-catalog/search-index.json','data/completion-outcomes.json','data/focus-monitor.json','data/one-item-completion-audit.json','data/performance-guard.json','data/priority-price-monitor.json','data/proactive-refresh-audit.json','data/purchase-limit-model-audit.json','data/purchase-price-freshness-audit.json','data/update-health-banner.json','data/update-status.json','work/card-completion-queue.json','work/completion-outcomes-last.json','work/purchase-price-observation-snapshot.json','work/purchase-price-targets.json']);
for(const file of conflicts) if(!handled.has(file)) {
  assert(derived.has(file)||file.startsWith('data/ui/'),`Unknown conflict: ${file}`);
  write(file,read(left,file)); handled.add(file);
}
console.log(JSON.stringify({conflicts:conflicts.length,handled:handled.size,networkRequests:0,policy:'latest individual confirmation, fixed cohorts, union checkpoints and histories; derived outputs must be regenerated'}));
