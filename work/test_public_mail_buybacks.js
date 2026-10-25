const assert=require('node:assert/strict'),adapter=require('./public_mail_buybacks');
const cards=require('../data/pokemon-cards.json'),at='2026-10-25T06:11:38.000Z',url='https://fukufuku-toreka.com/tradingcard/pokemon-1/';
const row=(name,no,rarity='SAR',grade='PSA10',price='¥60,000')=>`<tr>${[name,no,rarity,grade,price].map(x=>`<td>${x}</td>`).join('')}</tr>`;
const html=rows=>`<meta property="article:modified_time" content="2026-10-24T10:48:53+00:00"><table id="tablepress-3"><tr><th>商品名</th><th>型番</th><th>レアリティ</th><th>種類</th><th>買取金額</th></tr>${rows}</table>`;
let result=adapter.fukufuku(html(row('ミュウex','205/165')+row('イーブイ','062/SV-P','P')+row('AR/CHR/SAR','','','', '¥3,500')),cards,at,url);
assert.equal(result.items.length,2);assert.equal(result.heldRows,1);
assert.deepEqual(result.items.map(x=>x.verifiedCardId),['pk-43864','x-122054']);
assert(result.items.every(x=>x.fulfilment==='mail'&&x.observedAt===at&&x.sourceUpdatedAt===null&&x.quoteUpdatedAt===null));
assert.equal(result.items[0].pageUpdatedAt,'2026-10-24T10:48:53+00:00');
assert.equal(result.fullListing,false,'unresolved rows never prove that an absent card ended listing');
for(const title of ['ミュウex 英語版','ミュウex メタルカード']) {
  assert.equal(adapter.fukufuku(html(row(title,'205/165')),cards,at,url).items[0].verifiedCardId,null,title);
}
assert.equal(adapter.fukufuku(html(row('ピカチュウ','175/XY-P','P')),cards,at,url).items[0].verifiedCardId,null,
  'an unspecified promo cannot select an event-organizer printing merely because its short name matches');
assert.equal(adapter.fukufuku(html(row('リーリエ','066/060','SR')),cards,at,url).items[0].verifiedCardId,'pk-1586',
  'parenthesized catalogue aliases do not erase a documented rarity');
result=adapter.fukufuku(html(row('ミュウex','205/165')+row('ミュウex','205/165')),cards,at,url);
assert.equal(result.items.length,1,'duplicate rows do not create a second shop or observation');
result=adapter.fukufuku(html(row('ミュウex','205/165')+row('ミュウex','205/165','SAR','PSA10','¥65,000')),cards,at,url);
assert.equal(result.items[0].verifiedCardId,null,'conflicting duplicate is held, never highest-price selection');
assert.throws(()=>adapter.fukufuku('<table></table>',cards,at,url),/形式変更/);
const shop=require('./update_shop_buybacks').SHOPS.find(s=>s.id==='fukufuku-mail');
assert.equal(shop.fulfilment,'mail');assert.equal(shop.merchantId,'fukufuku');
assert.match(shop.conditions,/持込不可/);
console.log('PASS public mail tables: specifications, quote/page/observation dates, guarantees, duplicates, conflicts, mail-only');
