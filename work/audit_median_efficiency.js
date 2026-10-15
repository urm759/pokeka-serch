const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {load}=require('./audit_search_profit_consistency'),ROOT=path.join(__dirname,'..');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function build(at=new Date().toISOString()) {
  const source=fs.readFileSync(path.join(ROOT,'app.js'),'utf8'),old=cp.execFileSync('git',['show','cfd86d00:app.js'],{cwd:ROOT,encoding:'utf8',maxBuffer:12*1024*1024});
  const config=JSON.parse(fs.readFileSync(path.join(ROOT,'work/priority-search-profiles.json'))),before=JSON.parse(fs.readFileSync(path.join(ROOT,'work/median-shadow-before-20261015.json')));
  const cycle=JSON.parse(fs.readFileSync(path.join(ROOT,'data/search-profile-cycle-progress.json'))).cycles.filter(c=>c.key==='median-shadow-20261015').at(-1);
  const savedAudit=JSON.parse(fs.readFileSync(path.join(ROOT,'data/priority-search-profile-audit.json')));
  const subjects=['pk-21475','x-91128'],profiles=[];
  for(const p of config.profiles) {
    const cases={};
    const medianUrl=new URL(p.url);medianUrl.searchParams.set('effBuy','median');
    for(const [name,code,url]of [['oldSameData',old,p.url],['unchangedBasis',source,p.url],['medianBasis',source,medianUrl.href]]) {
      const api=load(code,at,{url}),cards=api.prepareCalculatedCards(api.state.cards),qualified=cards.filter(c=>!api.cardSearchExclusions(c).length);
      const sample=cards.filter(c=>subjects.includes(c.id));
      cases[name]={ids:qualified.map(c=>c.id).sort(),financialHash:hash(cards.map(c=>[c.id,c.buyLimits,c.purchaseDecision])),
        qualifiedExamples:qualified.slice(0,3).map(c=>({id:c.id,name:c.name,efficiency:api.cardEfficiency(c),exclusions:api.cardSearchExclusions(c)})),
        referenceStates:cards.reduce((r,c)=>{const e=api.cardEfficiency(c);r[e.calculationState]=(r[e.calculationState]||0)+1;return r;},{}),
        subjects:sample.map(c=>({id:c.id,name:c.name,price:c.price,psa10:c.psa10,psa9:c.psa9,aggregation:c.priceAggregation,
          purchase:c.currentStoreOffer,official:api.state.psaPopulation[c.id],held:api.state.psaSpecificationHeld[c.id],
          efficiency:api.cardEfficiency(c),storeEfficiency:api.cardEfficiency(c,Date.parse(at),api.state.purchaseMode,api.state.efficiencyScenario,'store'),
          medianEfficiency:api.cardEfficiency(c,Date.parse(at),api.state.purchaseMode,api.state.efficiencyScenario,'median'),
          exclusions:api.cardSearchExclusions(c),decision:{verdict:c.purchaseDecision?.verdict,reasons:c.purchaseDecision?.reasons,limitingFactor:c.purchaseDecision?.limitingFactor}}))};
    }
    if(hash(cases.oldSameData.ids)!==hash(cases.unchangedBasis.ids)||cases.oldSameData.financialHash!==cases.unchangedBasis.financialHash)throw Error('Old basis financial/GO/candidate regression '+p.id);
    const oldIds=new Set(cases.unchangedBasis.ids),medIds=new Set(cases.medianBasis.ids);
    profiles.push({id:p.id,urlHash:hash(p.url),savedOverlay:config.knownSavedOverlay || null,
      knownSavedConditions:savedAudit.profiles.find(r=>r.urlOnly.id===p.id)?.knownSavedConditions?.qualified ?? null,cases,
      basisChange:{gained:[...medIds].filter(id=>!oldIds.has(id)),lost:[...oldIds].filter(id=>!medIds.has(id)),
        dataFirstQualified:cycle?.profiles.find(r=>r.id===p.id)?.firstQualified?.length ?? null,
        note:'同じデータ・時刻・数値条件。買値基準だけ変更した比較であり、取得による初適合ではない。元URL/端末保存は変更しない'},
      priorData:{at:before.at,ids:before.rows.find(r=>r.id===p.id)?.ids || null}});
  }
  const report={version:1,at,baseline:'cfd86d00',profiles,productionModelChanged:false,goRulesChanged:false,newMedianBasisReferenceOnly:true,
    localSavedConditions:'承認済み復元は保持。端末のその他条件はこのNode監査では未観測。URLのみと保存追加条件込みは既存profile auditで分離',
    noGuarantee:'中央値の買値で購入できる保証なし。PSA8以下/鑑定不可未評価。資金効率は探索比較のみ'};
  const outcomes=require('./audit_completion_outcomes'),baseline=JSON.parse(fs.readFileSync(path.join(ROOT,'work/search-profile-cycle-baseline-median-shadow-20261015.json')));
  report.dataChanges=outcomes.compare(outcomes.unpack(baseline.snapshot),outcomes.snapshot(ROOT,Date.parse(at)));
  report.dataChanges.note='不足状態の復帰は最新データからの再評価を含む。新規原票取得68枚という意味ではない。Cardrushは保存済みURL照合のみでHTTP0・有効純増0。PSA1枚は保存済み公式行の再照合で追加HTTP0。';
  fs.writeFileSync(path.join(ROOT,'data/median-efficiency-audit.json'),JSON.stringify(report));
  console.log(JSON.stringify(profiles.map(p=>({id:p.id,unchanged:p.cases.unchangedBasis.ids.length,median:p.cases.medianBasis.ids.length,basisChange:p.basisChange,subjects:p.cases.unchangedBasis.subjects.map(c=>({id:c.id,store:c.efficiency.purchasePrice,median:c.medianEfficiency.purchasePrice,annual:c.medianEfficiency.annual,reasons:c.exclusions}))}))));
  return report;
}
if(require.main===module)build();module.exports={build};
