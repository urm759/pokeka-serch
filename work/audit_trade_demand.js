const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {load}=require('./audit_search_profit_consistency'),metrics=require('../exploration-metrics'),facts=require('./profile_candidate_evidence');
const config=require('./priority-search-profiles.json'),at=new Date().toISOString();
const old=cp.execFileSync('git',['show','048066e5:app.js'],{encoding:'utf8',maxBuffer:12e6}),current=fs.readFileSync('app.js','utf8');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'),rows=[],audit=[];
for(const profile of config.profiles) for(const [overlayName,overlay] of [['urlOnly',{}],['approvedSaved',config.knownSavedOverlay]]) {
  const url=new URL(profile.url);for(const [k,v]of Object.entries(overlay))if(!url.searchParams.has(k))url.searchParams.set(k,v);
  const a=load(old,at,{url:url.href}),b=load(current,at,{url:url.href});
  const before=a.prepareCalculatedCards(a.state.cards),after=b.prepareCalculatedCards(b.state.cards);
  const signature=cards=>hash(cards.map(c=>[c.id,c.buyLimits,c.purchaseDecision,c.buybackAnalysis,c.psaDecision]));
  assert.equal(signature(before),signature(after),'reference trade/POP must not change financial calculations or GO');
  const ids=(api,cards)=>cards.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id);
  assert.deepEqual(ids(a,before),ids(b,after));
  const subject=after.find(c=>c.id==='x-91114');
  rows.push({profile:profile.id,overlay:overlayName,ids:ids(b,after),financialHash:signature(after),unchanged:true,
    marnie:{facts:facts.cardFacts(b,subject),exclusions:b.cardSearchExclusions(subject),listed:true,qualified:ids(b,after).includes(subject.id),
      trade7:metrics.tradeDemand(b.state.psa10PeriodSummary,subject.id,7,Date.parse(at)),trade30:metrics.tradeDemand(b.state.psa10PeriodSummary,subject.id,30,Date.parse(at)),
      support:metrics.buybackSupport(b.state.buybackObservationSummary,subject.id,b.state.buybackStoreMode,b.state.selectedBuybackStores,Date.parse(at),subject.psa10,subject.identityKey)}});
  if(profile.id==='A'&&overlayName==='urlOnly')for(const c of after) {
    const s=metrics.buybackSupport(b.state.buybackObservationSummary,c.id,'all',[],Date.parse(at),c.psa10,c.identityKey);
    if(c.overallAssessment?.supplyRisk<30 && c.psaTx30d>=30 && s.above>=2)audit.push({id:c.id,name:c.name,supplyRisk:c.overallAssessment.supplyRisk,
      psa10Tx30:c.psaTx30d,aboveMarketStores:s.above,comparableStores:s.count,
      comparison:metrics.tradeDemand(b.state.psa10PeriodSummary,c.id,30,Date.parse(at)),verdict:c.purchaseDecision?.verdict,
      note:'供給警戒と流動性/店舗支持が併存。支持だけで基準点数を戻さない'});
  }
}
const result={at,baseline:'048066e5',rows,referenceAudit:audit,domesticVsWorld:'対象範囲が異なる参考比較・新規出品/新規供給吸収ではない',llmCalls:0,
  note:'A/B全項目・承認済み保存条件を維持。同じ最新データ/設定/時刻のコード差だけを比較。実取得の成果はsearch-profile-cycle-progressの別区間'};
fs.writeFileSync('data/trade-demand-audit.json',JSON.stringify(result));
console.log(JSON.stringify({unchanged:true,profiles:rows.map(r=>({profile:r.profile,overlay:r.overlay,candidates:r.ids.length,marnieExclusions:r.marnie.exclusions})),supportedButSupplyWarning:audit.length}));
