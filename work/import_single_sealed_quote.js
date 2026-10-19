const fs=require('node:fs'),path=require('node:path');
const {atomicWrite}=require('./acquisition_retry');
const {sameIssue,condition}=require('./raw_condition_reference');
const {recordReference,markSealed}=require('./quarantine_shop_identity');
const {campA,campVariantPrice}=require('./update_yuyutei_torecacamp');
function importSaved(root,file,now=Date.now()) {
  const packet=JSON.parse(fs.readFileSync(file,'utf8')),p=packet.product,url=new URL(packet.url);
  const at=Date.parse(packet.observedAt);
  if(url.origin!=='https://torecacamp-pokemon.com'||!/^\/products\/[^/]+\.js$/.test(url.pathname)||!p?.id
    ||!Number.isFinite(at)||at>now||condition(p.title)!=='sealed-single')throw Error('Unverified saved product packet');
  const cards=JSON.parse(fs.readFileSync(path.join(root,'data/pokemon-cards.json'),'utf8'));
  const matches=cards.filter(c=>sameIssue(c,p.title));
  if(matches.length!==1)throw Error('Non-unique specification; keep manual hold');
  const variant=(p.variants||[]).find(campA),price=variant&&campVariantPrice(variant);
  if(!(price>0))throw Error('Exact state-A variant price unavailable');
  const detailUrl=url.origin+url.pathname.replace(/\.js$/,''),card=matches[0];
  const row={cardId:card.id,productId:String(p.id),title:p.title,detailUrl,price,available:variant.available===true,
    stock:variant.available===false?0:null,observedAt:packet.observedAt,identityVerifiedAt:packet.observedAt};
  markSealed(row,card);
  const catalogFile=path.join(root,'work/torecacamp_catalog.json'),catalog=JSON.parse(fs.readFileSync(catalogFile,'utf8'));
  const old=catalog.find(r=>r.detailUrl===detailUrl);
  if(old?.productId&&String(old.productId)!==String(p.id))throw Error('Product identity changed; manual confirmation required');
  if(old?.identityHoldReason&&!markSealed({...old},card))throw Error('Unrelated unresolved identity hold');
  if(old&&Date.parse(old.observedAt)>at)throw Error('Older saved packet cannot overwrite newer observation');
  recordReference(root,'torecacamp',row,card);
  if(old){Object.assign(old,row);atomicWrite(catalogFile,catalog,0);}
  const summaryFile=path.join(root,'data/torecacamp-stock-summary.json'),summary=JSON.parse(fs.readFileSync(summaryFile,'utf8'));
  if(summary.cards?.[card.id]?.detailUrl===detailUrl){Object.assign(summary.cards[card.id],row);atomicWrite(summaryFile,summary,0);}
  return {id:card.id,observedAt:row.observedAt,price,available:row.available,referenceOnly:true,httpRequests:0,
    action:'保存済み実取得を参考専用へ反映。美品中央値・実購入価格・GOは代用しない'};
}
if(require.main===module)console.log(JSON.stringify(importSaved(path.join(__dirname,'..'),process.argv[2])));
module.exports={importSaved};
