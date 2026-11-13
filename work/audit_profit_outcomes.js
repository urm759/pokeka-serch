const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {load}=require('./audit_search_profit_consistency');
function build({base='0c6726ea165876f8e07b9d84ed3c774277991d80',at=new Date().toISOString()}={}){
 const source=fs.readFileSync('app.js','utf8'),oldSource=cp.execFileSync('git',['show',base+':app.js'],{encoding:'utf8',maxBuffer:12e6});
 const config=JSON.parse(fs.readFileSync('work/priority-search-profiles.json'));
 const profiles=[...config.profiles,...config.additionalProfiles].filter(p=>config.focusProfileIds.includes(p.id)),report={version:1,base,at,profiles:[],sourceRequests:0,llmCalls:0,codexCalls:0};
 const hash=a=>crypto.createHash('sha256').update(JSON.stringify(a)).digest('hex');
 const summarize=(api)=>{const cards=api.prepareCalculatedCards(api.state.cards);return {api,cards,ids:cards.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id),signature:hash(cards.map(c=>[c.id,c.buyLimits,c.purchaseDecision,api.searchProfitView(c),api.cardEfficiency(c)]))};};
 const row=(r,id)=>{const c=r.cards.find(c=>c.id===id);if(!c)return null;const v=r.api.searchProfitView(c),e=r.api.cardEfficiency(c);return {id,name:c.name,median:e.purchasePrice,psa10:c.psa10,psa9:c.psa9Audit,rate:c.buyLimits?.clean?.assumptions?.hitRate,profit:e.profit,roi:e.roi,annual:e.annual,exit:e.exitLabel,scenario:e.scenario,priceEvidence:c.priceAggregation,store:c.currentStoreOffer,exclusions:r.api.cardSearchExclusions(c),quality:c.overallAssessment};};
 for(const profile of profiles){
  const before=summarize(load(source,at,{url:profile.url,dataRef:base})),oldCode=summarize(load(oldSource,at,{url:profile.url})),after=summarize(load(source,at,{url:profile.url}));
  assert.equal(oldCode.signature,after.signature,'reference display must not change financial values/GO');assert.deepEqual(oldCode.ids,after.ids);
  let expectedChecked=0,purePsa10Available=0,maxRoundingDifference=0;const auditFailures=[];
  for(const card of after.cards){const r=after.api.profitOutcomeAudit(card),v=after.api.searchProfitView(card),e=after.api.cardEfficiency(card);
   if(Number.isFinite(r.market.profit)){purePsa10Available++;assert(Math.abs(r.market.profit-(r.market.gross*(1-after.api.state.saleFeeRate/100)-after.api.state.saleExtraCost-r.market.buy-after.api.state.fee))<1e-7);}
   if(!Number.isFinite(e.profit))continue;
   expectedChecked++;assert.equal(r.expected.profit,e.profit);assert.equal(r.expected.roi,e.roi);assert.equal(r.expected.profit,v.economics.expectedProfit);
   const delta=Math.abs(r.expected.net-(r.rate*r.selected.net+(1-r.rate)*r.lowerNet));maxRoundingDifference=Math.max(maxRoundingDifference,delta);
   if(delta>1.01)auditFailures.push({id:card.id,delta,expected:r.expected.net,selected:r.selected.net,lower:r.lowerNet,rate:r.rate});
   const csv=after.api.profitOutcomeCsvFields(card);assert.equal(csv[3],r.market.profit??'');assert.equal(csv[14],e.profit);assert.equal(csv[15],e.roi);
  }
  const gained=after.ids.filter(id=>!before.ids.includes(id)),lost=before.ids.filter(id=>!after.ids.includes(id));
  report.profiles.push({id:profile.id,before:before.ids,after:after.ids,gained:gained.map(id=>({before:row(before,id),after:row(after,id)})),lost:lost.map(id=>({before:row(before,id),after:row(after,id)})),financialCodeUnchanged:true,financialHash:after.signature,expectedChecked,purePsa10Available,maxRoundingDifference,auditFailures});
  console.log(JSON.stringify({id:profile.id,before:before.ids.length,after:after.ids.length,gained,lost,expectedChecked,purePsa10Available,maxRoundingDifference,auditFailures}));
 }
 report.independent={before:[...new Set(report.profiles.flatMap(p=>p.before))],after:[...new Set(report.profiles.flatMap(p=>p.after))]};
 fs.writeFileSync('work/20261113-profit-outcome-audit.json',JSON.stringify(report));
 assert(report.profiles.every(p=>!p.auditFailures.length),'weighted exits require investigation; do not mask mismatch');return report;
}
if(require.main===module)build();module.exports={build};
