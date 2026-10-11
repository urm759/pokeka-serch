const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {load,specifiedUrl}=require('./audit_search_profit_consistency');
function build() {
  const at=new Date().toISOString();
  const before=load(execFileSync('git',['show','fe6e3e9a:app.js'],{encoding:'utf8',maxBuffer:10000000}),at);
  const after=load(fs.readFileSync('app.js','utf8'),at);
  const oldCards=before.prepareCalculatedCards(before.state.cards),cards=after.prepareCalculatedCards(after.state.cards);
  const hash=rows=>crypto.createHash('sha256').update(JSON.stringify(rows.map(c=>[c.id,c.buyLimits,c.purchaseDecision]))).digest('hex');
  assert.equal(hash(oldCards),hash(cards),'strict limits and purchase GO unchanged on identical data');
  const candidates=cards.filter(c=>!after.cardSearchExclusions(c).length),oldCandidates=oldCards.filter(c=>!before.cardSearchExclusions(c).length);
  assert.deepEqual(candidates.map(c=>c.id),oldCandidates.map(c=>c.id),'disabled efficiency filter preserves specified-URL results');
  const oldRows=oldCandidates.map(c=>({id:c.id,name:c.name,...before.cardEfficiency(c)}));
  const rows=candidates.map(c=>({id:c.id,name:c.name,...after.cardEfficiency(c)}));
  const representative=cards.filter(c=>/グレイシアV|ニンフィアV|リーリエのピッピex/.test(c.name)).map(c=>({id:c.id,name:c.name,model:c.model,efficiency:after.cardEfficiency(c),strictReasons:after.currentMarketView(c).reasons}));
  const gained=rows.filter(r=>r.annual!=null&&oldRows.find(o=>o.id===r.id)?.annual==null);
  after.state.efficiencyMin=0;
  const excluded=candidates.filter(c=>after.cardSearchExclusions(c).length).map(c=>c.id);
  after.state.efficiencyIncludeReference=true;
  const included=candidates.filter(c=>!after.cardSearchExclusions(c).length).map(c=>c.id);
  for (const c of candidates) {
    const row=after.cardEfficiency(c);
    assert.equal(after.efficiencySearchValue(row),row.annual);
    if (row.calculationState==='unavailable') assert.equal(row.annual,null);
  }
  const report={version:1,at,baseCommit:'fe6e3e9a',urlHash:crypto.createHash('sha256').update(specifiedUrl).digest('hex'),
    userObservedCohort:{displayed:27,psa9DateMissing:27,confidenceMissing:5,buybackMissing:3,at:'ユーザー確認時点・ID一覧未提供のため最新母数と分離'},
    catalog:cards.length,candidateCount:candidates.length,before:{unavailable:oldRows.filter(r=>r.annual==null).length,rows:oldRows},
    after:{...after.efficiencySummary(candidates),rows},referenceRecovered:gained.length,
    annualNonnegative:{referenceOffExcluded:excluded.length,referenceOnIds:included},representative,
    financialHash:hash(cards),limitsAndGoUnchanged:true,referenceRecoveryIsAcquisition:false,
    completionTargets:rows.map(r=>({id:r.id,psa9Confirmation:r.referenceReasons?.includes('PSA9日時未確認')||false,buybackMissing:r.blockingReasons?.some(reason=>reason.includes('買取出口'))||false})),
    rule:'参考計算だけ解除。個別PSA9実成約取得・鮮度回復・購入GO昇格ではない。取得日時不明・推定値・低件数は警告。両出口不足は停止。'};
  const baselineFile='work/efficiency-reference-before-acquisition.json';
  if (fs.existsSync(baselineFile)) {
    const prior=JSON.parse(fs.readFileSync(baselineFile,'utf8')),ids=new Set(prior.after.rows.map(c=>c.id));
    report.sameAcquisitionCohort={beforeAt:prior.at,ids:[...ids],before:prior.after,after:after.efficiencySummary(cards.filter(c=>ids.has(c.id)))};
    const outcome=require('./audit_completion_outcomes');
    const baseline=outcome.unpack(JSON.parse(execFileSync('git',['show','812ade1b:work/completion-outcomes-last.json'],{encoding:'utf8',maxBuffer:10000000})));
    report.acquisition={...outcome.compare(baseline,outcome.snapshot(process.cwd())),baselineKind:'取得前mainの固定ID・固定項目。新增追跡項目は成果に数えない',
      psa9ConfirmedPrices:require('../data/pokemon-cards.json').filter(c=>c.snkPsa9Price>0&&c.psa9ObservedAt).length,
      domesticPsa9IndividualTrades:0};
    const checkpointPath='data/price-catchup-status.json',checkpoint=JSON.parse(fs.readFileSync(checkpointPath,'utf8'));
    if (checkpoint.startedAt>=prior.at) {
      checkpoint.outcomes=report.acquisition;checkpoint.outcomeCorrection='追加追跡項目による見かけの補完を除外・履歴ビット配置を保持';
      fs.writeFileSync(checkpointPath,JSON.stringify(checkpoint));
      const historyPath='work/price-catchup-history.json',history=JSON.parse(fs.readFileSync(historyPath,'utf8'));
      for (const row of history.runs || []) if (row.startedAt===checkpoint.startedAt) {
        row.outcomes=checkpoint.outcomes;row.outcomeCorrection=checkpoint.outcomeCorrection;
      }
      fs.writeFileSync(historyPath,JSON.stringify(history));
    }
  }
  fs.writeFileSync('data/efficiency-reference-audit.json',JSON.stringify(report));
  console.log(JSON.stringify({at,candidates:candidates.length,oldUnavailable:report.before.unavailable,summary:after.efficiencySummary(candidates),referenceRecovered:gained.length,nonnegativeReference:included.length,financialHash:report.financialHash,acquisition:report.acquisition}));
  return report;
}
if(require.main===module)build();
module.exports={build};
