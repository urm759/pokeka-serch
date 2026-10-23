const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const { inspect } = require('./audit_profile_buyback_unmatched');
const { calendarDay } = require('./psa10_observation_evidence');
function recover(before, after) {
  const proof = [], currentCards = new Map(after.cards.map(c=>[c.id,c]));
  const oldCards = new Map(before.cards.map(c=>[c.id,c]));
  for (const [shopId, meta] of Object.entries(after.summary.shops || {})) {
    if (meta.coverageComplete !== false || meta.reviewStatus || meta.acquisitionPermission === 'retired') continue;
    const currentItems = [...(after.catalog.shops?.[shopId] || []), ...(after.unmatched.shops?.[shopId] || [])];
    const seenProducts = new Set(currentItems.map(item=>String(item.shopItemId)));
    const seenCards = new Set(currentItems.map(item=>item.cardId));
    for (const item of before.catalog.shops?.[shopId] || []) {
      const id=item.cardId, card=currentCards.get(id), oldCard=oldCards.get(id);
      const quote=before.summary.cards?.[id]?.shops?.[shopId];
      const current=after.summary.cards?.[id]?.shops?.[shopId];
      const at=Date.parse(item.observedAt), sourceAt=Date.parse(meta.lastSuccess);
      if (!card || !oldCard || card.identityReviewRequired || oldCard.identityReviewRequired || card.identityKey !== oldCard.identityKey || !card.identityKey
        || !inspect(item,card).complete || !item.active || item.score < 90 || quote?.quarantined
        || !quote?.listingActive || quote.price !== item.price || quote.observedAt !== item.observedAt
        || !Number.isFinite(at) || !Number.isFinite(sourceAt) || at >= sourceAt
        || seenProducts.has(String(item.shopItemId)) || seenCards.has(id)) continue;
      if (Date.parse(meta.fullListingConfirmedAt) >= at || current?.quarantined || current?.listingActive === false
        || Date.parse(current?.observedAt) > at) continue;
      const day=calendarDay(item.observedAt), oldIndex=before.history.dates.indexOf(day), index=after.history.dates.indexOf(day);
      if (index < 0 || oldIndex < 0 || before.history.shops?.[shopId]?.[id]?.[oldIndex] !== item.price
        || after.history.shops?.[shopId]?.[id]?.[index] != null) continue;
      after.history.shops[shopId] ||= {};
      after.history.shops[shopId][id] ||= Array(after.history.dates.length).fill(null);
      after.history.shops[shopId][id][index]=item.price;
      after.summary.cards[id] ||= {shops:{}};
      after.summary.cards[id].shops[shopId] = {...quote};
      proof.push({shopId,id,shopItemId:item.shopItemId,price:item.price,observedAt:item.observedAt,
        reason:'部分取得で消えた検証可能な保存原票を回収。新規取得・日時更新なし'});
    }
  }
  return { restoredQuotes:proof.length, restoredCards:new Set(proof.map(r=>r.id)).size, rows:proof,
    acquisitionCount:0, timestampChanges:0 };
}
if (require.main === module) {
  const root=path.join(__dirname,'..'), ref=process.argv[2];
  if (!/^[a-f0-9]{7,40}$/.test(ref || '')) throw Error('Explicit baseline commit required');
  const files={cards:'data/pokemon-cards.json',summary:'data/shop-buyback-summary.json',history:'work/shop_buyback_history.json',catalog:'work/shop_buyback_catalog.json',unmatched:'work/shop_buyback_unmatched.json'};
  const before={},after={};
  for (const [key,file] of Object.entries(files)) {
    before[key]=JSON.parse(cp.execFileSync('git',['show',`${ref}:${file}`],{cwd:root,maxBuffer:64*1024*1024,encoding:'utf8'}));
    after[key]=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  }
  const result=recover(before,after);
  fs.mkdirSync(path.join(root,'work/logs/partial-buyback-recovery'),{recursive:true});
  for (const key of ['summary','history']) {
    fs.copyFileSync(path.join(root,files[key]),path.join(root,'work/logs/partial-buyback-recovery',`${Date.now()}-${key}.json`));
    require('./acquisition_retry').atomicWrite(path.join(root,files[key]),after[key]);
  }
  fs.writeFileSync(path.join(root,'work/partial-buyback-recovery.json'),JSON.stringify({baseline:ref,recoveredAt:new Date().toISOString(),...result},null,2));
  console.log(JSON.stringify(result));
}
module.exports={recover};
