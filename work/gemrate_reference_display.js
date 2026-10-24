// Display-only projection. This module never supplies an assumed rate, POP delta, or search input.
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function reference(card, row, {audience='public', now=Date.now(), staleAfterHours=168}={}) {
  const unavailable=reason=>({available:false,reason});
  if (!row) return unavailable('GemRate未対応・既存取得元を表示');
  // No public permit is assumed by a boolean in an imported file. Public integration remains disabled.
  if (audience!=='private-preview') return unavailable('GemRate公開利用条件未確認');
  if (row.source!=='GemRate'||row.grader!=='PSA'||row.cardId!==card.id||row.identityKey!==card.identityKey
    ||card.identityReviewRequired||row.hold||row.quarantined||!row.specEvidence||!row.contextProof||!row.csvSha256)
    return unavailable('GemRate仕様・根拠確認待ち');
  let specification;
  try { specification=JSON.parse(row.identity); } catch {return unavailable('GemRate仕様根拠不足');}
  if (specification[0]!=='Japanese') return unavailable('GemRate言語不一致');
  const day=row.sourceUpdatedDate,at=Date.parse(day+'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day||'')||!Number.isFinite(at)||new Date(at).toISOString().slice(0,10)!==day||at>now)
    return unavailable('GemRate基準日未確認');
  if (!Number.isSafeInteger(row.psa10)||!Number.isSafeInteger(row.total)||row.total<=0||row.psa10<0||row.psa10>row.total)
    return unavailable('GemRate枚数確認待ち');
  return {available:true,label:'PSA10率（GemRate集計）',rate:100*row.psa10/row.total,
    psa10:row.psa10,total:row.total,date:day,precision:'day',reference:true,
    stale:now-at>staleAfterHours*3600000,sourceUrl:row.pageUrl,
    notice:'参考表示・計算採用率とは別。基準日はGemRate更新日、PSA公式の直接確認日時ではありません。'};
}
function render(card,row,options={}) {
  const v=reference(card,row,options),official=card.official;
  const percent=n=>Number.isFinite(n)?n.toFixed(1)+'%':'未取得';
  const counts=official&&Number.isInteger(official.ten)&&Number.isInteger(official.total)
    ?`PSA10 ${official.ten.toLocaleString('ja-JP')}／TOTAL ${official.total.toLocaleString('ja-JP')}枚`:'母数未取得';
  const chosen=card.buyLimits?.clean?.assumptions;
  return `<div class="grade-rate-summary" data-gemrate-reference="${v.available?'private-preview':'not-switched'}">
    <div><span>${v.available?v.label:'PSA10公式取得率（保存値）'}</span>
    <strong>${percent(v.available?v.rate:official?.rate)}</strong>
    <small>${v.available?`基準日 ${escape(v.date)}／PSA10 ${v.psa10.toLocaleString('ja-JP')}／TOTAL ${v.total.toLocaleString('ja-JP')}枚`:escape(counts+'／確認 '+(official?.f||'未取得'))}</small>
    <small class="warning">${v.available?`${v.stale?'古値・':''}参考／計算採用へ未反映`:escape(v.reason)}</small>
    ${v.available?`<details><summary>旧公式値・取得根拠</summary><p>${escape(v.notice)}</p><p>旧公式 ${percent(official?.rate)}／${escape(counts)}／確認 ${escape(official?.f||'未取得')}</p><a href="${escape(v.sourceUrl)}" rel="noreferrer">GemRate元ページ</a></details>`:''}</div>
    <div><span>計算に採用した想定10率</span><strong>${percent(Number.isFinite(chosen?.hitRate)?100*chosen.hitRate:null)}</strong><small>${escape(chosen?.hitRateSource||'未取得')}／既存計算を保持</small></div></div>`;
}
module.exports={reference,render};
