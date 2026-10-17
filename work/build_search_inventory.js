const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),model=require('../search-controls');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const attr=(s,k)=>s.match(new RegExp(`\\b${k}="([^"]*)"`))?.[1];
const plain=s=>s.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const heroEnd=html.indexOf('<section class="card site-introduction"');
const rows=[];
for(const m of html.matchAll(/<input\b([^>]*)>|<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
  const attrs=m[1]??m[2],id=attr(attrs,'id');if(!id)continue;
  const inSearch=m.index<heroEnd;
  const labelStart=html.lastIndexOf('<label',m.index),prefix=html.slice(labelStart,m.index);
  const options=[...(m[3]||'').matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map(x=>({value:attr(x[1],'value'),label:plain(x[2]),selected:/\bselected\b/.test(x[1])}));
  const type=m[1]!=null?attr(attrs,'type')||'text':'select';
  const initial=type==='checkbox'?/\bchecked\b/.test(attrs):type==='select'?(options.find(o=>o.selected)||options[0])?.value??'':attr(attrs,'value')??'';
  const fullLabel=html.slice(labelStart,html.indexOf('</label>',m.index)).replace(/<select\b[\s\S]*?<\/select>/g,'');
  rows.push({id,label:plain(prefix.match(/<span[^>]*>([\s\S]*?)<\/span>/)?.[1]||fullLabel).slice(0,140)||id,
    category:model.labels[model.category(id,inSearch)],initial,type,options,removable:model.removable(id,inSearch),
    modes:inSearch&&model.category(id)!=='audit'?[
      ['normal',{}],['combined',{}],['current-market（上限探索）',{currentMarketSearchKind:'cap'}],['current-market（購入採算）',{currentMarketSearchKind:'purchase'}],['current-market（上限買値）',{currentMarketSearchKind:'cap',profitSearchBasis:'current-cap'}],['snkr-raw',{}],['low-risk',{}]
    ].filter(([name,s])=>model.applicable(id,{purchaseMode:name.split('（')[0],catalogScope:'analysis',currentMarketSearchKind:'cap',profitSearchBasis:'auto',...s})).map(([name])=>name):[],
    ...model.describe(id)});
}
const actions=[...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((m,i)=>{
  const id=attr(m[1],'id')||attr(m[1],'data-preset')||'button-'+i,label=plain(m[2]);
  const guide=id.startsWith('guide'),calculation=guide||id==='roiFocusButton';
  return {id,label,category:calculation?'仕入れ判定・計算設定':attr(m[1],'data-preset')?'基本検索':'記録・表示操作',
    effect:guide?'設定10率70%/50%を変更。公式取得率があるカードは公式優先。未知の実績率で自動補正しない':id==='roiFocusButton'?'明示操作で判定用の最低利益額だけ0円。計算利益・利益率・年換算・GO安全条件は維持':id==='resetFiltersBtn'?'従来の広範囲検索初期化。年/名称/参考値採用も対象のため通常は追加条件だけ解除を使用':attr(m[1],'data-preset')?'プリセットを選択。保存した追加条件・費用・資金・出口・発売年を勝手に解除しない':'ラベルの保存・コピー・表示・記録操作。押さない限り変更しない。お気に入り解除は追加条件解除と別'};
});
actions.push({id:'data-clear-extra-conditions',label:'追加検索条件だけ解除',category:'基本検索',effect:'利用者の明示操作のみ。費用・出口・資金・GO基準・参考採用・基本の年/価格帯・お気に入りは保持'},
  {id:'data-clear-condition',label:'個別の追加条件 ×',category:'基本検索',effect:'その検索フィルターだけ解除。計算値や安全判定を0に置換しない'});
const output={version:1,usageTelemetry:'使用履歴は収集していない。未使用とは断定しない。',compatibility:'既存ID・URL・CSV列・保存キー・初期値を維持。変更は配置と明示解除のみ。',controls:rows,actions};
fs.writeFileSync(path.join(root,'data/search-control-inventory.json'),JSON.stringify(output,null,2)+'\n');
const lines=['# 検索・設定・一覧の棚卸し','','使用履歴は未収集。項目を未使用とは断定せず、今回廃止した計算・検索機能はありません。',
  '初期値はHTML既定値。公式プラン読込・URL・端末保存・プリセット操作後の値は画面の出所表示で区別します。モード表は分析可能範囲の条件。通常モードの全カード掲載探索ではPSA計算条件の一部が不適用です。',
  '既存URL、保存キー、CSV、初期値を維持。追加条件の解除は明示操作のみ。費用・売却先・資金・GO条件・お気に入り・探索基準は保護します。',
  '現相場の上限探索では購入利益条件等が不適用。条件は保存し、モードを戻すと適用されます。国内／海外、集計／実成約／推定は混合しません。',''];
for(const category of [...new Set(rows.map(r=>r.category))]) {
  lines.push('## '+category,'','| ID／項目 | 初期値 | 適用モード | 目的・基準 | 除外への影響／重複 |','| --- | --- | --- | --- | --- |');
  for(const r of rows.filter(r=>r.category===category)) lines.push(`| \`${r.id}\` ${r.label.replace(/\|/g,'／')} | ${r.initial===''?'空欄':String(r.initial)} | ${r.modes.join('／')||'検索外操作'} | ${r.purpose}：${r.basis} | ${r.effect}。${r.overlap} |`);
  lines.push('');
}
lines.push('## ボタン・設定変更の入口','','| ID／入口 | 分類 | 目的・影響 |','| --- | --- | --- |');
for(const a of actions)lines.push(`| \`${a.id}\` ${a.label.replace(/\|/g,'／')} | ${a.category} | ${a.effect} |`);
lines.push('','## かんたん絞り込み・入口','','| プリセット | 目的・基準／初期状態 |','| --- | --- |',
  '| 厳選候補 | 従来の厳格な国内出口・上限・ストレス・信頼性のAND条件。購入GOとは別 |',
  '| おまかせ総合 | 今すぐ／低リスク／高回転／安全条件を満たす価格待ちを重複なく集約 |',
  '| 現相場採算で探す | 現在出口相場維持の仮定。上限探索と実購入黒字探索を分離、購入GOへ昇格しない |',
  '| 今すぐ仕入れ | 新鮮な状態A在庫価格で再判定し、全購入条件を満たす対象のみ |',
  '| 攻め仕入れ圏 | ストレス期待黒字でもPSA9損失ありを通常GOと分離 |',
  '| 低リスク候補 | 超低リスク上限の候補。価格待ちを含み、購入可能と同義ではない |',
  '| 高回転候補 | PSA10の30日15件・素体全状態30日20件・利用可能買取30日1店・売りやすさ70点のAND |',
  '| 薄商い・高粗利 | 少数成約でも国内出口・安全条件のある探索。見送りを含めない |',
  '| スニダン素体流し | PSA提出と別採算。許諾待ちと古値を利益候補にしない |',
  '', '追加条件はプリセットとAND。プリセット変更で費用・売却先・年条件・保存条件を自動解除しない。初期モードは従来normalを維持。',
  '', '## 統合・廃止候補','','- 入口のみ統合：鑑定プラン・出口・費用は計算設定、採算フィルターは詳細検索。並び順は基本画面へ。',
  '- PSA10利益率と期待利益率、現在価格と予測、検索下限とGO条件は意味が違うため存続。',
  '- 素体参考相場と購入可能価格、掲載回数と実買取件数も存続。類似スコアの廃止は影響検証と明示移行なしには行わない。',
  '- 従来の全条件初期化入口は名称を明確化し詳細に残す。追加条件のみ解除を別操作として用意。',
  '','## 一覧表示','','主表示：判定／購入先・価格／PSA10現在相場／安定上限／現相場損益分岐上限（推奨値ではない）／想定10率／検索と同じ採算／重要警告。',
  '常時表示：7/30/75/200暦日観測平均・現相場との乖離・観測日数。中央値/欠測/利益計算の根拠は展開表示。買取掲載・PSA9比率・補完優先理由・モデル比較・監査・取引履歴は必要時に開く。取得元・鮮度・価格対立・仕様保留・期間不一致の警告は隠さない。','');
fs.writeFileSync(path.join(root,'docs/SEARCH_CONTROL_INVENTORY.md'),lines.join('\n'));
console.log(JSON.stringify({controls:rows.length,search:rows.filter(r=>r.modes.length).length,byCategory:rows.reduce((a,r)=>(a[r.category]=(a[r.category]||0)+1,a),{})}));
