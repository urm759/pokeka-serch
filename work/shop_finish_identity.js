// Surface treatments sharing a printed number are separate products. A generic
// ball/type mirror is not silently promoted to a named Monster/Master variant.
const pattern=/(?:マスターボール|モンスターボール|ボール|タイプ)?ミラー(?:仕様)?(?=$|[\s:：\]】\[［()（）,・])/g;
function mirror(text) {
  const values=[...String(text||'').normalize('NFKC').matchAll(pattern)].map(m=>m[0].replace(/仕様$/,''));
  return [...new Set(values)].sort().join('+') || '通常';
}
function reason(card,title) {
  const aliases={'mirror':'ミラー','master-ball-mirror':'マスターボールミラー','monster-ball-mirror':'モンスターボールミラー'};
  const expected=mirror((card?.name||'')+' '+(aliases[card?.variant]||card?.variant||'')),actual=mirror(title);
  return expected===actual?null:`${actual==='通常'?'加工根拠不足':'加工不一致'}・対象${expected}/商品${actual}（同番号でも代用不可）`;
}
function strip(text) {return String(text||'').replace(pattern,'');}
module.exports={mirror,reason,strip};
