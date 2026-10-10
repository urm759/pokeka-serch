const fs = require('node:fs'), path = require('node:path');
const {itemState} = require('./completion_routes');
function classify(detail, linkage = {}) {
  const field = detail.m[0], item = itemState(detail, field);
  if (field === 'psaOfficial') return linkage.status === 'unlinked' && linkage.sourceSetUrl
    ? 'PC正規セット取得へ接続済み・実取得待ち'
    : linkage.status === 'ambiguous' ? '仕様・セット曖昧・手動確認待ち' : '公式セットURL未登録・正規候補確認待ち';
  if (/対立|裏付け|手動確認/.test(item.reason || '')) return '価格根拠確認待ち・店舗価格だけでは解除しない';
  if (item.status === '取得元にデータなし' || item.status === '定期再確認') return '一括差分再確認へ接続済み・現在掲載なし';
  return '一括差分取得へ接続済み・実取得待ち';
}
function build(root) {
  const read = file => JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  const queue = read('work/card-completion-queue.json');
  const links = new Map(read('work/psa-linkage-all.json').rows.map(row=>[row.cardId,row]));
  const cards = new Map(read('data/pokemon-cards.json').map(card=>[card.id,card]));
  const byField = {}, byRoute = {};
  const rows = Object.entries(queue.cards).filter(([,detail])=>detail.m?.length === 1).map(([id,detail])=>{
    const field = detail.m[0], routing = classify(detail,links.get(id));
    byField[field] = (byField[field] || 0) + 1;
    byRoute[routing] = (byRoute[routing] || 0) + 1;
    return {id,name:cards.get(id)?.name,field,routing,priority:detail.p,reasons:detail.r,
      lastAttemptAt:itemState(detail,field).lastAttemptAt || null,
      nextRetryAt:itemState(detail,field).nextRetryAt || null,sourceSetUrl:links.get(id)?.sourceSetUrl || null};
  }).sort((a,b)=>b.priority-a.priority);
  const output = {version:1,generatedAt:new Date().toISOString(),total:rows.length,byField,byRoute,
    note:'見込み枚数は取得成功の保証ではない。現在掲載なし・未取得・曖昧・URL未登録を分離。URL発見は価格補完ではなく、取得と分析可能純増は別成果。通常取得LLM/Codex0。',rows};
  require('./acquisition_retry').atomicWrite(path.join(root,'data/one-item-completion-audit.json'),output,0);
  return output;
}
if(require.main === module) console.log(JSON.stringify(build(path.join(__dirname,'..')).byRoute));
module.exports = {build,classify};
