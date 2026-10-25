// Public, read-only mail price tables. No checkout, login or access-control bypass.
const VERSION = 'public-mail-tables-v2';
const clean = value => String(value || '').replace(/<[^>]*>/g, ' ')
  .replace(/&(?:yen|#165);/gi, '¥').replace(/&amp;|&#038;/g, '&')
  .replace(/&nbsp;|&#160;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .normalize('NFKC').replace(/\s+/g, ' ').trim();
function tables(html) {
  return [...String(html).matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)].map(m => ({
    attributes:m[1], rows:[...m[2].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map(r => [...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => clean(c[1])))
  }));
}
function fukufuku(html, cards, observedAt, url) {
  const table=tables(html).find(t => /\bid=["']tablepress-3["']/.test(t.attributes));
  if(!table || !/商品名/.test(table.rows[0]?.join(' ')) || !/買取金額/.test(table.rows[0]?.join(' ')))
    throw Error('形式変更: 福福トレカPSA10価格表の列を確認できません');
  const pageUpdatedAt=html.match(/property=["']article:modified_time["'][^>]*content=["']([^"']+)/)?.[1] || null;
  const items=[],held=[],unique=new Map(),byNumber=new Map();
  const normalizeNumber=require('./cardshop151').number;
  for(const card of cards) {
    const key=normalizeNumber(card.model || card.name);
    if(key){if(!byNumber.has(key))byNumber.set(key,[]);byNumber.get(key).push(card);}
  }
  for(const row of table.rows.slice(1)) {
    const [title,number,rarity,grade,amount]=row;
    const priceMatch=amount?.match(/^[¥￥]\s*([\d,]+)$/);
    if(!priceMatch)continue;
    if(!/^\d{1,3}\s*\/\s*(?:\d{1,3}|[A-Z0-9-]+)$/i.test(number || '') || grade!=='PSA10') {
      held.push({title,number,grade,reason:'個別の全番号・PSA10区分不足（保証・見出しは価格不採用）'});continue;
    }
    const name=`${title} ${rarity} ${number}`;
    const item={shopItemId:[title,number,rarity,grade].join('|'),name,number,
      price:Number(priceMatch[1].replace(/,/g,'')),active:true,itemUrl:url,observedAt,
      sourceUpdatedAt:null,quoteUpdatedAt:null,pageUpdatedAt,grade:'PSA10',currency:'JPY',
      language:'ja',fulfilment:'mail',conditionsConfirmed:true,strictIdentity:true,
      sourceRow:row,priceTimestampBasis:'実際に確認した公開提示。商品更新日時は非公表'};
    if(!(item.price>0))continue;
    const match=require('./build_buyback_observation_summary').resolveSavedItem(item,cards,byNumber);
    item.verifiedCardId=match.cardId || null;item.matchMethod=match.method || null;
    item.identityEvidence=match.evidence || null;item.mismatchReason=match.reason || null;
    const old=unique.get(item.shopItemId);
    if(old) {
      if(old.price!==item.price) {
        old.verifiedCardId=null;old.mismatchReason='同一価格表内の同一仕様に複数提示・照合保留';
        old.priceConflict=true;
      }
      continue;
    }
    unique.set(item.shopItemId,item);items.push(item);
  }
  if(!items.length)throw Error('福福トレカ個別PSA10価格0件。正常原票を保持');
  // Unknown rows and repeated printings preclude interpreting absence as an end of listing.
  return {pages:1,items,sourceTotal:table.rows.length-1,fullListing:false,
    adapterVersion:VERSION,heldRows:held.length,held,
    coverageWarning:held.length?'区分・番号不足行を保留。未観測を掲載終了にしない':null,
    pagination:'通常HTMLの全TablePress行。画面内ページ送りの重複取得なし'};
}
async function fetchFukufuku(shop,fetchText,cards) {
  const html=await fetchText(shop.url,shop.name),observedAt=new Date().toISOString();
  return fukufuku(html,cards,observedAt,shop.url);
}
module.exports={VERSION,clean,tables,fukufuku,fetchFukufuku};
