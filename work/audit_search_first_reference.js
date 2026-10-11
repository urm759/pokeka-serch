const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {load}=require('./audit_search_profit_consistency');
const outcomes=require('./audit_completion_outcomes');
const root=path.join(__dirname,'..');
function build(){
  const at=new Date().toISOString(),base='ceba99b4';
  const old=load(execFileSync('git',['show',`${base}:app.js`],{cwd:root,encoding:'utf8',maxBuffer:10000000}),at);
  const current=load(fs.readFileSync(path.join(root,'app.js'),'utf8'),at);
  const pairs=[old,current].map(a=>a.prepareCalculatedCards(a.state.cards));
  const hash=rows=>crypto.createHash('sha256').update(JSON.stringify(rows.map(c=>[c.id,c.buyLimits,c.purchaseDecision]))).digest('hex');
  assert.equal(hash(pairs[0]),hash(pairs[1]),'Reference display must not change any financial calculation or GO');
  const selected=(api,rows)=>rows.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id);
  const before=selected(old,pairs[0]),after=selected(current,pairs[1]);assert.deepEqual(before,after);
  const compare=(api,rows)=>rows.filter(c=>api.purchaseExploration(c).headroom!=null);
  const comparable=[compare(old,pairs[0]),compare(current,pairs[1])];
  const improved=comparable[1].filter(c=>!comparable[0].some(o=>o.id===c.id));
  const display=require('../limit-display-model');
  for(const c of comparable[1]){
    const p=current.purchaseExploration(c),d=display.summarize({limit:c.buyLimits.clean,psa10Price:c.psa10});
    assert.equal(p.cap,d.currentCap);assert.equal(p.headroom,(p.cap/p.price-1)*100);
  }
  const baselineFile=path.join(root,'work/20261011-search-first-before.json');
  const delta=fs.existsSync(baselineFile)?outcomes.compare(outcomes.unpack(JSON.parse(fs.readFileSync(baselineFile))),outcomes.snapshot(root)):null;
  const cohort=JSON.parse(fs.readFileSync(path.join(root,'work/priority-freshness-history.json'))).sources.hareruya2.cohort;
  const oldStock=JSON.parse(execFileSync('git',['show',`${base}:data/hareruya2-stock-summary.json`],{cwd:root,maxBuffer:15000000})).cards;
  const newStock=JSON.parse(fs.readFileSync(path.join(root,'data/hareruya2-stock-summary.json'))).cards;
  const fresh=stock=>cohort.filter(id=>{const age=Date.parse(at)-Date.parse(stock[id]?.observedAt);return age>=0&&age<=21600000;}).length;
  const representative=comparable[1].find(c=>c.id==='x-387059');
  const row=representative?{id:representative.id,name:representative.name,...current.purchaseExploration(representative),
    purchaseDecision:{verdict:representative.purchaseDecision.verdict,reasons:representative.purchaseDecision.reasons},
    currentMarketEligible:current.currentMarketView(representative).eligible}:null;
  const result={version:1,at,baseCommit:base,financialCalculationsUnchanged:true,financialHash:hash(pairs[1]),
    specifiedUrl:{before:before.length,after:after.length,idsUnchanged:true,purchaseGo:pairs[1].filter(c=>c.purchaseDecision?.verdict==='GO').length},
    referenceComparison:{before:comparable[0].length,after:comparable[1].length,restored:improved.length,restoredIds:improved.map(c=>c.id),representative:row},
    actualAcquisition:delta,fixedCohortFreshness:{at,total:cohort.length,beforeFresh6h:fresh(oldStock),afterFresh6h:fresh(newStock),
      meaning:'同じID群・同じ評価時刻の手動取得前後。定期運転の最低鮮度維持とは別'},
    scheduledAfterRevision:'次回定期実績は非AIスクリプトで確認。手動取得を定期成功に数えない',
    rule:'日時未確認のPSA9は参考警告。表示可能な同じ上限と新鮮な在庫価格の数値比較だけを許可し、購入GO・計算式・鮮度基準は不変'};
  fs.writeFileSync(path.join(root,'data/search-first-reference-audit.json'),JSON.stringify(result));
  console.log(JSON.stringify(result));return result;
}
if(require.main===module)build();
module.exports={build};
