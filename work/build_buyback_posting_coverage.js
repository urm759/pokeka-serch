const fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname,'..');
function aggregate(history, source, now = new Date()) {
  const asOf = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0,10);
  const start = Date.parse(asOf + 'T00:00:00Z') - 29 * 86400000;
  const valid = date => /^\d{4}-\d{2}-\d{2}$/.test(date) && Date.parse(date + 'T00:00:00Z') >= start && date <= asOf;
  const summary = {version:2,asOf,shops:{},cards:{},rule:'全掲載を正常確認できた店舗日だけ採用。同一店舗同日1回。部分取得・失敗・照合未完了・過去の証拠不明は未掲載にしない。参考指標のみ'};
  for (const [id,s] of Object.entries(source.shops || {})) {
    const completeDays = [...new Set((history.confirmedCompleteByShop?.[id] || []).filter(valid))].sort();
    const incompleteDays = new Set((history.identityIncompleteByShop?.[id] || []).filter(valid));
    // An unresolved listing may belong to an apparently absent card; do not prove absence from it.
    if (s.unmatched > 0 && Number.isFinite(Date.parse(s.fullListingConfirmedAt))) {
      const date = new Date(Date.parse(s.fullListingConfirmedAt) + 9 * 3600000).toISOString().slice(0,10);
      if (completeDays.includes(date)) incompleteDays.add(date);
    }
    summary.shops[id] = {name:s.name,fulfilment:s.fulfilment || 'mail',completeDays,identityIncompleteDays:[...incompleteDays].sort(),currentIdentityComplete:s.unmatched === 0,currentConfirmedAt:s.fullListingConfirmedAt === s.lastSuccess ? s.fullListingConfirmedAt : null};
    for (const [cardId,values] of Object.entries(history.shops?.[id] || {})) {
      const byDate = new Map(history.dates.map((date,i)=>[date,values[i]]));
      const listedDays = completeDays.filter(date=>typeof byDate.get(date) === 'number' && byDate.get(date) > 0);
      const current = source.cards?.[cardId]?.shops?.[id];
      const currentListed = s.fullListingConfirmedAt && s.fullListingConfirmedAt === s.lastSuccess ? current?.listingActive === true : null;
      if (listedDays.length || currentListed === true) (summary.cards[cardId] ||= {})[id] = {listedDays,currentListed};
    }
  }
  return summary;
}
function build(root = ROOT) {
  const read = file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  const data = aggregate(read('work/shop_buyback_history.json'),read('data/shop-buyback-summary.json'));
  const file = path.join(root,'data/buyback-posting-coverage.json'), text = JSON.stringify(data);
  if (!fs.existsSync(file) || fs.readFileSync(file,'utf8') !== text) {fs.writeFileSync(file+'.tmp',text);fs.renameSync(file+'.tmp',file);}
  return {cards:Object.keys(data.cards).length,shops:Object.keys(data.shops).length,confirmedShopDays:Object.values(data.shops).reduce((n,s)=>n+s.completeDays.length,0)};
}
if (require.main === module) console.log(JSON.stringify(build()));
module.exports = {build,aggregate};
