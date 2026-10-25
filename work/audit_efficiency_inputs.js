// Independent arithmetic audit; never changes site settings or acquisition data.
const fs=require('node:fs'),assert=require('node:assert/strict');
const median=values=>{const a=[...values].sort((a,b)=>a-b);return a.length?(a[Math.floor(a.length/2)]+a[Math.floor((a.length-1)/2)])/2:null;};
function annual(net,buy,fee,extra,travel,days){
  if(![net,buy,fee,extra,travel,days].every(Number.isFinite)||days<=0||buy+fee+extra+travel<=0)return null;
  return (net-buy-fee)/(buy+fee+extra+travel)*100*365/days;
}
function components(api,card,days,now){
  const s=api.state,v=api.currentMarketView(card,true),p=v.assumedRate,lower=v.lowerGradePrice;
  const lowerNet=lower*(1-s.saleFeeRate/100)-s.saleExtraCost;
  let marketPrice=card.psa10,storeGross=card.buyLimits.clean.buybackExit?.grossCurrent,travel=card.buyLimits.clean.buybackExit?.travelCost||0,storeNet=null,stores=[];
  if(days){
    const summary=s.psa10PeriodSummary,idx={7:0,30:2,75:5,200:9}[days],slot=summary.cards?.[card.id];
    marketPrice=slot?.[idx];
    if(days===75&&!summary.periods.includes(75))marketPrice=null;
    const rows=s.buybackObservationSummary.cards?.[card.id]||{},metadata=s.buybackObservationSummary.shops||{};
    for(const [id,row]of Object.entries(rows)){
      if(s.buybackStoreMode==='selected'&&!s.selectedBuybackStores.includes(id)||s.buybackStoreMode==='mail'&&metadata[id]?.fulfilment==='store')continue;
      const quote=card.buybackAnalysis.rows.find(r=>r.shopId===id),period=row.periods?.[days],age=(now-Date.parse(period?.[2]))/3600000;
      if(row.identity!==card.identityKey||!quote?.valid||quote.stale||quote.quarantined||quote.campaign||quote.temporaryCampaign
        ||!Number.isFinite(period?.[0])||period[0]<=0||!Number.isInteger(period[1])||period[1]<1||!(age>=0&&age<=48))continue;
      stores.push({id,mean:period[0],days:period[1],at:period[2],travel:metadata[id]?.fulfilment==='store'?s.storeTravelCost:0});
    }
    storeGross=stores.length>=2?median(stores.map(r=>r.mean)):null;
    travel=stores.length>=2?median(stores.map(r=>r.travel)):0;
    if(Number.isFinite(storeGross))storeNet=p*(storeGross*(1-s.buybackDeductionRate/100)-s.saleExtraCost-travel)+(1-p)*lowerNet;
  }else if(card.buyLimits.clean.buybackExit?.usable&&Number.isFinite(storeGross)){
    const deducted=Math.round(storeGross*s.buybackDeductionRate/100);
    const p10=Math.round(storeGross-deducted-s.saleExtraCost-travel);
    storeNet=Math.round(p*p10+(1-p)*Math.round(lowerNet));
  }
  const marketNet=Number.isFinite(marketPrice)&&marketPrice>0?(p*marketPrice+(1-p)*lower)*(1-s.saleFeeRate/100)-s.saleExtraCost:null;
  const chosen=s.exitPolicy==='marketplace'?'marketplace':s.exitPolicy==='buyback'?'buyback':Number.isFinite(marketNet)&&Number.isFinite(storeNet)?marketNet<=storeNet?'marketplace':'buyback':null;
  const net=chosen==='marketplace'?marketNet:chosen==='buyback'?storeNet:null;
  return {psa10:marketPrice,psa9:lower,adopted10Rate:p,marketNet,storeGross,storeNet,chosen,net,travel:chosen==='buyback'?travel:0,stores};
}
function run(output='work/20261025-buyback-denominator-efficiency-audit.json'){
  const {load}=require('./audit_search_profit_consistency'),{allProfiles}=require('./search_profile_variants');
  const source=fs.readFileSync('app.js','utf8'),at=new Date().toISOString(),now=Date.parse(at),profiles=[];
  for(const profile of allProfiles(require('./priority-search-profiles.json'))){
    const api=load(source,at,{url:profile.url,fixedModelClock:true}),cards=api.prepareCalculatedCards(api.state.cards),s=api.state;
    const audited=[];
    for(const id of ['x-122054','pk-75866']){
      const c=cards.find(c=>c.id===id),runs=[];
      for(const days of [null,7,30,75,200]){
        const scenario=days?'obs'+days:'current',row=api.cardEfficiency(c,now,s.purchaseMode,scenario),facts=components(api,c,days,now);
        const buy=s.efficiencyBuy==='median'?row.medianEvidence?.value:c.currentStoreOffer?.value??null;
        const expected=annual(facts.net,buy,s.fee,s.saleExtraCost,facts.travel,s.lockDays+s.efficiencySaleDays+s.efficiencyPayoutDays);
        if(expected!==null&&row.annual!==null)assert(Math.abs(expected-row.annual)<1e-8,`${profile.id}/${id}/${scenario}: ${expected} != ${row.annual}`);
        else assert.equal(row.annual,expected,`${profile.id}/${id}/${scenario} material availability`);
        assert.equal(row.purchasePrice,buy);assert.equal(row.days,s.lockDays+s.efficiencySaleDays+s.efficiencyPayoutDays);
        runs.push({scenario,independentAnnual:expected,productionAnnual:row.annual,buy,buyBasis:row.basis,exit:row.exitLabel,profit:row.profit,investment:row.investment,days:row.days,state:row.calculationState,reason:row.reason,observation:row.observation,facts});
      }
      const current=api.cardEfficiency(c),csv=api.cardEfficiencyCsvFields(c,current);
      assert.equal(csv[0],current.purchasePrice??'');assert.equal(csv[8],current.annual??'');assert.equal(csv[7],current.days??'');
      const html=api.cardEfficiencyPanel(c,true);assert(html.includes(`data-efficiency-annual="${current.annual??''}"`));
      const filterReasons=api.cardSearchExclusions(c).filter(r=>r.includes('単体')&&r.includes('資金効率'));
      assert.equal(filterReasons.length>0,api.efficiencySearchValue(current)==null||current.annual<s.efficiencyMin);
      const periodMean=runs.slice(1).filter(r=>r.productionAnnual!==null),four=periodMean.length?periodMean.reduce((n,r)=>n+r.productionAnnual,0)/periodMean.length:null;
      const other=cards.find(x=>x.id===(id==='x-122054'?'pk-75866':'x-122054'));
      const compare=api.sorters['cardEfficiency-desc'](c,other),a=api.efficiencySearchValue(current),b=api.efficiencySearchValue(api.cardEfficiency(other));
      if(a!==null&&b!==null&&a!==b)assert.equal(Math.sign(compare),Math.sign(b-a));
      const original=s.efficiencyBuy;s.efficiencyBuy=original==='auto'?'median':'auto';const switched=api.cardEfficiency(c);s.efficiencyBuy=original;
      assert.equal(api.cardEfficiency(c).annual,current.annual,'buy-basis round trip cache');
      const wait=s.efficiencySaleDays;s.efficiencySaleDays=wait+1;const waited=api.cardEfficiency(c);s.efficiencySaleDays=wait;
      if(current.annual!==null)assert(Math.abs(waited.annual-current.annual*current.days/(current.days+1))<1e-8);
      assert.equal(api.cardEfficiency(c).annual,current.annual,'wait-period round trip cache');
      audited.push({id,name:c.name,runs,fourPeriodMean:four,adoptedPeriods:periodMean.length,filterReasons,allExclusions:api.cardSearchExclusions(c),csv,switchedBuy:{buy:switched.purchasePrice,annual:switched.annual}});
    }
    profiles.push({id:profile.id,url:profile.url,settings:Object.fromEntries(['fee','saleFeeRate','buybackDeductionRate','saleExtraCost','storeTravelCost','lockDays','efficiencySaleDays','efficiencyPayoutDays','efficiencyBuy','exitPolicy'].map(k=>[k,s[k]])),cards:audited});
  }
  const result={at,inputCommit:require('child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sameInputsAndTime:true,independentArithmetic:true,profiles};
  fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(profiles.map(p=>({id:p.id,cards:p.cards.map(c=>({id:c.id,current:c.runs[0].productionAnnual,buy:c.runs[0].buy,exit:c.runs[0].exit,days:c.runs[0].days,periods:c.runs.slice(1).map(r=>r.productionAnnual),four:c.fourPeriodMean,reasons:c.allExclusions}))}))));return result;
}
if(require.main===module)run(process.argv[2]);
module.exports={annual,components,run};
