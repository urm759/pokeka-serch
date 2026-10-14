const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const ref='7070a3e3758cd621ade1a68d0d829cc2ddd12d50',base='9d85cf9a4fb2436aafe31fb8b3a72b9850ad8b84';
assert.equal(cp.execFileSync('git',['rev-parse',ref+'^'],{encoding:'utf8'}).trim(),base);
const local=f=>JSON.parse(fs.readFileSync(f,'utf8')),saved=f=>JSON.parse(cp.execFileSync('git',['show',ref+':'+f],{maxBuffer:96e6}));
const save=(f,v)=>require('./acquisition_retry').atomicWrite(f,v,0);
const file='work/candidate-shop-refresh.json',incoming=saved(file),run=incoming.sources.hareruya2;
assert.equal(run.refreshedCount,150);assert.equal(run.records.filter(r=>r.status==='verified').length,150);
const cardMap=new Map(local('data/pokemon-cards.json').map(c=>[c.id,c]));
const catalog=local('work/hareruya2_catalog.json'),byId=new Map(catalog.map(r=>[r.cardId,r]));
const sourceCatalog=new Map(saved('work/hareruya2_catalog.json').map(r=>[r.cardId,r]));
const summary=local('data/hareruya2-stock-summary.json'),sourceSummary=saved('data/hareruya2-stock-summary.json');
const history=local('work/hareruya2_stock_history.json'),jobs=local('work/priority-price-checkpoint.json'),sourceJobs=saved('work/priority-price-checkpoint.json');
const admitted=[],rejected=[];
for(const record of run.records.filter(r=>r.status==='verified')){
  const row=sourceCatalog.get(record.id),point=sourceSummary.cards[record.id],card=cardMap.get(record.id);
  if(!row||!point||!card||row.state!=='A'||!(row.price>0)||row.priceQuarantined||point.conditionAccepted!==true
    ||card.hareruya2Url!==record.url||row.detailUrl!==record.url||row.observedAt!==record.confirmedAt||point.observedAt!==record.confirmedAt
    ||row.identityVerifiedAt!==record.confirmedAt||!require('./update_hareruya2_stock').productMatchesCard(card,{title:row.name})){
    rejected.push({id:record.id,reason:'保存済み個別価格・日時・同一仕様証拠が不足'});continue;
  }
  if(Date.parse(byId.get(record.id)?.observedAt)>=Date.parse(row.observedAt))continue;
  byId.set(record.id,row);summary.cards[record.id]=point;
  jobs.sources.hareruya2.jobs[record.id]=sourceJobs.sources.hareruya2.jobs[record.id];
  const day=new Date(Date.parse(row.observedAt)+9*3600000).toISOString().slice(0,10);
  if(Number.isFinite(row.stock)){
    if(!history.dates.includes(day)){history.dates.push(day);for(const values of Object.values(history.stocks))values.push(null);}
    history.stocks[record.id]||=Array(history.dates.length).fill(null);
    while(history.stocks[record.id].length<history.dates.length)history.stocks[record.id].push(null);
    history.stocks[record.id][history.dates.indexOf(day)]=row.stock;
  }
  admitted.push(record.id);
}
save('work/hareruya2_catalog.json',[...byId.values()]);save('data/hareruya2-stock-summary.json',summary);save('work/hareruya2_stock_history.json',history);save('work/priority-price-checkpoint.json',jobs);
const checkpoint=local(file);
if(Date.parse(checkpoint.sources.hareruya2.startedAt)<Date.parse(run.startedAt)){
  checkpoint.sources.hareruya2=run;
  const previous=checkpoint.checkpoints.hareruya2,next=incoming.checkpoints.hareruya2;
  checkpoint.checkpoints.hareruya2={...next,completedIds:[...new Set([...(previous.completedIds||[]),...(next.completedIds||[])])],manualWait:{...previous.manualWait,...next.manualWait}};
}
save(file,checkpoint);
const runs=local('work/source-update-runs.json'),sourceRuns=saved('work/source-update-runs.json');
if(Date.parse(runs.sources.hareruya2.lastAttemptAt)<Date.parse(sourceRuns.sources.hareruya2.lastAttemptAt))runs.sources.hareruya2=sourceRuns.sources.hareruya2;
save('work/source-update-runs.json',runs);
const result={version:1,at:new Date().toISOString(),runId:38499603626,checkpoint:ref,base,artifactSha256:'bc8b252ff2c8eedc4e769641085bad1fab7e701439e08d04c163c848c79c58ce',
  savedVerified:150,admitted:admitted.length,ids:admitted,rejected,externalAcquisitionRequests:0,llmCalls:0,codexCalls:0,
  publication:'正常な状態A価格だけ回収・必須検証とPages照合は別工程',
  notRecovered:'買取その他の全退避回収を完了扱いにしない。元bundleと両側の取得済みデータは保持'};
save('data/four-period-checkpoint-recovery.json',result);console.log(JSON.stringify(result));
