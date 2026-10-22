const fs = require('node:fs'), path = require('node:path');
const {atomicWrite} = require('./acquisition_retry');
const VERSION = 'homura-public-v3';
const BASE = 'https://api.kaitori-homura.com/api/v1/products';
function collapse(checkpoint) {
  if(checkpoint.rawCount!==checkpoint.total || !checkpoint.items.length) throw Error('形式変更: ホムラ一覧件数不整合・取得0件。正常値保持');
  const unique=new Map();let duplicates=0;
  for(const item of checkpoint.items) {
    const previous=unique.get(item.shopItemId);
    if(previous) {
      if(previous.name!==item.name || previous.price!==item.price || previous.verifiedCardId!==item.verifiedCardId) throw Error('形式変更: ホムラ同一IDの価格・仕様対立。原票保持');
      duplicates++;
    }
    unique.set(item.shopItemId,item);
  }
  return {pages:checkpoint.pages,items:[...unique.values()],sourceTotal:checkpoint.total,fullListing:duplicates===0,
    duplicateSourceIds:duplicates,coverageWarning:duplicates?'一覧に同一商品IDの重複。掲載確認分のみ採用・不存在判定は不可':null,
    adapterVersion:VERSION,pagination:'公式画面の認証不要商品API・全ページ。認証付き受付可能数は取得しない'};
}
function parse(payload, cards, observedAt) {
  if(!Array.isArray(payload?.data) || !Number.isInteger(payload.meta?.total_pages)
    || !Number.isInteger(payload.meta?.total_count) || !Number.isInteger(payload.meta?.current_page)) throw Error('形式変更: ホムラ公開一覧の構造不一致');
  const items=[];
  for(const row of payload.data) {
    if(row.product_sub_category?.id!==182 || row.product_sub_category?.product_category?.id!==21) throw Error('形式変更: ホムラPSAカテゴリ条件が反映されていない');
    if(!Number.isInteger(row.id) || typeof row.name!=='string' || !Number.isFinite(row.price) || row.price<0) throw Error('形式変更: ホムラ商品ID・価格の欠損');
    if(!/^PSA\s*10\b/i.test(row.name)) continue;
    const name=row.name.replace(/^PSA\s*10\s*/i,'');
    const clean=name.replace(/\s+\d{1,3}\s*\/\s*(?:\d{1,3}|(?:XY|SM|SV|BW|S)-P)\b/ig,'');
    const identity=require('./cardshop151').resolve({type:'PSA10',genre:'ポケモンカード',name:clean,listNo:name},cards);
    const card=cards.find(c=>c.id===identity.cardId), audit=require('./card_identity');
    const rarity=audit.extractRarity(name), targetRarity=card && audit.extractRarity(card.name,card.rarity);
    const set=name.match(/\[((?:SV|SM|XY|BW|S|M)[a-z0-9+-]*)\s/i)?.[1];
    const normalize=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    const mismatch=card && (rarity && targetRarity && rarity!==targetRarity || set && normalize(set)!==normalize(card.setCode));
    const special=row.promoted===true || row.homura_premium===true;
    items.push({shopItemId:String(row.id),name,number:name,price:row.price,active:row.price>0,
      itemUrl:`https://kaitori-homura.com/products/${row.id}`,imageUrl:row.image_url||null,
      observedAt,sourceUpdatedAt:null,priceDate:null,grade:'PSA10',currency:'JPY',fulfilment:'mail',
      campaign:special,conditionsConfirmed:row.requires_condition_consent!==true,
      verifiedCardId:mismatch?null:identity.cardId||null,strictIdentity:true,
      matchMethod:identity.method||null,identityEvidence:identity.evidence||null,
      mismatchReason:mismatch?'明示セット・レアリティ不一致':identity.reason||null});
  }
  return items;
}
async function fetchItems(shop, fetchJson, cards, root=path.join(__dirname,'..')) {
  const file=path.join(root,'work/homura-public-checkpoint.json');
  const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
  let checkpoint;
  try{checkpoint=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
  if(checkpoint?.version===VERSION && checkpoint.day===day && !checkpoint.complete && checkpoint.pages && checkpoint.nextPage>checkpoint.pages) {
    const recovered=collapse(checkpoint);checkpoint.complete=true;atomicWrite(file,checkpoint);return {...recovered,recoveredSavedPages:true};
  }
  if(checkpoint?.version!==VERSION || checkpoint.day!==day || checkpoint.complete || checkpoint.restartRequired) {
    if(checkpoint) {
      const archive=path.join(root,'work/homura-public-checkpoints');fs.mkdirSync(archive,{recursive:true});
      atomicWrite(path.join(archive,require('node:crypto').createHash('sha256').update(JSON.stringify(checkpoint)).digest('hex')+'.json'),checkpoint);
    }
    checkpoint={version:VERSION,day,nextPage:1,total:null,pages:null,items:[],rawCount:0,complete:false};
  }
  const started=Date.now(), budget=90000;
  while(!checkpoint.pages || checkpoint.nextPage<=checkpoint.pages) {
    if(Date.now()-started>=budget) throw Error('ホムラ時間予算・保存地点から次回再開');
    const page=checkpoint.nextPage;
    const url=new URL(BASE); for(const [k,v] of Object.entries({product_category_id:21,product_sub_category_id:182,sort:'price_desc',per:100,page}))url.searchParams.set(k,String(v));
    const payload=await fetchJson(url.href,shop.name);
    const observedAt=new Date().toISOString(), items=parse(payload,cards,observedAt);
    if(payload.meta.current_page!==page || payload.meta.total_pages<1 || payload.meta.total_pages>100) throw Error('形式変更: ホムラページ構造不一致。原票保持');
    if(checkpoint.total!=null && (checkpoint.total!==payload.meta.total_count || checkpoint.pages!==payload.meta.total_pages)) {
      checkpoint.restartRequired=true;atomicWrite(file,checkpoint);
      throw Error('一時的な一覧更新競合・正常値保持。次回は保存済み途中原票を退避して再開');
    }
    checkpoint.total=payload.meta.total_count;checkpoint.pages=payload.meta.total_pages;
    checkpoint.items.push(...items);checkpoint.rawCount+=payload.data.length;checkpoint.nextPage=page+1;checkpoint.lastConfirmedAt=observedAt;
    atomicWrite(file,checkpoint);
    if(page<checkpoint.pages)await new Promise(r=>setTimeout(r,1500));
  }
  const result=collapse(checkpoint);
  checkpoint.complete=true;atomicWrite(file,checkpoint);
  return result;
}
module.exports={VERSION,parse,collapse,fetchItems};
