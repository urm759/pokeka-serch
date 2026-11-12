// PC normal-access lane for already proven product bindings. Cloud access holds
// are untouched. Expensive/out-of-stock products remain in the rotation.
const fs=require('node:fs'),path=require('node:path');
const retry=require('./acquisition_retry'),HOUR=3600000;
function targets(cards,catalog,checkpoint,attempts={},now=Date.now()){
 if(!retry.eligible(attempts._source,now))return [];
 const proven=new Set(Object.values(checkpoint.receipts||{}).filter(r=>r.status==='adopted'&&r.id&&r.url).map(r=>r.id+'\n'+r.url));
 return catalog.flatMap(binding=>{
  const owners=cards.filter(c=>c.id===binding.cardId&&c.yuyuteiUrl===binding.detailUrl);
  if(owners.length!==1||cards.filter(c=>c.yuyuteiUrl===binding.detailUrl).length!==1
   ||catalog.filter(c=>c.detailUrl===binding.detailUrl).length!==1
   ||!proven.has(binding.cardId+'\n'+binding.detailUrl)
   ||!require('./yuyutei_product_detail').yuyuteiProductRequestUrl(owners[0],binding))return [];
  const at=Date.parse(binding.observedAt),attempt=attempts[binding.detailUrl];
  if(!Number.isFinite(at)||at>now||now-at<4*HOUR||!retry.eligible(attempt,now))return [];
  const last=Date.parse(attempt?.lastAttemptAt);if(Number.isFinite(last)&&(last>now||now-last<2*HOUR))return [];
  return [{card:owners[0],binding,ageMs:now-at}];
 }).sort((a,b)=>b.ageMs-a.ageMs||a.card.id.localeCompare(b.card.id));
}
async function acquire({root,store,now=Date.now(),probe=require('./probe_yuyutei_product').probeYuyuteiProduct,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),file=path.join(store,'pc-yuyutei-attempts.json');
 const attempts=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{};
 const list=targets(read('data/pokemon-cards.json'),read('work/yuyutei_catalog.json'),read('work/yuyutei-product-receipts.json'),attempts,now);
 const raw=path.join(store,'pc-yuyutei-receipts');fs.mkdirSync(raw,{recursive:true});
 const recovered=require('./import_saved_yuyutei_products').run(root,raw,now);
 // Saved normal receipts are recovered BEFORE choosing requests. A recovered
 // quote must not be requested again merely because the original plan was old.
 const refreshedCatalog=read('work/yuyutei_catalog.json');
 const wanted=targets(read('data/pokemon-cards.json'),refreshedCatalog,read('work/yuyutei-product-receipts.json'),attempts,now);
 const rows=[];
 for(const [i,t]of wanted.slice(0,8).entries()){
  if(i)await sleep(3000);
  const dir=path.join(raw,new Date().toISOString().replace(/[:.]/g,'-')+'-'+t.card.id);
  const receipt=await probe({card:t.card,binding:t.binding,rawDir:dir});rows.push({id:t.card.id,...receipt});
  const at=Date.parse(receipt.fetchedAt||receipt.endedAt)||Date.now();
  if(receipt.result==='verified-not-adopted')attempts[t.binding.detailUrl]={lastAttemptAt:new Date(at).toISOString(),lastSuccessAt:new Date(at).toISOString()};
  else attempts[t.binding.detailUrl]=retry.failure(attempts[t.binding.detailUrl],{httpStatus:receipt.httpStatus,message:receipt.result==='identity-or-page-rejected'?'同一カード・状態・商品形式不一致':receipt.error||'HTTP '+receipt.httpStatus},at);
  retry.atomicWrite(file,attempts);
  // An actual PC authentication/access failure holds this PC lane too. It is
  // never used as a reason to change an existing cloud hold or retry another URL.
  if([401,403,429].includes(receipt.httpStatus)){attempts._source=retry.failure(attempts._source,{httpStatus:receipt.httpStatus,message:'HTTP '+receipt.httpStatus},at);retry.atomicWrite(file,attempts);break;}
 }
 const imported=require('./import_saved_yuyutei_products').run(root,raw);
 return {environment:'PC-normal-HTTP',planned:list.length,requests:rows.length,verified:rows.filter(r=>r.result==='verified-not-adopted').length,
  recoveredBeforeFetch:recovered.recovered,adopted:imported.recovered,rows:rows.map(r=>({id:r.id,at:r.fetchedAt||r.endedAt,status:r.httpStatus,result:r.result,bytes:r.bytes})),newMappings:0,holdsChanged:0};
}
module.exports={targets,acquire};
