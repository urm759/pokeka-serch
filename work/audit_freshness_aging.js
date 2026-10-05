const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const monitor=read('data/priority-price-monitor.json');
const run=read('work/candidate-shop-refresh.json').sources.hareruya2;
const history=read('work/priority-freshness-history.json').sources.hareruya2;
const ids=new Set(history.cohort);
const rows=new Map([...monitor.sources.hareruya2.fixedCards,...monitor.sources.hareruya2.cards].map(r=>[r.id,r]));
const before=Date.parse(run.endedAt),after=Date.parse(monitor.generatedAt);
const fresh=(row,at)=>{const date=Date.parse(row?.lastConfirmedAt);return Number.isFinite(date)&&date<=at&&at-date<=6*3600000;};
const expired=[...ids].filter(id=>fresh(rows.get(id),before)&&!fresh(rows.get(id),after));
const count=at=>[...ids].filter(id=>fresh(rows.get(id),at)).length;
const output={checkedAt:monitor.generatedAt,source:'hareruya2',fixedCohort:ids.size,postAcquisitionAt:run.endedAt,
  freshAtPostAcquisition:count(before),freshAtCurrent:count(after),expiredWithoutNewAcquisition:expired.length,expiredIds:expired,
  refreshedInPreviousBatch:run.refreshedCount,currentRunAcquisitionCount:0,
  explanation:'同じ固定IDと保存済み確認日時を2時刻で評価。実取得の取り消しではなく期限経過。次回定期取得の改善実証とは別。'};
fs.writeFileSync(path.join(root,'data/freshness-aging-audit.json'),JSON.stringify(output));
console.log(JSON.stringify({...output,expiredIds:undefined}));
