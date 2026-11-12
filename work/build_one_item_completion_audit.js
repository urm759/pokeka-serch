const fs = require('node:fs'), path = require('node:path');
const {itemState} = require('./completion_routes');
function classify(detail, linkage = {}, progress = {}, access = null) {
  const field = detail.m[0], item = itemState(detail, field);
  if (field === 'psaOfficial') {
    if(linkage?.savedEvidence?.candidateCount > 0)return '保存原票あり・名称/完全仕様の再照合待ち（新規通信不要）';
    if(access&&!access.allowed)return 'PSA取得許諾確認待ち・保存済み紐付け/保留根拠は保持';
    if (item.status === '再照合待ち' || linkage.specificationHeld) return '仕様不一致で保留・完全仕様表の再確認待ち';
    if(/pokemon-asia/i.test(linkage.sourceSetUrl || ''))return '日本語版根拠未確認・言語照合待ち';
    const retry=progress.sourceRetry || progress.retryByUrl?.[linkage.sourceSetUrl];
    if(retry&&!require('./acquisition_retry').eligible(retry))return retry.scope==='source'?'PSA取得元停止・正規アクセス確認待ち'
      : retry.held?'PSA個別URL保留・他セット巡回継続':'PSA一時障害・期限後の自動再試行待ち';
    return linkage.status === 'unlinked' && linkage.sourceSetUrl
      ? 'PC正規セット取得へ接続済み・実取得待ち'
      : linkage.status === 'ambiguous' ? '仕様・セット曖昧・手動確認待ち' : '公式セットURL未登録・正規候補確認待ち';
  }
  if (/対立|裏付け|手動確認/.test(item.reason || '')) return '価格根拠確認待ち・店舗価格だけでは解除しない';
  if(['domesticTrades','psa10Trades'].includes(field)&&item.status==='定期再確認')return '期間件数未取得・正規一括差分で再確認（データなし未確定）';
  if (item.status === '取得元にデータなし' || item.status === '定期再確認') return '一括差分再確認へ接続済み・現在掲載なし';
  return '一括差分取得へ接続済み・実取得待ち';
}
function build(root) {
  const read = file => JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  const queue = read('work/card-completion-queue.json');
  const links = new Map(read('work/psa-linkage-all.json').rows.map(row=>[row.cardId,row]));
  const cards = new Map(read('data/pokemon-cards.json').map(card=>[card.id,card]));
  const progress=read('work/psa-fetch-progress.json');
  const psaAccess=require('./psa_access_policy').decision(require('./psa_access_policy').read(root));
  const byField = {}, byRoute = {},byConstraint={};
  const rows = Object.entries(queue.cards).filter(([,detail])=>detail.m?.length === 1).map(([id,detail])=>{
    const field = detail.m[0], routing = classify(detail,links.get(id),progress,psaAccess);
    byField[field] = (byField[field] || 0) + 1;
    byRoute[routing] = (byRoute[routing] || 0) + 1;
    const constraint=releaseCondition(field,routing,itemState(detail,field));
    byConstraint[constraint.category]=(byConstraint[constraint.category]||0)+1;
    return {id,name:cards.get(id)?.name,field,routing,...constraint,priority:detail.p,reasons:detail.r,
      lastAttemptAt:itemState(detail,field).lastAttemptAt || null,
      nextRetryAt:itemState(detail,field).nextRetryAt || null,sourceSetUrl:links.get(id)?.sourceSetUrl || null};
  }).sort((a,b)=>b.priority-a.priority);
  const inputHashes=Object.fromEntries(['work/card-completion-queue.json','work/psa-linkage-all.json','data/pokemon-cards.json'].map(file=>[file,
    require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
  const output = {version:2,generatedAt:new Date().toISOString(),inputHashes,total:rows.length,byField,byRoute,byConstraint,
    note:'見込み枚数は取得成功の保証ではない。現在掲載なし・未取得・曖昧・URL未登録を分離。URL発見は価格補完ではなく、取得と分析可能純増は別成果。通常取得LLM/Codex0。',rows};
  require('./acquisition_retry').atomicWrite(path.join(root,'data/one-item-completion-audit.json'),output,0);
  return output;
}
if(require.main === module) console.log(JSON.stringify(build(path.join(__dirname,'..')).byRoute));
function releaseCondition(field,routing,item={}){
 if(/保存原票|仕様|曖昧|言語|価格根拠/.test(routing))return {category:'照合保留',releaseCondition:'保存原票の元日時・言語・番号・加工・価格区分を一意照合。同価格でも確認根拠なしでは解除しない',networkRequired:false};
 if(/許諾|取得元停止/.test(routing))return {category:'取得停止・許諾待ち',releaseCondition:'対象行為の利用根拠と通常取得可能な経路を確認。GemRate参考表示だけで公式計算用不足の解消としない',networkRequired:null};
 if(/履歴|観測日/.test(item.reason||''))return {category:'履歴待ち',releaseCondition:'同仕様・同取得元の新しい実観測を必要期間保存。再処理や欠測補完で日数を増やさない',networkRequired:true};
 if(/期間件数/.test(routing))return {category:'期間別件数の正規経路確認',releaseCondition:'必要期間・グレード・仕様の件数を提供する正規経路を少数検証。現在の項目欠損を未提供確定や0件にしない',networkRequired:null};
 if(/現在掲載なし/.test(routing))return {category:'提供値なし・項目未提供とは未確定',releaseCondition:'通常の一括差分で有効値が再掲載されるか確認。独立店舗価格は別指標として保持し元集計値へ黙って代用しない',networkRequired:false};
 return {category:'実取得待ち・経路確認',releaseCondition:field==='psaOfficial'?'正規セットURL・完全仕様・取得利用条件を揃えて実取得し、計算採用の別検証を行う':'既存一括経路の実応答・個別日時・仕様を保存し再判定。保存済みデータがあれば取得前に回収',networkRequired:true};
}
module.exports = {build,classify,releaseCondition};
