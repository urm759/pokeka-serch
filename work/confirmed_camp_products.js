// Reuse reviewed identity bindings, never bootstrap an old price/stock as current.
const fs=require('node:fs'),path=require('node:path');
function seed(cards,catalog,registry,{now=Date.now(),match}={}) {
  if(registry.version!==1||!Array.isArray(registry.entries))throw Error('Confirmed Camp registry schema');
  match ||= require('./update_yuyutei_torecacamp').campMatchesCard;
  const rows=catalog.slice(),links=[],holds=[];
  for(const e of registry.entries){const card=cards.find(c=>c.id===e.cardId);let u;try{u=new URL(e.url);}catch{}
    if(registry.entries.filter(r=>r.cardId===e.cardId||r.url===e.url).length!==1
      ||!card||card.language!=='ja'||card.identityReviewRequired||card.identityKey!==e.identityKey
      ||!u||u.origin!=='https://torecacamp-pokemon.com'||!/^\/products\/[a-zA-Z0-9_%~-]+$/.test(u.pathname)||u.search||u.hash
      ||!/^\d+$/.test(e.productId||'')||!/^\d+$/.test(e.variantId||'')||!/^[a-f0-9]{64}$/.test(e.sourcePayloadHash||'')
      ||!Number.isFinite(Date.parse(e.identityConfirmedAt))||Date.parse(e.identityConfirmedAt)>now
      ||!match(card,{title:e.title,tags:[]})){holds.push({id:e.cardId,reason:'確定仕様・通常商品URL・原票根拠の不一致'});continue;}
    const own=rows.filter(r=>r.cardId===e.cardId),other=rows.filter(r=>r.detailUrl===e.url&&r.cardId!==e.cardId);
    if(other.length||cards.some(c=>c.id!==e.cardId&&c.torecacampUrl===e.url)
      ||card.torecacampUrl&&card.torecacampUrl!==e.url){holds.push({id:e.cardId,reason:'現在の購入先またはURL所有者が異なる'});continue;}
    // Existing observations, holds and alternate valid products always win.
    if(own.length){if(own.some(r=>r.detailUrl!==e.url||String(r.productId)!==e.productId))holds.push({id:e.cardId,reason:'既存対応が変更済み・自動上書きしない'});continue;}
    rows.push({cardId:e.cardId,productId:e.productId,variantId:e.variantId,title:e.title,detailUrl:e.url,state:'A',
      price:null,available:null,observedAt:null,identityVerified:true,identityVerifiedAt:e.identityConfirmedAt,
      sourcePayloadHash:e.sourcePayloadHash,confirmedBootstrap:true});
    links.push(e.cardId);
  }
  return {catalog:rows,links,holds,sourceRequests:0,pricesRecovered:0,newObservations:0};
}
function build(root=path.join(__dirname,'..'),options={}){
  const file=path.join(root,'work/confirmed-camp-products.json');if(!fs.existsSync(file))return {links:[],holds:[]};
  // Source acquisition may add the catalog entries BEFORE its required audits.
  // Finalization only reuses already-listed identities; never add cards after
  // the caller has completed catalog/price verification.
  if(options.addCards===true)require('./domestic_catalog_supplements').build(root);
  const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
  const result=seed(read('data/pokemon-cards.json'),read('work/torecacamp_catalog.json'),JSON.parse(fs.readFileSync(file)),options);
  if(result.links.length)require('./acquisition_retry').atomicWrite(path.join(root,'work/torecacamp_catalog.json'),result.catalog,0);
  return {...result,catalog:undefined};
}
function ids(root=path.join(__dirname,'..')){const f=path.join(root,'work/confirmed-camp-products.json');return fs.existsSync(f)?JSON.parse(fs.readFileSync(f)).entries.map(e=>e.cardId):[];}
module.exports={seed,build,ids};
