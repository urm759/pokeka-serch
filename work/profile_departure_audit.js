const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const unique = values => [...new Set(values)];
function inspect(before, after, context = {}) {
  const reasons = after?.exclusions || [], previous = before?.exclusions || [];
  const failures = unique([...reasons, ...(after?.efficiency?.blockingReasons || []), ...(after?.psa9?.reasons || []),
    ...(after?.dataQuality?.manualReviewReasons||[]),...(after?.dataQuality?.dataShortageReasons||[])]);
  const roots = [], derived = [];
  const add = (code, evidence) => { if (!roots.some(r=>r.code===code)) roots.push({code,evidence}); };
  const has = pattern => failures.some(r=>pattern.test(r));
  const comparable = Boolean(before && after && context.before?.settingsHash && context.after?.settingsHash && context.before?.codeHash && context.after?.codeHash
    && (context.before.fingerprintVersion??0)===(context.after.fingerprintVersion??0));
  const settingsChanged = comparable && context.before.settingsHash !== context.after.settingsHash;
  const codeChanged = comparable && context.before.codeHash !== context.after.codeHash;
  if (settingsChanged) add('search-settings-changed','保存された実効設定hashが変化。価格変化と混同しない');
  if (codeChanged) add('calculation-or-aggregation-changed','計算・集計コードhashが変化。原因確定には同一入力再現が必要');
  const review = after?.priceReview || {};
  const specification = after?.specificationHeld || review.specificationHeld
    || (after?.dataQuality?.manualReviewReasons||[]).some(r=>/誤紐|仕様不一致|仕様保留|言語不一致|カード違い|型番違い/.test(r));
  const conflict = review.conflicted || review.integrityDisputed || (after?.dataQuality?.manualReviewReasons||[]).some(r=>/新鮮.*対立|買取価格.*対立/.test(r));
  if (specification) add('identity-or-specification-hold','仕様保留・同定根拠を確認するまで自動確定しない');
  if (conflict) add('price-conflict-or-evidence-hold','最新比較の対立または実売根拠の未解決保留');
  if (has(/取得失敗|HTTP\s*(?:403|429|5\d\d)|アクセス停止|認証待ち/)) add('acquisition-failure','取得失敗・停止の保存理由');
  const purchase = after?.purchase;
  const quotes = Object.values(after?.sourceQuotes || {});
  const evaluatedAt=Date.parse(context.after?.at||'');
  const quoteFresh=(quote,at)=>['priceObservedAt','inventoryObservedAt'].every(key=>{
    const time=Date.parse(quote?.[key]||'');return Number.isFinite(time)&&time<=at&&at-time<=48*3600000;
  });
  // A valid, dearer fallback must not conceal expiry of the previously adopted offer.
  const prior=before?.purchase;
  const priorSources=Object.entries(before?.sourceQuotes||{}).filter(([,quote])=>prior?.fresh===true&&Number.isFinite(prior.price)
    &&quote.price===prior.price&&quote.priceObservedAt===prior.priceObservedAt&&quote.inventoryObservedAt===prior.inventoryObservedAt);
  const priorSource=priorSources.length===1?priorSources[0][0]:null;
  const priorQuote=priorSource&&after?.sourceQuotes?.[priorSource];
  const previousOfferExpired=Boolean(priorQuote&&quoteFresh(prior,Date.parse(context.before?.at||''))
    &&!quoteFresh(priorQuote,evaluatedAt)&&['priceObservedAt','inventoryObservedAt'].some(key=>{
      const time=Date.parse(priorQuote[key]||'');return Number.isFinite(time)&&evaluatedAt-time>48*3600000;
    }));
  if(previousOfferExpired)add('expired-price','前回採用した店舗価格が期限切れ。別店舗の新鮮な高値による採算不合格と併記');
  const freshStock=quotes.filter(r=>{const at=Date.parse(r.inventoryObservedAt||'');return Number.isFinite(at)&&at<=evaluatedAt&&evaluatedAt-at<=48*3600000;});
  if (purchase?.available === false && purchase.fresh === true || !purchase && freshStock.length && freshStock.every(r=>r.available===false || r.stock===0))
    add('out-of-stock','個別在庫記録。価格不足・期限切れとは別');
  if (purchase?.fresh === false || has(/期限超過|期限切れ|古値|古い|鮮度|再確認待ち/)) add('expired-price','価格採用期限・個別確認日時を確認。6時間目標超過とは別');
  const expiryQuotes=previousOfferExpired?[priorQuote]:quotes.filter(quote=>!quoteFresh(quote,evaluatedAt));
  if(roots.some(r=>r.code==='expired-price')&&expiryQuotes.some(r=>/HTTP|認証|アクセス|取得失敗|停止|error|fail|timeout|timed out|形式/i.test(r.sourceFailure||'')))
    add('acquisition-failure','期限切れ側の取得元に失敗・停止記録あり。他店舗の停止や正常な時間予算繰越と区別');
  if (has(/未取得|データ不足|日時不明|日時不足|未確認|出口不足|価格なし|中央値.*不足/) || after?.medianEvidence?.reasons?.length) add('missing-data','未取得・確認日時・出口等の不足。不存在とは断定しない');
  if (!specification && !conflict && !has(/期限超過|期限切れ|古値|古い|未取得|データ不足|算出不可/) && reasons.some(r=>/価格範囲|利益|効率|比率|資金|需要|供給/.test(r)))
    add('profitability-or-assessment-condition','現在の条件不合格。市場下落が原因かどうかは前後入力を別比較');
  if (has(/期間不一致|返却時試算不可/)) add('forecast-period-hold','返却期間と検証済み予測期間が不一致');
  if (review.manualReview && !specification && !conflict && (!(after?.dataQuality?.manualReviewReasons||[]).length
    || after.dataQuality.manualReviewReasons.some(r=>!/古値だけ|信頼できる.*0件/.test(r))))
    add('unresolved-review','確認待ちの根拠不足。未知の不具合を自動修正しない');
  if(!roots.length&&reasons.some(r=>/プリセット|見送り非表示/.test(r)))
    add('preset-or-verdict-condition','最終判定・プリセット条件の不合格。採算悪化や価格下落が原因とは未確定');
  const blockedBy = roots.filter(r=>['identity-or-specification-hold','price-conflict-or-evidence-hold','expired-price','missing-data','acquisition-failure',
    'out-of-stock','forecast-period-hold','unresolved-review'].includes(r.code)).map(r=>r.code);
  for (const reason of failures) if (blockedBy.length && (/算出不可|プリセット/.test(reason)
    || /比率/.test(reason)&&!Number.isFinite(after?.psa9?.ratio)
    || /効率/.test(reason)&&!Number.isFinite(after?.efficiency?.annual)))
    derived.push({reason,blockedBy:[...blockedBy],causality:'根拠ゲートによる派生候補。複数根拠は併記し、単一原因と断定しない'});
  const newFailures = reasons.filter(r=>!previous.includes(r));
  const oldReasons=[...previous,...(before?.efficiency?.blockingReasons||[])].join('／');
  for(const root of roots) {
    root.previouslyPresent=!before?null:root.code==='identity-or-specification-hold'?Boolean(before.specificationHeld)
      :root.code==='price-conflict-or-evidence-hold'?Boolean(before.priceReview?.conflicted||before.priceReview?.integrityDisputed)
      :root.code==='expired-price'?before.purchase?.fresh===false||/期限超過|期限切れ|古値|古い|再確認待ち/.test(oldReasons)
      :root.code==='missing-data'?/不足|未取得|日時|未確認/.test(oldReasons)||Boolean(before.medianEvidence?.reasons?.length)
      :root.code==='acquisition-failure'?Object.values(before.sourceQuotes||{}).some(r=>r.sourceFailure)
      :root.code==='out-of-stock'?before.purchase?.fresh===true&&before.purchase?.available===false
      :root.code==='profitability-or-assessment-condition'?/利益|効率|比率|資金|需要|供給|プリセット/.test(oldReasons)
      :null;
  }
  const inputKeys = ['referencePrice','psa10','psa9','sourceQuotes','buyback','inputs','assessment','forecastEvidence','identityKey'];
  const material = (facts,key) => key==='psa9' ? {price:facts.psa9?.price,updatedAt:facts.psa9?.updatedAt,measurementType:facts.psa9?.measurementType}
    : key==='buyback' ? (facts.buyback||[]).map(r=>({shopId:r.shopId,price:r.price,priceDate:r.priceDate,observedAt:r.observedAt})) : facts[key];
  const changedInputs = before && after ? inputKeys.filter(key=>!same(material(before,key),material(after,key))) : [];
  const temporalOnly = comparable && !settingsChanged && !codeChanged && !changedInputs.length
    && roots.some(r=>r.code==='expired-price') && before.purchase?.fresh===true && (after.purchase?.fresh!==true||previousOfferExpired);
  const status = !comparable ? '原因未確定・比較可能な前後記録不足'
    : temporalOnly ? '同一入力・設定・コードで時間経過による期限切れ'
    : settingsChanged || codeChanged ? '設定またはコード変更を含む・寄与の分離には再現比較が必要'
    : changedInputs.length ? '保存された入力差あり・実取得と根拠訂正は取得証拠で別確認'
    : '原因未確定・同一入力の評価変化を点検';
  const held = !after || specification || conflict || roots.some(r=>r.code==='unresolved-review');
  const fields = [];
  if (!held) {
    if (previousOfferExpired || purchase?.fresh===false || !purchase && !roots.some(r=>r.code==='out-of-stock')) fields.push('shopStateA');
    if (has(/中央値/) && has(/古値|古い|不足|未取得/) || after?.medianEvidence?.reasons?.length) fields.push('referenceMedian');
    if (has(/買取.*不足|買取出口/)) fields.push('buybackExitEvidence');
    if (has(/PSA9.*不足|PSA9.*日時|PSA9.*未取得/)) fields.push('psa9Evidence');
    if (has(/公式.*不足|Population.*未取得|PSA公式.*未取得/)) fields.push('psaOfficial');
  }
  return {status,comparable,temporalOnly,settingsChanged,codeChanged,changedInputs,roots,derived,
    newFailures,existingFailures:reasons.filter(r=>previous.includes(r)),directFailures:reasons.filter(r=>!derived.some(d=>d.reason===r)),
    repair:{fields:unique(fields),automaticReviewRelease:false,held,reason:!after?'最新カタログに対象なし・原履歴を保持':held?'根拠確認待ち。仕様・対立・アクセス停止を解除しない':'既存の取得元別キューへ。期限・間隔・再試行制限を維持'}};
}
function summarize(rows) {
  const byCause={},ids=new Set();
  for(const row of rows){ids.add(row.id);for(const root of row.departureAudit?.roots||[]) (byCause[root.code] ||= new Set()).add(row.id);}
  return {uniqueDeparted:ids.size,overlappingRootCounts:Object.fromEntries(Object.entries(byCause).map(([k,v])=>[k,v.size])),
    unconfirmedCauseIds:unique(rows.filter(r=>!r.departureAudit?.comparable).map(r=>r.id)),
    note:'現在の妨げの重複件数は合算不可。比較記録不足なら当時の離脱原因は未確定。派生理由を独立した離脱枚数へ加算しない'};
}
function metadata(profile, codeHash, at) {
  return {fingerprintVersion:1,settingsHash:hash({url:profile.urlHash,parameters:profile.parameters}),codeHash,at};
}
function codeHash(root) {
  const fs=require('node:fs'),path=require('node:path');
  return hash(['app.js','decision-model.js','price-integrity.js','current-market-model.js','exploration-metrics.js','work/profile_discovery_gates.js',
    'work/build_buyback_observation_summary.js',
    'work/build_psa10_period_statistics.js','work/reconcile_shop_observations.js']
    .map(f=>[f,fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n')]));
}
function independentCandidates(beforeGroups,afterGroups) {
  const before=new Set(beforeGroups.flat()),after=new Set(afterGroups.flat());
  return {before:before.size,after:after.size,net:after.size-before.size,
    gained:[...after].filter(id=>!before.has(id)),lost:[...before].filter(id=>!after.has(id)),
    note:'4条件の重複除外。条件間の移動は新しい独立候補ではない。適合変化と実取得の因果は別監査'};
}
function historySeeds(cycles) {
  const rows=new Map();
  for(const cycle of [...cycles].sort((a,b)=>String(a.recordedAt).localeCompare(String(b.recordedAt))))for(const p of cycle.profiles||[]) {
    for(const id of p.lost||[]) {
      const detail=p.lostReasons?.find(r=>r.id===id);
      rows.set(p.id+':'+id,{id,profile:p.id,before:detail?.before||null,beforeMeta:null,
        firstObservedAt:cycle.recordedAt||null,origin:'保存された離脱履歴。旧設定hash等がない場合は因果未確定'});
    }
    for(const id of p.gained||[])rows.delete(p.id+':'+id);
  }
  return [...rows.values()];
}
module.exports={inspect,summarize,metadata,hash,codeHash,independentCandidates,historySeeds};
