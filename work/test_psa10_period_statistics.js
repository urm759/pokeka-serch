const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {statistics,dailyRows,actualRows,build,shard,observationStatus}=require('./build_psa10_period_statistics');
require('./test_psa10_long_observations');
const rows=dailyRows([['2026-10-01',1,100],['2026-10-01',1,200],['2026-10-04',1,400],['2026-10-11',1,900],['2026-10-05',1,null],['2026-10-06',1,0],['2026-10-07',1,Infinity]]);
assert.equal(rows.length,3);
const seven=statistics(rows,'2026-10-07',7,0,2);assert.equal(seven.mean,300);assert.equal(seven.count,2);assert.equal(seven.observedDays,2);assert.equal(seven.median,300);
assert.equal(statistics(rows,'2026-10-10',7,0,2).mean,400,'exclude earlier dates and future snapshots');
assert.equal(statistics([],'2026-10-10',90,0,2).mean,null,'missing is not zero/current price');
assert.equal(observationStatus(seven,7,'2026-10-07').observationSufficient,false);
assert.equal(observationStatus({...seven,observedDays:7},30,'2026-10-07').observationSufficient,false,'seven days do not establish a 30-day observation window');
assert.equal(observationStatus({...seven,observedDays:30,latestDate:'2026-10-01'},30,'2026-10-07').status,'参考値・最終観測が古い');
const card={id:'test',identityKey:'identity',snkPsa10Trades:[]};
const trade={source:'permitted-domestic',measurementType:'actual',market:'domestic',currency:'JPY',cardId:'test',identityKey:'identity',language:'ja',gradingCompany:'PSA',grade:10,identityConfirmed:true,date:'2026-10-10',price:1000};
card.snkPsa10Trades=[{...trade,id:'a'},{...trade,id:'b'},{...trade,id:'a'},trade,trade,{...trade,market:'overseas'},{...trade,grade:9},{...trade,measurementType:'aggregate'},{...trade,price:null}];
const actual=actualRows(card);assert.equal(actual.rows.length,4,'same date/price with no stable ID must not merge distinct transactions');assert.equal(actual.rejected['同一成約ID重複'],1);
const sourceRoot=path.join(__dirname,'..'),os=require('node:os'),root=fs.mkdtempSync(path.join(os.tmpdir(),'pokeka-period-statistics-'));
try{
for(const file of ['app.js','work/market_stability_history.json','data/pokemon-cards.json','data/pokemon-cards-meta.json','work/raw-price-observations-manifest.json','work/raw-price-observations.json.gz','data/state-a-price-evidence.json','data/psa10-observation-receipt.json','work/psa10-trade-observations.json','data/psa-population-summary.json']){
 const from=path.join(sourceRoot,file);if(fs.existsSync(from)){const to=path.join(root,file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);}
}
const historyDir=path.join(sourceRoot,'data/psa-history');if(fs.existsSync(historyDir))fs.cpSync(historyDir,path.join(root,'data/psa-history'),{recursive:true});
const publishedDate=JSON.parse(fs.readFileSync(path.join(sourceRoot,'data/psa10-period-summary.json'))).asOf;
const clock=new Date(publishedDate+'T03:00:00Z');
const result=build(root,clock),again=build(root,clock);assert.equal(again.changedFiles,0,'same injected clock and inputs must not regenerate files');
const summary=JSON.parse(fs.readFileSync(path.join(root,'data/psa10-period-summary.json'),'utf8'));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/pokemon-cards.json'),'utf8'));
assert.equal(summary.coverage.actualTradeCards,catalog.filter(c=>actualRows(c).rows.length).length,'daily observations must not count as individual trades');
const chunks=Array.from({length:16},(_,i)=>JSON.parse(fs.readFileSync(path.join(root,`data/psa10-periods/${i}.json`),'utf8')));
for(const[id,row]of Object.entries(summary.cards)) {
  const detail=chunks[shard(id)].cards[id];
  assert.equal(row[0],detail.snapshots[7].mean);assert.equal(row[2],detail.snapshots[30].mean);
  assert.equal(row[4],detail.snapshots[30].ageDays);
  assert.equal(row[5],detail.snapshots[75].mean);assert.equal(row[6],detail.snapshots[75].observedDays);
  assert.equal(row[7],detail.snapshots[7].ageDays);assert.equal(row[8],detail.snapshots[75].ageDays);
  for(const days of [7,30,75,200])assert.equal(row[summary.observationEvidenceIndices[days]],detail.snapshots[days].legacyUnverifiedDays,'small summary carries exact provenance without loading history');
}
for(const days of [7,30,75,200]) assert.equal(summary.coverage.byPeriod[days].meanCards,chunks.reduce((n,c)=>n+Object.values(c.cards).filter(r=>r.snapshots[days].count>0).length,0));
for(const [id,row] of Object.entries(summary.cards)) {
  const detail=chunks[shard(id)].cards[id].snapshots[200];
  assert.equal(row[9],detail.mean); assert.equal(row[10],detail.observedDays);
  assert.equal(detail.missingDays,200-detail.observedDays);
}
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');const init=app.slice(app.indexOf('async function init()'),app.indexOf('// Browser event bindings start here;'));
assert(!init.includes('psa10-periods/'),'90-day detail must not load at startup');
const finance=app.slice(app.indexOf('function calculateCard'),app.indexOf('function calculateCard')+1000);
assert(!finance.includes('psa10PeriodSummary'),'average is reference-only, not limit input');
console.log(JSON.stringify({pass:true,...result}));
}finally{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('pokeka-period-statistics-'));fs.rmSync(root,{recursive:true,force:true});}
