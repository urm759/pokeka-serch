(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ExplorationMetrics = api;
})(typeof window === 'object' ? window : globalThis, function() {
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const referenceMedianCache=new WeakMap();
  function percent(numerator, denominator) {
    return finite(numerator) && finite(denominator) && denominator > 0 ? (numerator / denominator - 1) * 100 : null;
  }
  function inRange(value, minimum, maximum) {
    return minimum == null && maximum == null || finite(value) && (minimum == null || value >= minimum) && (maximum == null || value <= maximum);
  }
  function offerPrice(offer, now = Date.now()) {
    const age = offer?.updatedAt ? (now - Date.parse(offer.updatedAt)) / 3600000 : NaN;
    const stockAge = offer?.inventoryAt ? (now - Date.parse(offer.inventoryAt)) / 3600000 : NaN;
    return offer?.available === true && offer?.fresh === true && finite(offer.value) && offer.value > 0 && age >= 0 && age <= 48 && stockAge >= 0 && stockAge <= 48 ? offer.value : null;
  }
  function referenceMedian(card, now=Date.now()) {
    const a=card.priceAggregation || {},comparison=a.comparison,allRows=comparison ? [...comparison.included,...comparison.excluded] : a.included || [],reasons=[],warnings=[],origins=new Set();
    const cacheKey=JSON.stringify([allRows.map(r=>[r.value,r.updatedAt,r.url,r.valid,r.conditionAccepted,r.upstreamSource,r.originId,r.merchantId,r.comparisonReasons]),a.value,comparison?.conflicted??a.conflicted,card.priceIntegrity?.disputed,card.identityReviewRequired,card.dataQuality?.manualReview,card.dataQuality?.dataAnomaly]);
    const cached=referenceMedianCache.get(a);
    if(cached?.key===cacheKey&&now>=cached.at&&now<=cached.expires)return cached.result;
    const freshAt=r=>typeof r.updatedAt==='string'&&r.updatedAt.includes('T')&&Number.isFinite(Date.parse(r.updatedAt))&&Date.parse(r.updatedAt)<=now&&now-Date.parse(r.updatedAt)<=48*3600000;
    // Keep historical quotes in the original aggregation. Only this independent
    // exploration basis is rebuilt; purchase limits and GO retain their inputs.
    const adoptable=r=>freshAt(r)&&(!comparison||!r.comparisonReasons?.length);
    const omitted=allRows.filter(r=>!adoptable(r)),rows=allRows.filter(adoptable);
    let independent=0,unknown=0,expiresAt=Infinity;
    const evidence=rows.map(r=>{
      let host='';try{host=new URL(r.url).hostname.toLowerCase().replace(/^www\./,'');}catch{}
      if(!host||!/^https?:\/\//.test(r.url || '')||!finite(r.value)||r.value<=0||r.valid===false||r.conditionAccepted===false)reasons.push('中央値の採用価格・出典・状態の根拠不足');
      const direct=/^(cardrush-pokemon\.jp|hareruya2\.com|yuyu-tei\.jp|torecacamp-pokemon\.com)$/.test(host);
      const origin=r.upstreamSource || r.originId || r.merchantId || (direct?host:null);
      const at=Date.parse(r.updatedAt),fresh=typeof r.updatedAt==='string'&&r.updatedAt.includes('T')&&Number.isFinite(at)&&at<=now&&now-at<=48*3600000;
      if(!fresh)reasons.push('中央値の採用価格に古値・日時不明あり');
      else expiresAt=Math.min(expiresAt,at+48*3600000);
      if(origin){if(origins.has(origin))reasons.push('中央値の採用元に転載・同一店舗の重複あり');else{origins.add(origin);independent++;}}
      else unknown++;
      return {source:r.source,origin:origin || null,url:r.url || null,price:r.value,observedAt:r.updatedAt || null,fresh,kind:r.kind || '価格区分未確認'};
    });
    if(!rows.length)reasons.push(allRows.length?'中央値の採用価格に古値・日時不明あり':'素体参考中央値未取得');
    if(omitted.length)warnings.push(`古値・参考価格・仕様保留等${omitted.length}元を参考中央値から除外・原価格と日時は履歴保持`);
    if((a.included || []).length>1&&rows.length<2)reasons.push('新鮮な採用根拠が1元以下・過去の複数元を単一店舗で代用しない');
    if((comparison?.conflicted??a.conflicted)||card.priceIntegrity?.disputed||card.identityReviewRequired||card.dataQuality?.manualReview||card.dataQuality?.dataAnomaly)reasons.push('中央値の価格対立・仕様照合保留');
    if(rows.length===1)warnings.push('単一ソース参考');
    if(unknown)warnings.push('集計元の内訳・独立性未確認'+unknown+'元（独立店舗数に加算しない）');
    warnings.push('中央値で実際に購入できるとは限らない・購入GOとは別');
    const sorted=rows.map(r=>r.value).filter(v=>finite(v)&&v>0).sort((x,y)=>x-y),n=sorted.length;
    const rebuilt=n?(sorted[Math.floor(n/2)]+sorted[Math.floor((n-1)/2)])/2:null;
    const result={value:reasons.length?null:rebuilt,displayValue:rebuilt,historicalValue:finite(a.value)?a.value:null,count:rows.length,independent,unknown,
      min:rows.length?Math.min(...rows.map(r=>r.value)):null,max:rows.length?Math.max(...rows.map(r=>r.value)):null,
      rows:evidence,omitted:omitted.map(r=>({source:r.source,url:r.url || null,price:r.value,observedAt:r.updatedAt || null,reason:r.comparisonReasons?.join('／')||'古値・日時不明・参考中央値不採用'})),reasons:[...new Set(reasons)],warnings,reference:true,expiresAt};
    const future=allRows.map(r=>Date.parse(r.updatedAt)).filter(t=>Number.isFinite(t)&&t>now);
    referenceMedianCache.set(a,{key:cacheKey,at:now,expires:Math.min(expiresAt,...future.map(t=>t-1)),result});
    return result;
  }
  function meanSale(mean, buy, fee, feeRate, extra) {
    if (![mean,buy,fee,feeRate,extra].every(finite) || mean <= 0 || buy < 0 || fee < 0 || extra < 0 || feeRate < 0 || feeRate >= 100 || buy + fee <= 0) return {net:null,profit:null,roi:null};
    const net = mean * (1 - feeRate / 100) - extra, profit = net - buy - fee;
    return {net,profit,roi:profit / (buy + fee) * 100};
  }
  function atPurchase(economics, buy, fee) {
    if (!finite(economics?.expectedSale) || !finite(buy) || buy < 0 || !finite(fee) || buy + fee <= 0) return null;
    const profit = economics.expectedSale - buy - fee;
    return {...economics,purchasePrice:buy,expectedProfit:profit,expectedRoi:profit / (buy + fee) * 100};
  }
  function efficiency(economics, buy, fee, costs, returnDays, saleDays, payoutDays) {
    const period = [returnDays,saleDays,payoutDays].every(finite) && returnDays > 0 && saleDays >= 0 && payoutDays >= 0 ? returnDays + saleDays + payoutDays : null;
    const unavailable = {investment:null,profit:null,roi:null,days:finite(period) ? period : null,annual:null};
    if (![buy,fee,costs,returnDays,saleDays,payoutDays].every(finite) || buy < 0 || fee < 0 || costs < 0
      || returnDays <= 0 || saleDays < 0 || payoutDays < 0 || !finite(economics?.expectedSale)) return unavailable;
    const investment = buy + fee + costs, days = period;
    if (!(investment > 0 && days > 0) || !finite(investment) || !finite(days)) return unavailable;
    // expectedSale already includes selling fees/deductions/extra costs. Do not subtract them twice.
    const profit = economics.expectedSale - buy - fee, roi = profit / investment * 100;
    const annual = roi * 365 / days;
    return [profit,roi,annual].every(finite) ? {investment,profit,roi,days,annual} : unavailable;
  }
  function coverage(summary, cardId, mode, selected, now = Date.now()) {
    const shops = Object.entries(summary?.shops || {}).filter(([id,s]) => mode === 'selected' ? selected.includes(id) : mode !== 'mail' || s.fulfilment !== 'store');
    let confirmed = 0, listed = 0, observed = 0, posted = 0;
    const dates = new Set(), rows = summary?.cards?.[cardId] || {};
    for (const [id,s] of shops) {
      const row = rows[id] || {};
      const postedDays = new Set(row.listedDays || []), incompleteDays = new Set(s.identityIncompleteDays || []);
      const knownDays = [...new Set(s.completeDays || [])].filter(date => !incompleteDays.has(date) || postedDays.has(date));
      const age = s.currentConfirmedAt ? (now - Date.parse(s.currentConfirmedAt)) / 3600000 : NaN;
      if (age >= 0 && age <= 48 && (s.currentIdentityComplete !== false || row.currentListed === true)) { confirmed++; listed += Number(row.currentListed === true); }
      observed += knownDays.length; posted += knownDays.filter(date=>postedDays.has(date)).length;
      for (const date of knownDays) dates.add(date);
    }
    return {totalShops:shops.length,confirmedShops:confirmed,listedShops:confirmed ? listed : null,currentRate:confirmed ? listed / confirmed * 100 : null,
      observedShopDays:observed,postedShopDays:posted,observedDays:dates.size,
      rate30:observed ? posted / observed * 100 : null,averageShops30:dates.size ? posted / dates.size : null,
      retrievalCoverage:shops.length ? observed / (shops.length * 30) * 100 : null};
  }
  const observationPeriods = [7,30,75,200];
  function migrateObservationSettings(input, url = false) {
    const value = {...input}, previous = {};
    for (const suffix of ['Min','Max']) {
      const old = (url ? 'obs90' : 'observation90')+suffix;
      const next = (url ? 'obs75' : 'observation75')+suffix;
      if (Object.hasOwn(value,old)) {
        previous[old]=value[old];
        if (!Object.hasOwn(value,next)) value[next]=value[old];
        delete value[old];
      }
    }
    const scenario=url?'effScenario':'efficiencyScenario';
    if (value[scenario]==='obs90') { previous[scenario]='obs90'; value[scenario]='obs75'; }
    return {value,previous,changed:Object.keys(previous).length>0};
  }
  function observation(summary, id, current, days) {
    const indices = {7:[0,1,7],30:[2,3,4],75:[5,6,8],200:[9,10,11]}[days];
    const row = summary?.cards?.[id];
    // Never relabel the compact slot of an old 90-day summary as 75 days.
    if (days === 75 && !summary?.periods?.includes(75)) return {days,mean:null,count:null,age:null,delta:null,reference:true,latest:null,stale:true};
    const [mean,count,age] = indices ? indices.map(i=>row?.[i]) : [];
    const valid = finite(mean) && mean > 0 && Number.isInteger(count) && count > 0 && count <= days;
    const required = summary?.minimumObservationDays?.[days] ?? days;
    const reference = !valid || count < required || days === 200 && row?.[12] > 0;
    const latest = finite(age) && age >= 0 && Number.isFinite(Date.parse(summary?.asOf))
      ? new Date(Date.parse(summary.asOf+'T00:00:00Z')-age*86400000).toISOString().slice(0,10) : null;
    const drawdownIndex=summary?.drawdownIndices?.[days], drawdown=drawdownIndex == null ? null : row?.[drawdownIndex];
    return {days,mean:valid ? mean : null,count:valid ? count : null,age:finite(age) ? age : null,
      drawdown:valid && count >= 2 && finite(drawdown) && drawdown <= 0 ? drawdown : null,
      drawdownReference:count < days || (row?.[summary?.observationEvidenceIndices?.[days]] ?? 1) > 0,
      delta:valid && finite(current) && current > 0 ? percent(current,mean) : null,reference,latest,
      stale:!latest || age > (summary?.staleObservationDays ?? 2)};
  }
  function observationExclusions(summary, card, settings) {
    const reasons = [];
    for (const days of observationPeriods) {
      const minimum = settings['observation'+days+'Min'], maximum = settings['observation'+days+'Max'];
      if (minimum == null && maximum == null) continue;
      const label = days+'日観測乖離率';
      if (minimum != null && maximum != null && minimum > maximum) { reasons.push(label+'・下限＞上限'); continue; }
      const value = observation(summary,card.id,card.psa10,days);
      if (value.delta == null) reasons.push(label+'・平均または現相場未取得');
      else if (value.reference && settings.observationIncludeReference === false) reasons.push(label+'・観測不足の参考値を対象外');
      else {
        const tolerance = Number.EPSILON * 8 * Math.max(1,Math.abs(value.delta),Math.abs(minimum ?? 0),Math.abs(maximum ?? 0));
        if (minimum != null && value.delta < minimum-tolerance || maximum != null && value.delta > maximum+tolerance) reasons.push(label+'条件');
      }
    }
    return reasons;
  }
  function observationEconomics(summary, card, view, days, policy, feeRate, extra, now = Date.now()) {
    const observed = observation(summary,card.id,card.psa10,days);
    const row=summary?.cards?.[card.id], index=summary?.observationEvidenceIndices?.[days] ?? ({7:13,30:14,75:15,200:12})[days];
    const legacy=row?.[index];
    observed.unverifiedDays=Number.isInteger(legacy) && legacy >= 0 ? legacy : row?.[12] === 0 ? 0 : null;
    // New mean-efficiency assumptions require every calendar day for a non-sparse label.
    // This does not change existing observation-deviation filter thresholds.
    observed.reference = observed.reference || observed.count !== days || observed.unverifiedDays !== 0;
    const warnings = [], reasons = [];
    if (policy !== 'marketplace') reasons.push('選択した買取出口の同条件平均要約未整備（店舗・仕様・減額の照合が必要）・フリマへの自動切替なし');
    if (observed.mean == null) reasons.push(days+'日観測平均未取得');
    const today = Math.floor((now+9*3600000)/86400000);
    const age = observed.latest ? today-Date.parse(observed.latest)/86400000 : null;
    if (observed.mean != null && (age == null || age < 0 || age > (summary?.staleObservationDays ?? 2))) reasons.push('観測平均の最終観測が古い・日時不正');
    if (![view.assumedRate,view.lowerGradePrice,feeRate,extra].every(finite) || view.assumedRate < 0 || view.assumedRate > 1 || view.lowerGradePrice <= 0 || feeRate < 0 || feeRate >= 100 || extra < 0) reasons.push('想定10率・PSA9現在価格・費用未取得');
    if (observed.reference) warnings.push(`参考・観測不足 ${observed.count ?? 0}/${days}日（欠測${days-(observed.count ?? 0)}日）`);
    if (observed.unverifiedDays !== 0) warnings.push(`参考・観測の取得根拠未確認 ${observed.unverifiedDays == null ? '日数未集計' : observed.unverifiedDays+'日'}。日時・仕様の証拠は捏造しない`);
    if (finite(card.psa10) && observed.mean > card.psa10) warnings.push('平均が現在相場より高い：下落局面では楽観的な試算になる可能性。平均への回帰・返却時売価の保証なし');
    warnings.push('PSA10は国内日次観測平均／非10は現在の国内PSA9価格で仮置き。実成約平均・買取平均ではない');
    const expectedSale = reasons.length ? null : (view.assumedRate * observed.mean + (1-view.assumedRate)*view.lowerGradePrice)*(1-feeRate/100)-extra;
    return {expectedSale:finite(expectedSale) ? expectedSale : null,observed:{...observed,age},warnings,reasons};
  }
  function buybackObservationEconomics(summary,card,view,days,settings,now=Date.now()) {
    const reasons=[],warnings=[],median=xs=>{const s=xs.slice().sort((a,b)=>a-b),n=s.length;return n?s[Math.floor(n/2)]/2+s[Math.floor((n-1)/2)]/2:null;};
    if(!summary)reasons.push('機能データ未生成・買取平均要約未取得');
    const shops=[],unavailable={unacquired:0,held:0,expired:0,days:0,unusable:0};
    const selected=id=>!(settings.mode==='selected' && !settings.selected.includes(id) || settings.mode==='mail' && summary?.shops?.[id]?.fulfilment==='store');
    for(const [id,row] of Object.entries(summary?.cards?.[card.id]||{})) {
      const meta=summary.shops?.[id], quote=card.buybackAnalysis?.rows?.find(r=>r.shopId===id);
      if(settings.mode==='selected' && !settings.selected.includes(id) || settings.mode==='mail' && meta?.fulfilment==='store')continue;
      const [mean,count,at]=row.periods?.[days]||[],age=(now-Date.parse(at))/3600000;
      if(row.identity!==card.identityKey || quote?.quarantined) {unavailable.held++;continue;}
      if(quote?.stale || age>48) {unavailable.expired++;continue;}
      if(!finite(mean) || mean<=0 || !Number.isInteger(count) || count<1 || count>days) {unavailable.days++;continue;}
      if(!quote?.valid || quote.campaign || quote.temporaryCampaign || !(age>=0 && age<=48)) {unavailable.unusable++;continue;}
      shops.push({id,mean,count,at,travel:meta?.fulfilment==='store'?settings.travel:0});
    }
    for(const quote of card.buybackAnalysis?.rows || []) {
      if(!selected(quote.shopId) || summary?.cards?.[card.id]?.[quote.shopId])continue;
      if(quote.quarantined || quote.identityHeld || /仕様|照合|取り違え/.test(quote.reason || ''))unavailable.held++;
      else if(summary?.captureHolds?.[card.id]?.[quote.shopId] || summary?.historyIdentityHolds?.[card.id]?.[quote.shopId])unavailable.held++;
      else unavailable.unacquired++;
    }
    if(shops.length<2) {
      const cause=unavailable.held?'照合保留':unavailable.expired?'期限切れ':unavailable.days?'観測日数不足':shops.length?'利用可能店舗不足':'未取得';
      reasons.push('買取平均：'+cause,'買取出口不足・同仕様の新鮮な平均が2店舗未満');
    }
    const material=[view.assumedRate,view.lowerGradePrice,settings.feeRate,settings.extra,settings.deduction,settings.travel];
    if(!material.every(finite)||view.assumedRate<0||view.assumedRate>1||view.lowerGradePrice<=0||settings.feeRate<0||settings.feeRate>=100||settings.extra<0||settings.travel<0||settings.deduction<0||settings.deduction>5)reasons.push('想定10率・PSA9現在価格・費用未取得');
    const mean=median(shops.map(s=>s.mean)),travel=median(shops.map(s=>s.travel)),count=shops.length?Math.min(...shops.map(s=>s.count)):null;
    const latest=shops.length?shops.map(s=>s.at).sort()[0]:null;
    const observed={days,mean,count,latest:latest?new Date(Date.parse(latest)+9*3600000).toISOString().slice(0,10):null,unverifiedDays:0,reference:count!==days,stores:shops.map(s=>s.id),source:'買取店舗別観測平均の中央値'};
    if(observed.reference)warnings.push(`参考・買取平均の観測不足 ${count??0}/${days}日（店舗別最少・欠測補完なし）`);
    const current=median(shops.map(s=>card.buybackAnalysis.rows.find(r=>r.shopId===s.id)?.buybackPrice).filter(finite));
    if(finite(current)&&mean>current)warnings.push('買取平均が現在の買取価格より高い：下落局面では楽観的な試算になる可能性。平均回帰の保証なし');
    warnings.push('PSA10は選択した買取店舗の観測平均／非10は現在国内PSA9のフリマ手取りで仮置き。PSA8以下未評価');
    const p10Net=mean*(1-settings.deduction/100)-settings.extra-travel;
    const lowerNet=view.lowerGradePrice*(1-settings.feeRate/100)-settings.extra;
    const expectedSale=reasons.length?null:view.assumedRate*p10Net+(1-view.assumedRate)*lowerNet;
    return {expectedSale:finite(expectedSale)?expectedSale:null,travelCost:travel||0,expiresAt:shops.length?Math.min(...shops.map(s=>Date.parse(s.at)+48*3600000)):Infinity,observed,reasons,warnings,unavailable,exitLabel:'買取店（店舗別平均の中央値）'};
  }
  function meanEfficiencyEconomics(summary,buybackSummary,card,view,days,policy,settings,now=Date.now()) {
    const market=policy==='buyback'?null:observationEconomics(summary,card,view,days,'marketplace',settings.feeRate,settings.extra,now);
    const store=policy==='marketplace'?null:buybackObservationEconomics(buybackSummary,card,view,days,settings,now);
    if(policy==='marketplace')return {...market,travelCost:0,exitLabel:'フリマ（日次相場観測平均）'};
    if(policy==='buyback')return store;
    const reasons=[...market.reasons,...store.reasons];
    const chosen=reasons.length?store:market.expectedSale<=store.expectedSale?market:store;
    return {...chosen,expectedSale:reasons.length?null:chosen.expectedSale,travelCost:chosen===store?store.travelCost:0,
      exitLabel:reasons.length?'両出口・根拠不足（自動切替なし）':`${chosen===store?'買取店':'フリマ'}（両出口平均の保守側）`,
      expiresAt:store.expiresAt,reasons,warnings:[...market.warnings,...store.warnings],observed:{...chosen.observed,reference:market.observed.reference||store.observed.reference,
        exitObservations:{marketplace:market.observed,buyback:store.observed}}};
  }
  function periodEfficiencyAverage(rows) {
    const adopted=rows.filter(row=>finite(row.annual));
    return {annual:adopted.length ? adopted.reduce((sum,row)=>sum+row.annual,0)/adopted.length : null,
      adopted:adopted.length,total:rows.length,reference:adopted.some(row=>row.calculationState==='reference'||row.observation?.reference)};
  }
  function efficiencyUnavailableLabel(row) {
    const reason=String(row?.reason || row?.reasons?.join(' / ') || '');
    if(/仕様不一致|仕様確認|仕様保留|誤紐付け|価格対立/.test(reason))return '仕様・価格確認待ち';
    if(/採用根拠が1元以下|独立店舗/.test(reason))return '中央値の独立根拠不足';
    if(/中央値/.test(reason))return /店舗|根拠/.test(reason)?'中央値の独立根拠不足':'中央値不足・古値';
    if(row?.purchasePrice==null && /^(未取得|取得停止|期限超過・再確認待ち)$/.test(reason))return reason==='未取得'?'買値不足':reason==='取得停止'?'購入価格の取得停止':'購入価格の期限切れ';
    if(/購入価格|買値|在庫/.test(reason))return /期限|古い/.test(reason)?'購入価格の期限切れ':/在庫/.test(reason)?'在庫なし':'買値不足';
    const meanCause=reason.match(/買取平均：(未取得|照合保留|期限切れ|観測日数不足|利用可能店舗不足)/)?.[1];
    if(meanCause)return '買取平均・'+meanCause;
    if(/買取平均|買取出口不足・同仕様の新鮮な平均/.test(reason))return '買取平均不足';
    if(/観測平均|平均未取得|日次相場/.test(reason))return /古い|期限/.test(reason)?'PSA10平均の古値':'PSA10平均不足';
    if(/PSA9/.test(reason))return 'PSA9価格・根拠不足';
    if(/取得率|想定10率/.test(reason))return '取得率不足';
    if(/買取|出口/.test(reason))return '買取出口不足';
    if(/期間不一致|予測期間/.test(reason))return '予測期間不一致';
    if(/読込|読み込|版不一致/.test(reason))return '要約読込・版不一致';
    return '計算材料不足';
  }
  function buybackSupport(summary, id, mode, selected = [], now = Date.now(), currentMarket = null, identityKey = null) {
    const median = values => { const a = values.slice().sort((x,y)=>x-y); return a.length ? (a[Math.floor(a.length/2)] + a[Math.floor((a.length-1)/2)])/2 : null; };
    const support = summary?.support, entries = support?.cards?.[id] || {}, rows = [], daily = new Map();
    const fresh = at => Number.isFinite(Date.parse(at)) && Date.parse(at) <= now && now - Date.parse(at) <= 48 * 3600000;
    for (const [shop, row] of Object.entries(entries)) {
      const meta = support.shops?.[shop];
      if (!meta || mode === 'selected' && !selected.includes(shop) || mode === 'mail' && meta.fulfilment === 'store') continue;
      const identityValid=!identityKey || summary.cards?.[id]?.[shop]?.identity === identityKey;
      const permissionHeld=['pending','retired'].includes(meta.permission);
      const [ratio,price,marketPrice,at,marketAt,date] = row.current;
      const policy=support.timingPolicy, skew=Math.abs(Date.parse(at)-Date.parse(marketAt))/3600000;
      const timingValid=!policy || row.current[7] === date && /T\d{2}:/.test(at || '') && /T\d{2}:/.test(marketAt || '') && skew <= policy.maxSkewHours;
      const valid = identityValid && !permissionHeld && !meta.stopped && row.current[6] !== false && fresh(at) && fresh(marketAt) && timingValid && finite(price) && price>0 && finite(ratio) && ratio > 0 && finite(currentMarket) && currentMarket === marketPrice;
      const b = row.baseline || [], g = row.glance || [], standard = b[0] ?? g[0], premium = finite(standard) && standard > 0 ? (ratio / standard - 1) * 100 : null;
      rows.push({shop,merchant:meta.merchantId || shop,name:meta.name,fulfilment:meta.fulfilment,ratio,price,marketPrice,at,marketAt,date,priceDate:row.current[7] ?? null,timeSkewHours:skew,valid,
        standard,premium,samples:b[1] ?? g[1] ?? 0,excluded:b[3] || 0,cohort:b[5],band:b[6],reference:b[7] ?? g[2] ?? true,topPct:b[8] ?? g[3] ?? null,periods:row.periods,premiumPeriods:row.premium,
        reason:valid ? null : !identityValid ? 'カード仕様不一致・照合保留' : permissionHeld ? '取得・公開利用保留' : meta.stopped ? '取得元停止中・参考履歴のみ' : row.current[6] === false ? '現在の掲載・価格・提示日未確認（履歴のみ）' : !finite(price) || price<=0 ? '有効な買取提示未取得' : !finite(currentMarket) ? '現在の国内PSA10相場未取得・履歴のみ' : !fresh(at) || !fresh(marketAt) ? '買取/国内相場の確認が48時間外・参考履歴のみ' : !timingValid ? '提示日未確認・相場との確認時差超過（過去時点の参考）' : '国内PSA10現在価格と観測値不一致・再確認待ち'});
      if(!identityValid || permissionHeld)continue;
      for (const [day,rate] of row.days || []) {
        if (!finite(rate)) continue;
        if (!daily.has(day)) daily.set(day,new Map());
        const values = daily.get(day), merchant = meta.merchantId || shop;
        values.set(merchant, values.has(merchant) ? Math.min(values.get(merchant),rate) : rate);
      }
    }
    const current = new Map();
    for (const row of rows.filter(r=>r.valid)) if (!current.has(row.merchant) || row.ratio < current.get(row.merchant).ratio) current.set(row.merchant,row);
    const currentRows = [...current.values()], rates = currentRows.map(r=>r.ratio), latest = currentRows.map(r=>r.at).sort().at(-1) || null;
    const highestQuote = rows.filter(r=>r.valid).sort((a,b)=>b.ratio-a.ratio || b.at.localeCompare(a.at) || a.shop.localeCompare(b.shop))[0] || null;
    // Demand display only: each physical merchant contributes its best eligible
    // selected channel once. Keep the existing conservative median/score untouched.
    const merchantOffers=new Map();
    for(const row of rows.filter(r=>r.valid).sort((a,b)=>b.ratio-a.ratio || b.at.localeCompare(a.at) || a.shop.localeCompare(b.shop)))
      if(!merchantOffers.has(row.merchant))merchantOffers.set(row.merchant,row);
    const meanOffers=[...merchantOffers.values()];
    const mean=meanOffers.length?meanOffers.reduce((sum,row)=>sum+row.ratio,0)/meanOffers.length:null;
    const asOf = new Date(now+9*3600000).toISOString().slice(0,10), windows = {};
    for (const days of [7,30]) {
      const adopted = [...daily].filter(([date])=>date<=asOf && Date.parse(date)>=Date.parse(asOf)-(days-1)*86400000).sort((a,b)=>a[0].localeCompare(b[0]));
      const medians = adopted.map(([,values])=>median([...values.values()])), merchants = new Set(adopted.flatMap(([,v])=>[...v.keys()]));
      windows[days] = {mean:medians.length?medians.reduce((s,r)=>s+r,0)/medians.length:null,median:median(medians),days:medians.length,
        aboveDays:medians.filter(r=>r>=1).length,aboveRate:medians.length?medians.filter(r=>r>=1).length/medians.length*100:null,
        stores:merchants.size,lastDate:adopted.at(-1)?.[0]||null,reference:medians.length!==days};
    }
    return {rows,median:median(rates),max:rates.length?Math.max(...rates):null,highestQuote,
      mean,meanCount:meanOffers.length,meanReference:meanOffers.length===1,meanShops:meanOffers.map(r=>r.shop),
      meanRule:'選択中の同一店は有効な最高提示1件。対象カードの店舗間単純平均。減額・費用なし',
      above:rates.filter(r=>r>=1).length,count:rates.length,latest,windows,
      multiStoreSupport:rates.filter(r=>r>=1).length>=2,
      note:'減額・手数料等を含まない参考支持。掲載は実買取件数ではなく上昇/GOの保証なし。同一店舗は1店、複数受付がある場合は保守側1提示'};
  }
  function tradeDemand(summary,id,days,now=Date.now()) {
    const data=summary?.tradeDemand,row=data?.cards?.[id], at=data?.times?.[row?.[days===75?7:days===200?8:2]] || null;
    const n=days===75&&!data?.periods?.includes(75)?null:row?.[{7:0,30:1,75:5,200:6}[days]];
    const measured=Number.isInteger(n)&&n>=0, pop=days===7?row?.[3]:days===30?row?.[4]:null;
    const stale=at?now-Date.parse(at)>48*3600000:false;
    return {count:measured?n:null,daily:measured?n/days:null,at,stale,
      kind:days<=30?'取得元の国内PSA10集計':'国内PSA10個別実成約（範囲確認済み）',
      status:!measured?days<=30?'取得根拠未確認':'履歴不足・総数算出不可':stale?'古い集計・参考値':'取得済み・参考',
      source:data?.sourceUrl || null,pop:pop?{delta:pop[0],start:data.times[pop[1]],end:data.times[pop[2]],span:pop[3],
        status:pop[4]===0?'近い期間の参考比較':pop[4]===2?'POP減少・訂正等':'期間不一致・部分期間',
        ratio:measured&&!stale&&pop[4]===0&&pop[0]>0?n/pop[0]:null}:null};
  }
  return {percent,inRange,offerPrice,referenceMedian,meanSale,atPurchase,efficiency,coverage,observationPeriods,migrateObservationSettings,observation,observationExclusions,observationEconomics,buybackObservationEconomics,meanEfficiencyEconomics,periodEfficiencyAverage,efficiencyUnavailableLabel,buybackSupport,tradeDemand};
});
