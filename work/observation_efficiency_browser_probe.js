// Local-only benchmark controls. Never served by production index.html.
const probeButton=document.createElement('button'),probeResult=document.createElement('pre');
probeButton.id='observation-probe';probeButton.textContent='同条件60枚・3回測定';probeResult.id='observation-probe-result';
probeButton.disabled=true;
document.body.prepend(probeResult);document.body.prepend(probeButton);
const probeReady=setInterval(()=>{if(state.cards.length && document.getElementById('searchPerformance')?.textContent){probeButton.disabled=false;clearInterval(probeReady);}},100);
const phaseButton=document.createElement('button');phaseButton.textContent='全件計算の内訳を確認';document.body.prepend(phaseButton);
phaseButton.onclick=()=>setTimeout(()=>{
  const phase={limitMs:0,buybackMs:0,decisionMs:0};
  const originals=[buildBuyLimits,buildBuybackAnalysis,finalizeCardDecision];
  const measure=(key,fn,args)=>{const t=performance.now();try{return fn(...args);}finally{phase[key]+=performance.now()-t;}};
  buildBuyLimits=(...a)=>measure('limitMs',originals[0],a);
  buildBuybackAnalysis=(...a)=>measure('buybackMs',originals[1],a);
  finalizeCardDecision=(...a)=>measure('decisionMs',originals[2],a);
  try{forceNextSearchCalculation=true;render();phase.totalCalculationMs=lastSearchTiming.calculationMs;phase.otherCalculationMs=Math.max(0,phase.totalCalculationMs-phase.limitMs-phase.buybackMs-phase.decisionMs);}
  finally{[buildBuyLimits,buildBuybackAnalysis,finalizeCardDecision]=originals;}
  probeResult.textContent=JSON.stringify({phase,scope:'同一ローカル画面の計算関数計時・参考。内訳は計算期間だけで、検索・DOM・通信は別。'});
},0);
probeButton.onclick=()=>setTimeout(async()=>{
  probeResult.textContent='測定中';
  const samples=[];
  const initialMetrics=uiLoadMetrics.map(r=>({...r}));
  state.efficiencyMin=null;state.q='';state.purchaseMode='normal';state.catalogScope='analysis';state.visibleLimit=60;
  state.diagnosticSearch=false;state.efficiencyScenario='current';state.efficiencyBuy='median';
  state.profitSearchBasis='limit';state.includePeriodReference=true;
  for(const [key] of explorationFields) { const mapping=explorationFields.find(x=>x[0]===key);state[mapping[1]]=null; }
  Object.assign(state,{minRoi:null,minExpectedProfitFilter:null,minExpectedRoiFilter:null,minStressExpectedProfitFilter:null,minStressExpectedRoiFilter:null,
    minPrice:null,maxPrice:null,minPsa10:0,maxPsa10:null,psa9RatioMin:null,psa9RatioMax:null,minPurchaseLimitRatio:null,
    hideThinDemand:false,hideReview:false,fundingOnly:false,officialOnly:false,year2020:false,
    fee:10980,lockDays:147,exitPolicy:'both',saleFeeRate:8,saleExtraCost:0,buybackDeductionRate:5,minExpectedProfit:0,minExpectedRoi:10,minAnnualEfficiency:40});
  state.showSkipped=true;state.efficiencyIncludeReference=true;
  for(let i=0;i<3;i++){
    await new Promise(resolve=>setTimeout(resolve,0));
    forceNextSearchCalculation=true;render();const full={...lastSearchTiming};
    await new Promise(resolve=>setTimeout(resolve,0));
    render();const condition={...lastSearchTiming};
    const first=document.querySelector('[data-card-detail]');
    if(first){first.open=true;state.openCardDetails.add(first.dataset.cardDetail);render();}
    const detail={...lastSearchTiming};
    await new Promise(resolve=>setTimeout(resolve,0));
    state.openCardDetails.clear();render();
    samples.push({full,condition,detail});
  }
  const cards=calculatedCardsForSearch(state.cards);
  const payload=JSON.stringify(cards.map(c=>[c.id,c.buyLimits,c.purchaseDecision]));
  const financialHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const ids=[...document.querySelectorAll('article.card')].map(e=>e.dataset.cardId || e.querySelector('[data-card-detail]')?.dataset.cardDetail);
  const resources=performance.getEntriesByType('resource').filter(r=>r.name.includes('/data/'));
  probeResult.textContent=JSON.stringify({width:innerWidth,loadedCards:cards.length,displayed:ids.length,ids,financialHash,samples,
    initialJsonBytes:initialMetrics.reduce((n,r)=>n+r.bytes,0),jsonParseMs:initialMetrics.reduce((n,r)=>n+r.jsonParseMs,0),decodeMs:initialMetrics.reduce((n,r)=>n+r.decodeMs,0),
    transferredBytes:resources.reduce((sum,r)=>sum+r.transferSize,0),decodedBytes:resources.reduce((sum,r)=>sum+r.decodedBodySize,0),
    lazyHistoryRequests:resources.filter(r=>/psa10-periods|psa10-price-history/.test(r.name)).map(r=>r.name),
    note:'同じPCの幅別・同データ・60枚表示。通信はローカルgzip、paint完了・実機スマホとは別。詳細1枚の展開後に原票リクエストを記録。'});
},0);
