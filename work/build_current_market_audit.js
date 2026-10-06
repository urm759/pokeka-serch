const fs = require('node:fs');
const path = require('node:path');
const builder = fs.readFileSync(path.join(__dirname, 'build_purchase_limit_audit.js'), 'utf8');
const prefix = builder.slice(0, builder.indexOf('const calculated = prepareCalculatedCards(state.cards);'));
const end = `
state.updateStatus = read('data/update-status.json', {});
vm.runInContext('globalThis.currentApi={currentMarketView};', context);
const calculated = prepareCalculatedCards(state.cards);
const policies = {};
for (const policy of ['buyback','marketplace','both']) {
  state.exitPolicy=policy;
  const cards=prepareCalculatedCards(state.cards);
  const rows=cards.map(card=>({card,view:context.currentApi.currentMarketView(card)}));
  const usable=rows.filter(row=>row.view.eligible);
  policies[policy]={eligible:usable.length,storePurchase:usable.filter(row=>row.view.purchaseKind==='store').length,
    missingPurchase:usable.filter(row=>row.view.purchaseKind==='missing').length,
    positiveAtStore:usable.filter(row=>row.view.purchaseKind==='store'&&row.view.economics?.expectedProfit>=0).length,
    capExplorationWithoutPurchase:usable.filter(row=>row.view.purchaseKind==='missing'&&Number.isFinite(row.view.cap)).length,
    missingPurchaseExamples:usable.filter(row=>row.view.purchaseKind==='missing'&&row.view.cap>0).slice(0,3).map(({card,view})=>({id:card.id,name:card.name,cap:view.cap,profit:view.economics,psa9Profit:view.psa9Profit,purchaseGo:false})),
    reasons:Object.fromEntries([...new Set(rows.flatMap(row=>row.view.reasons))].map(reason=>[reason,rows.filter(row=>row.view.reasons.includes(reason)).length])),
    examples:usable.filter(row=>row.view.purchaseKind==='store').sort((a,b)=>(b.view.economics?.expectedProfit??-Infinity)-(a.view.economics?.expectedProfit??-Infinity)).slice(0,5).map(({card,view})=>({
      id:card.id,name:card.name,marketPsa10:card.psa10,purchasePrice:view.purchasePrice,store:view.purchaseSource,
      currentExpectedProfit:view.economics.expectedProfit,currentExpectedRoi:view.economics.expectedRoi,psa9Profit:view.psa9Profit,
      cap:view.cap,stableCap:card.buyLimits.clean.finalMaxPrice,assumedRate:view.assumedRate,
      official:card.official,psa9Type:view.psa9Type,lowerGradePrice:view.lowerGradePrice,exit:view.exitLabel,warnings:view.warnings}))};
}
const result={generatedAt:new Date().toISOString(),catalog:state.cards.length,model:'current-market-hypothesis-v1',
  decisionModel:model.MODEL_VERSION,warning:'現相場維持の仮定。購入GOや返却時の保証ではない。PSA8以下・失敗未評価。',
  settings:{fee:state.fee,saleFeeRate:state.saleFeeRate,extraCost:state.saleExtraCost,lockDays:state.lockDays},policies};
write('data/current-market-exploration-audit.json',result);
console.log(JSON.stringify(result));
`;
new Function('require', '__dirname', 'process', prefix + end)(require, __dirname, process);
