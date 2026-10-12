(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ExplorationMetrics = api;
})(typeof window === 'object' ? window : globalThis, function() {
  const finite = n => typeof n === 'number' && Number.isFinite(n);
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
  const observationPeriods = [7,30,90,200];
  function observation(summary, id, current, days) {
    const indices = {7:[0,1,7],30:[2,3,4],90:[5,6,8],200:[9,10,11]}[days];
    const row = summary?.cards?.[id];
    const [mean,count,age] = indices ? indices.map(i=>row?.[i]) : [];
    const valid = finite(mean) && mean > 0 && Number.isInteger(count) && count > 0 && count <= days;
    const required = summary?.minimumObservationDays?.[days] ?? days;
    const reference = !valid || count < required || days === 200 && row?.[12] > 0;
    const latest = finite(age) && age >= 0 && Number.isFinite(Date.parse(summary?.asOf))
      ? new Date(Date.parse(summary.asOf+'T00:00:00Z')-age*86400000).toISOString().slice(0,10) : null;
    return {days,mean:valid ? mean : null,count:valid ? count : null,age:finite(age) ? age : null,
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
  return {percent,inRange,offerPrice,meanSale,atPurchase,efficiency,coverage,observationPeriods,observation,observationExclusions};
});
