(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PurchaseRatioModel = api;
})(typeof window === "object" ? window : globalThis, function () {
  const number = (v) => v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
  function evaluate(input = {}) {
    const price = number(input.purchasePrice), psa9 = number(input.psa9?.value);
    const kind = input.psa9?.measurementType || "missing";
    const age = input.psa9?.updatedAt && input.asOf ? (Date.parse(input.asOf) - Date.parse(input.psa9.updatedAt)) / 86400000 : null;
    const reference = input.purchaseKind === "market" || kind !== "actual";
    const reasons = [];
    if (!["actual", "aggregate", "estimate"].includes(kind)) reasons.push("国内PSA9の価格種別未確認");
    if (price == null || price < 0) reasons.push("仕入れ値未取得");
    if (psa9 == null || psa9 <= 0) reasons.push("国内PSA9未取得");
    if (input.conflicted || input.identityMismatch) reasons.push("価格対立・仕様確認待ち");
    if (input.psa9?.currency && input.psa9.currency !== "JPY" || input.psa9?.country && input.psa9.country !== "jp") reasons.push("国内円建てではない");
    if (kind === "actual" && !(input.psa9?.country === "jp" && input.psa9.currency === "JPY" && input.psa9.identityConfirmed === true)) reasons.push("国内実成約・同一仕様の根拠不足");
    if (age != null && (!Number.isFinite(age) || age < 0 || age > 30)) reasons.push("国内PSA9の価格更新が古い");
    if (kind === "actual" && (!input.psa9.updatedAt || Number(input.psa9.count || 0) < 3)) reasons.push("実成約の日時・件数不足");
    const rawRatio = reasons.length ? null : price / psa9 * 100;
    const ratio = Number.isFinite(rawRatio) ? rawRatio : null;
    const fee = number(input.fee), rate = number(input.saleFeeRate), extra = number(input.extraCost);
    const rawCap = ratio == null || fee == null || fee < 0 || rate == null || rate < 0 || rate >= 100 || extra == null || extra < 0 ? null
      : psa9 * (1 - rate / 100) - extra - fee;
    const nonLossCap = Number.isFinite(rawCap) ? rawCap : null;
    const circularEstimate = kind === "estimate" && (input.psa9?.derivedFromRaw === true || /美品|素体|raw|75%/i.test(input.psa9?.source || ""));
    return { ratio, purchasePrice: price, purchaseKind: input.purchaseKind || "market", psa9Price: psa9,
      measurementType: kind, reference, updatedAt: input.psa9?.updatedAt || null, count: input.psa9?.count ?? null,
      nonLossCap, nonLossStatus: nonLossCap == null ? "unavailable" : nonLossCap < 0 ? "impossible" : nonLossCap === 0 ? "zero" : "available",
      circularEstimate, reasons, note: reference ? "参考比率（集計・推定または相場買値）" : "実買値／国内PSA9実成約" };
  }
  function eligibility(row, options = {}) {
    if (row?.ratio == null || !Number.isFinite(row.ratio)) return "data-missing";
    if (row.circularEstimate) return "circular-estimate";
    const flags = typeof options === "boolean" ? { aggregate:options, estimate:options, market:options } : options;
    if (row.measurementType === "aggregate" && !flags.aggregate || row.measurementType === "estimate" && !flags.estimate || row.purchaseKind === "market" && !flags.market) return "reference-disabled";
    return "eligible";
  }
  function matches(row, min, max, options = {}) {
    min = number(min); max = number(max);
    if (min == null && max == null) return true;
    return eligibility(row, options) === "eligible"
      && (min == null || row.ratio >= min) && (max == null || row.ratio <= max);
  }
  function roiOnly(settings) { return { ...settings, minExpectedProfit: 0 }; }
  function capLabel(row, format = String) {
    if (!Number.isFinite(row?.nonLossCap) || row.nonLossStatus === "unavailable") return "算出不可";
    if (row.nonLossStatus === "impossible") return "赤字回避できる仕入れ値なし";
    return `¥${format(Math.floor(row.nonLossCap))}${row.nonLossStatus === "zero" ? "（0円仕入れで損益0円）" : ""}`;
  }
  function atGuide(input = {}) {
    const guide = number(input.guide?.cap), fee = number(input.fee), extra = number(input.extraCost);
    const source = evaluate({purchasePrice:guide,purchaseKind:'guide',psa9:input.psa9,asOf:input.asOf,
      fee:input.fee,saleFeeRate:input.saleFeeRate,extraCost:input.extraCost});
    const sourceReasons = source.reasons.filter(reason=>reason!=='仕入れ値未取得');
    if(!Number.isFinite(Date.parse(source.updatedAt)) || !Number.isFinite(Date.parse(input.asOf))) sourceReasons.push('国内PSA9の確認日時未取得');
    const reasons = [...sourceReasons];
    if (guide == null || guide <= 0 || input.guide?.eligible !== true || input.guide?.capState !== 'available') reasons.push('仕入れ目安が0円以下・未取得');
    const comparable = reasons.length === 0;
    const priceRatio = comparable ? source.psa9Price / guide * 100 : null;
    const searchStatus = comparable ? eligibility(source,input.referenceOptions) : 'data-missing';
    const profitReasons = [...reasons];
    if (fee == null || fee < 0 || extra == null || extra < 0) profitReasons.push('費用設定未取得');
    if (input.planProblem) profitReasons.push(input.planProblem);
    const repair = input.repairRequired ? number(input.repairCost) : 0;
    if (repair == null || repair < 0) profitReasons.push('リペア費用未入力');
    const policy = input.exitPolicy || 'buyback', rate = number(input.saleFeeRate);
    const market = source.psa9Price > 0 && rate != null && rate >= 0 && rate < 100
      ? {price:source.psa9Price,sellingFee:source.psa9Price*rate/100,deduction:0,travel:0,label:'フリマ（国内PSA9）'} : null;
    // Only an explicit, verified PSA9 exit can supply a buyback value. PSA10
    // offers and grade-unknown prices must never be reused here.
    const b=input.psa9Buyback, gross=number(b?.price), cut=number(b?.deductionRate), travel=number(b?.travelCost);
    const quoteAge=(Date.parse(input.asOf)-Date.parse(b?.observedAt))/3600000;
    const buyback = b?.grade==='PSA9' && b.identityConfirmed===true && b.fresh===true && !b.quarantined
      && b.country==='jp' && b.currency==='JPY' && quoteAge>=0 && quoteAge<=48 && gross>0
      && cut!=null && cut>=0 && cut<100 && travel!=null && travel>=0
      ? {price:gross,sellingFee:0,deduction:gross*cut/100,travel,label:b.label || '買取店（PSA9）'} : null;
    if (policy!=='marketplace' && !buyback) profitReasons.push('PSA9買取価格未取得');
    if (policy!=='buyback' && !market) profitReasons.push('PSA9フリマ価格・手数料未取得');
    if (!['marketplace','buyback','both'].includes(policy)) profitReasons.push('PSA9売却先未確認');
    let exit=policy==='marketplace'?market:buyback;
    if(policy==='both'&&market&&buyback){
      const net=x=>x.price-x.sellingFee-x.deduction-x.travel;
      exit=net(market)<net(buyback)?market:buyback;
    }
    const investment=profitReasons.length||!exit?null:guide+fee+extra+repair+exit.travel;
    const profit=investment>0?exit.price-exit.sellingFee-exit.deduction-investment:null;
    const roi=profit==null?null:profit/investment*100;
    return {guide,price:source.psa9Price,priceRatio,comparable,searchStatus,reference:source.reference,
      measurementType:source.measurementType,updatedAt:source.updatedAt,source:input.psa9?.source || '取得元未確認',
      sourceReasons,comparisonReasons:[...new Set(reasons)],
      investment,profit,roi,exitLabel:exit?.label || (policy==='both'?'両出口（PSA9）':policy==='buyback'?'買取店（PSA9）':'フリマ（国内PSA9）'),
      fee,extraCost:extra,repairCost:repair,sellingFee:exit?.sellingFee ?? null,deduction:exit?.deduction ?? null,
      travelCost:exit?.travel ?? null,salePrice:exit?.price ?? null,profitReasons:[...new Set(profitReasons)],
      noGoEffect:true};
  }
  function guideExclusion(view,{above=false,min=null}={}) {
    if(!above&&min==null)return null;
    if(min!=null&&(!Number.isFinite(min)||min<0))return 'PSA9価格／仕入れ目安・下限入力を確認';
    if(!view.comparable)return 'PSA9価格／仕入れ目安・'+(view.comparisonReasons[0]||'算出不可');
    if(view.searchStatus==='circular-estimate')return 'PSA9価格／仕入れ目安・素体由来の循環推定';
    if(view.searchStatus!=='eligible')return 'PSA9価格／仕入れ目安・参考値の検索採用OFF';
    if(above&&!(view.price>view.guide))return 'PSA9価格が仕入れ目安以下';
    if(min!=null&&view.priceRatio<min)return 'PSA9価格／仕入れ目安・下限未達';
    return null;
  }
  return { evaluate, matches, eligibility, capLabel, roiOnly, atGuide, guideExclusion };
});
