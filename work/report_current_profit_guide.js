const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {load,specifiedUrl}=require('./audit_search_profit_consistency');
const {userUrl}=require('./audit_efficiency_thresholds');
const at=process.env.GUIDE_EVALUATION_AT||new Date().toISOString(),baseline='a9f8586e';
const source=fs.readFileSync('app.js','utf8'),old=cp.execFileSync('git',['show',`${baseline}:app.js`],{encoding:'utf8',maxBuffer:8e6});
const profiles=[];let examples=[];
for(const [name,url] of [['latest-shared',userUrl()],['regression-20pct',specifiedUrl]]) {
  const before=load(old,at,{url}),after=load(source,at,{url});
  const a=before.prepareCalculatedCards(before.state.cards),b=after.prepareCalculatedCards(after.state.cards);
  const hash=rows=>crypto.createHash('sha256').update(JSON.stringify(rows.map(c=>[c.id,c.buyLimits,c.purchaseDecision]))).digest('hex');
  assert.equal(hash(a),hash(b),'stable caps and purchase GO remain identical');
  const ids=(api,rows)=>rows.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id);
  assert.deepEqual(ids(before,a),ids(after,b),'unselected new basis never changes candidates');
  let guides=0,belowPractical=0,none=0;
  for(const c of b) {
    const g=after.currentProfitGuide(c);
    if(g.cap!=null){guides++;if(g.belowPractical)belowPractical++;
      assert(g.economics.expectedProfit+1e-7>=g.minProfit);assert(g.economics.expectedRoi+1e-7>=g.minRoi);
    }else none++;
  }
  profiles.push({name,urlHash:crypto.createHash('sha256').update(url).digest('hex'),before:ids(before,a),after:ids(after,b),
    financeHash:hash(b),guides,belowPractical,unavailableOrNoTarget:none,go:b.filter(c=>c.purchaseDecision?.verdict==='GO').length});
  if(name==='latest-shared') {
    examples=['pk-20743','pk-20749','pk-63635','pk-17457','pk-70080'].map(id=>{
      const c=b.find(c=>c.id===id);if(!c)return {id,status:'掲載照合待ち'};
      const g=after.currentProfitGuide(c),actual=after.currentMarketView(c,true),cap=after.purchaseExploration(c);
      after.state.profitSearchBasis='current-target';const search=after.searchProfitView(c);
      assert.equal(search.purchasePrice,g.cap);assert.equal(search.economics?.expectedProfit??null,g.economics?.expectedProfit??null);
      const display=after.selectedLimitDisplay(c,{stableCap:c.buyLimits?.clean?.finalMaxPrice,warnings:[]},search);
      assert.equal(display.currentCap,g.breakEvenCap,'profit target must not replace the displayed break-even cap');
      if(g.eligible)assert.equal(after.purchaseExploration(c).cap,g.breakEvenCap,'comparison/search/CSV retain the same break-even cap');
      after.state.profitSearchBasis='auto';
      return {id:c.id,name:c.name,psa10:c.psa10,stableCap:c.buyLimits?.clean?.finalMaxPrice,guide:g.cap,guideState:g.capState,
        breakEvenCap:cap.cap,rawMarket:c.priceAggregation?.value??c.price,raw70:g.practicalPrice,
        actualPurchase:actual.purchasePrice,actualProfit:actual.economics?.expectedProfit??null,actualPsa9Profit:actual.psa9Profit,
        targetProfit:g.minProfit,targetRoi:g.minRoi,guideProfit:g.economics?.expectedProfit??null,guideRoi:g.economics?.expectedRoi??null,
        exit:g.exitLabel,assumedRate:g.assumedRate,investmentExtra:g.investmentExtra,warnings:g.warnings,reasons:g.reasons,
        decision:{verdict:c.purchaseDecision?.verdict,reasons:c.purchaseDecision?.reasons},practicalDifficulty:g.belowPractical};
    });
  }
}
const report={version:1,at,baseline,modelChanged:false,guide:'独立した現相場維持の参考基準。GO/資金/ストレス/予測/平滑化は変更なし',
  formula:'min(現相場期待損益分岐の切下げ前値−最低利益, (切下げ前値−最低利益率/100×(鑑定費+投下諸費用))/(1+最低利益率/100))を500円単位に切下げ',
  profiles,examples};
fs.writeFileSync('data/current-profit-guide-validation.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({profiles:profiles.map(p=>({...p,before:p.before.length,after:p.after.length})),examples}));
