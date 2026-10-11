function requirements(card, buyback, now = Date.now()) {
  const p9 = typeof card.snkPsa9Price === 'number' && Number.isFinite(card.snkPsa9Price) && card.snkPsa9Price > 0;
  const observed = Date.parse(card.psa9ObservedAt);
  const freshP9 = p9 && Number.isFinite(observed) && observed <= now && now - observed <= 30 * 86400000;
  const shops = Object.values(buyback?.shops || {}).filter(row => {
    const date = Date.parse(row.priceDate);
    return row.listingActive === true && !row.quarantined && row.price > 0 && Number.isFinite(date) && date <= now && now - date <= 7 * 86400000;
  });
  return { psa9Evidence: { ready:freshP9, reason:!p9 ? 'PSA9国内価格未取得・推定値は補完済みにしない' : !Number.isFinite(observed) ? 'PSA9集計の再確認日時未取得・実成約日と別に取得' : 'PSA9集計価格の確認期限超過' },
    buybackExitEvidence: { ready:shops.length >= 2, reason:'新鮮な買取掲載が2店舗未満。利用設定・価格対立は別途安全判定' } };
}
function pending(cards, summary, now = Date.now()) {
  const result = {psa9Evidence:[],buybackExitEvidence:[]};
  for (const card of cards) for (const [key,row] of Object.entries(requirements(card,summary.cards?.[card.id],now))) if(!row.ready) result[key].push(card.id);
  return result;
}
module.exports={requirements,pending};
