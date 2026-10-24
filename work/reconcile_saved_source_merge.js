const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {atomicWrite}=require('./acquisition_retry');
const root=path.join(__dirname,'..'),git=args=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:128e6});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const stamp=r=>Math.max(0,...['observedAt','fetchedAt','lastAttemptAt','confirmedAt','checkedAt','startedAt','endedAt','generatedAt','updatedAt','at','date'].map(k=>Date.parse(r?.[k])||0));
function latest(a,b,base){
  if(!a)return b;if(!b)return a;if(same(a,b))return a;
  if(base!==undefined){if(same(base,a))return b;if(same(base,b))return a;}
  const x=stamp(a),y=stamp(b);if(!x||!y||x===y)throw Error('Conflicting source observations without distinct timestamps');
  return x>y?a:b;
}
function byKey(a,b,key,base=[]){const original=new Map(base.map(r=>[key(r),r]));const rows=new Map(a.map(r=>[key(r),r]));for(const r of b){const k=key(r);rows.set(k,latest(rows.get(k),r,original.get(k)));}return [...rows.values()];}
function mergeCardFields(base,a,b,field) {
  if(same(a,b)||same(base,b))return a;
  if(same(base,a))return b;
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b))
    return Object.fromEntries([...new Set([...Object.keys(a),...Object.keys(b)])].map(k=>[k,mergeCardFields(base?.[k],a[k],b[k],field+'.'+k)]));
  throw Error('Concurrent card field conflict requires review: '+field);
}
function mergeCards(base,a,b) {
  for(const rows of [base,a,b])if(!Array.isArray(rows)||rows.some(r=>!r.id)||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Duplicate/missing card IDs in merge input');
  const original=new Map(base.map(r=>[r.id,r])),left=new Map(a.map(r=>[r.id,r])),right=new Map(b.map(r=>[r.id,r]));
  return [...new Set([...left.keys(),...right.keys()])].map(id=>!left.has(id)?right.get(id):!right.has(id)?left.get(id):mergeCardFields(original.get(id),left.get(id),right.get(id),id));
}
function mergeRun(a,b,base){
  const selected=latest(a,b,base),successful=[a?.lastSuccessAt,b?.lastSuccessAt,base?.lastSuccessAt].filter(v=>Number.isFinite(Date.parse(v)));
  return successful.length?{...selected,lastSuccessAt:successful.sort((x,y)=>Date.parse(x)-Date.parse(y)).at(-1)}:selected;
}
function mergeStockHistory(base,a,b,leftTimes,rightTimes){
  if(![base,a,b].every(r=>Array.isArray(r?.dates)&&r.stocks))throw Error('Stock history schema changed');
  const dates=[...new Set([...a.dates,...b.dates])].sort(),stocks={};
  for(const id of new Set([...Object.keys(a.stocks),...Object.keys(b.stocks)]))stocks[id]=dates.map(day=>{
    const x=a.stocks[id]?.[a.dates.indexOf(day)],y=b.stocks[id]?.[b.dates.indexOf(day)];
    if(x==null)return y??null;if(y==null||x===y)return x;
    const original=base.stocks[id]?.[base.dates.indexOf(day)];
    if(x===original)return y;if(y===original)return x;
    if((leftTimes[id]||0)===(rightTimes[id]||0))throw Error('Conflicting stock history without distinct card observation times');
    return (leftTimes[id]||0)>(rightTimes[id]||0)?x:y;
  });
  return {dates,stocks};
}
function historyUnion(a,b){const m=new Map();for(const r of [...b,...a]){
  const key=r&&typeof r==='object'&&!Array.isArray(r)?r.startedAt||r.at||r.recordedAt||r.date||r.runId:null;
  const k=key==null?JSON.stringify(r):String(key),old=m.get(k);
  if(!old||stamp(r)>stamp(old)||stamp(r)===stamp(old))m.set(k,r);
}return [...m.values()].sort((a,b)=>stamp(a)-stamp(b));}
function mergeProfileTargets(base,a,b) {
  const selected=latest(a,b,base),other=selected===a?b:a;
  for(const value of [a,b])if(!Array.isArray(value.profiles)||new Set(value.profiles.map(p=>p.id)).size!==value.profiles.length)throw Error('Duplicate or missing search profile identities');
  const profiles=selected.profiles.map(p=>{
    const prior=other.profiles.find(r=>r.id===p.id&&r.urlHash===p.urlHash);
    return {...p,seenQualified:[...new Set([...(prior?.seenQualified||[]),...(prior?.urlsMatched||[]),...(p.seenQualified||[]),...(p.urlsMatched||[])])]};
  });
  const qualified=new Map(profiles.map(p=>[p.id,new Set(p.urlsMatched||[])]));
  const pending=new Map();
  for(const row of [...(other.pendingDepartures||[]),...(selected.pendingDepartures||[])]) {
    if(!qualified.get(row.profile)?.has(row.id))pending.set(row.profile+'|'+row.id,row);
  }
  return {...selected,profiles,pendingDepartures:[...pending.values()]};
}
function mergeFixedFreshness(base,a,b) {
  const sources={};
  for(const id of new Set([...Object.keys(a.sources||{}),...Object.keys(b.sources||{})])) {
    const x=a.sources?.[id],y=b.sources?.[id];
    if(!x||!y){sources[id]=x||y;continue;}
    if(!same([...(x.cohort||[])].sort(),[...(y.cohort||[])].sort()))throw Error('Fixed freshness denominator changed; review required');
    const last=s=>s.observations?.at(-1)?.at;
    const xa=Date.parse(last(x)),ya=Date.parse(last(y));
    if(!Number.isFinite(xa)||!Number.isFinite(ya))throw Error('Missing freshness snapshot time');
    if(xa===ya&&!same(x.lastConfirmedRows,y.lastConfirmedRows))throw Error('Conflicting freshness rows for the same snapshot');
    const selected=xa>=ya?x:y,other=selected===x?y:x;
    const intervals=new Map();
    for(const r of [...(other.intervalMinima||[]),...(selected.intervalMinima||[])])intervals.set(r.from+'|'+r.to,r);
    sources[id]={...selected,observations:historyUnion(other.observations||[],selected.observations||[]),
      intervalMinima:[...intervals.values()].sort((a,b)=>Date.parse(a.to)-Date.parse(b.to)).slice(-500),
      lastConfirmedRows:selected.lastConfirmedRows};
  }
  return {...a,sources};
}
function seedMerge(base,a,b){
  if(same(a,b)||same(base,b))return a;if(same(base,a))return b;
  if(Array.isArray(a)&&Array.isArray(b))return historyUnion(a,b);
  if(a&&b&&typeof a==='object'&&typeof b==='object')return Object.fromEntries([...new Set([...Object.keys(a),...Object.keys(b)])].map(k=>[k,seedMerge(base?.[k],a[k],b[k])]));
  return a;
}
function run(){
  const files=git(['diff','--name-only','--diff-filter=U']).trim().split('\n').filter(Boolean);
  if(files.some(f=>!/^((data|work)\/[a-zA-Z0-9_./-]+\.json)$/.test(f)||f.includes('..')))throw Error('Unknown merge target');
  const snapshots=Object.fromEntries(files.map(f=>[f,[1,2,3].map(n=>JSON.parse(git(['show',`:${n}:${f}`])))]));
  const backup=path.join(root,'work/current-guide-merge-stages',git(['rev-parse','MERGE_HEAD']).trim());fs.mkdirSync(backup,{recursive:true});
  for(const [f,rows]of Object.entries(snapshots)){
    fs.mkdirSync(path.dirname(path.join(backup,f)),{recursive:true});
    atomicWrite(path.join(backup,f),{base:rows[0],local:rows[1],scheduled:rows[2]},0);
  }
  const out=[],metrics=[];
  const shopSummary=snapshots['data/shop-buyback-summary.json'];
  for(const [file,[base,a,b]]of Object.entries(snapshots)){
    let merged;
    if(file==='data/scheduled-cycle-receipts.json')merged=require('./resolve_generated_merge').mergeReceipts(a,b);
    else if(file==='data/pokemon-cards.json')merged=mergeCards(base,a,b);
    else if(file==='work/search-profile-targets.json')merged=mergeProfileTargets(base,a,b);
    else if(file==='work/priority-freshness-history.json')merged=mergeFixedFreshness(base,a,b);
    else if(['data/priority-price-execution.json','data/price-catchup-status.json'].includes(file))merged=latest(a,b,base);
    else if(file==='work/hareruya2_catalog.json')merged=byKey(a,b,r=>r.detailUrl||r.productId||r.cardId,base);
    else if(file==='data/hareruya2-stock-summary.json'){
      merged={...a,cards:{...a.cards}};for(const [id,row]of Object.entries(b.cards||{}))merged.cards[id]=latest(merged.cards[id],row,base.cards?.[id]);
      merged.updatedAt=[a.updatedAt,b.updatedAt].sort().at(-1);
    }else if(file==='work/hareruya2_stock_history.json'){
      const catalogs=snapshots['work/hareruya2_catalog.json'];
      if(!catalogs)throw Error('Per-card stock history requires both source catalogs');
      const times=rows=>{const result={};for(const row of rows)if(row.cardId)result[row.cardId]=Math.max(result[row.cardId]||0,stamp(row));return result;};
      const leftTimes=times(catalogs[1]),rightTimes=times(catalogs[2]);
      merged=mergeStockHistory(base,a,b,leftTimes,rightTimes);
    }else if(file==='work/source-update-runs.json'){
      merged={...a,sources:{...a.sources}};for(const [id,row]of Object.entries(b.sources||{}))merged.sources[id]=mergeRun(merged.sources[id],row,base.sources?.[id]);
    }else if(file==='work/priority-price-http-cache.json'){
      merged={...a};for(const [url,row]of Object.entries(b))merged[url]=latest(merged[url],row,base[url]);
    }else if(file==='work/priority-price-checkpoint.json'){
      merged=seedMerge(base,a,b);for(const source of Object.keys(merged.sources))for(const id of Object.keys(merged.sources[source].jobs||{}))
        merged.sources[source].jobs[id]=latest(a.sources?.[source]?.jobs?.[id],b.sources?.[source]?.jobs?.[id],base.sources?.[source]?.jobs?.[id]);
    }else if(file==='work/candidate-shop-refresh.json'){
      merged=seedMerge(base,a,b);for(const source of Object.keys(merged.sources)){
        merged.sources[source]=latest(a.sources[source],b.sources[source],base.sources?.[source]);
        const newer=merged.sources[source]===a.sources[source]?a:b;
        merged.checkpoints[source]={...newer.checkpoints[source],completedIds:[...new Set([...(a.checkpoints[source]?.completedIds||[]),...(b.checkpoints[source]?.completedIds||[])])]};
      }
    }else if(['data/shop-buyback-summary.json','work/shop_buyback_catalog.json','work/shop_buyback_unmatched.json'].includes(file)){
      merged=seedMerge(base,a,b);
      const shops=new Set([...Object.keys(shopSummary[1].shops),...Object.keys(shopSummary[2].shops)]);
      for(const shop of shops){const x=shopSummary[1].shops[shop],y=shopSummary[2].shops[shop];
        const selected=!x?b:!y?a:Date.parse(x.lastSuccess||x.fullListingConfirmedAt||'')>=Date.parse(y.lastSuccess||y.fullListingConfirmedAt||'')?a:b;
        if(file!=='data/shop-buyback-summary.json')merged.shops[shop]=selected.shops[shop]||[];
        else{merged.shops[shop]=selected.shops[shop];for(const id of Object.keys(merged.cards)){
          const row=selected.cards[id]?.shops?.[shop];merged.cards[id].shops ||= {};
          if(row)merged.cards[id].shops[shop]=row;else delete merged.cards[id].shops[shop];
        }}
      }
    }else merged=seedMerge(base,a,b);
    out.push([file,merged]);metrics.push({file,method:/catalog|checkpoint|http-cache|source-update-runs|stock-summary|buyback/.test(file)?'個別確認日時/取得元実成功時刻・履歴保持':'両原票保持後の再生成用seed'});
  }
  // Resolve every real-source observation before writing anything. Derived seeds must be rebuilt/tested before publication.
  for(const [file,data]of out)atomicWrite(path.join(root,file),data,0);
  atomicWrite(path.join(root,'data/current-guide-merge-audit.json'),{at:new Date().toISOString(),backup:'work/current-guide-merge-stages',metrics,
    status:'正常原票統合済み・全要約再生成/必須検証/公開照合待ち',acquisitionRequests:0},0);
  console.log(JSON.stringify({resolved:out.length,status:'rebuild-required',rawStageBackups:files.length}));
}
if(require.main===module)run();
module.exports={latest,byKey,seedMerge,mergeRun,mergeStockHistory,mergeProfileTargets,mergeFixedFreshness,mergeCards};
