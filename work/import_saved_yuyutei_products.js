// Receive previously captured normal product pages; no HTTP, hold release or
// invented price/inventory times. The exact parser and saved URL owner are reused.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {replayYuyuteiProduct}=require('./yuyutei_product_detail'),{atomicWrite}=require('./acquisition_retry');
function receive({cards,catalog,summary,history,captures,checkpoint={version:1,receipts:{}},now=Date.now()}){
 const next={catalog:structuredClone(catalog),summary:structuredClone(summary),history:structuredClone(history),checkpoint:structuredClone(checkpoint)},changes=[],rejected=[];next.checkpoint.receipts||={};
 for(const capture of captures){const receipt=capture.receipt,bytes=capture.bytes,digest=crypto.createHash('sha256').update(bytes).digest('hex');
  if(digest!==receipt?.sha256||bytes.length!==receipt.bytes){rejected.push({reason:'raw-hash-size-mismatch'});continue;}
  const receiptKey=crypto.createHash('sha256').update(JSON.stringify([digest,receipt.url,receipt.fetchedAt])).digest('hex');
  if(next.checkpoint.receipts[receiptKey]&&!(next.checkpoint.receipts[receiptKey].status==='held'&&next.checkpoint.receipts[receiptKey].parserVersion!=='product-v2'))continue;
  const save=(status,detail={})=>{const old=next.checkpoint.receipts[receiptKey];next.checkpoint.receipts[receiptKey]={sha256:digest,status,parserVersion:'product-v2',sourceAt:receipt.fetchedAt||null,receivedAt:old?.receivedAt||new Date(now).toISOString(),...(old?{previous:{status:old.status,parserVersion:old.parserVersion||null,receivedAt:old.receivedAt},reparsedAt:new Date(now).toISOString()}:{}),...detail};};
  if(receipt.httpStatus!==200||receipt.requestCount!==1||receipt.url!==receipt.finalUrl){save('held');rejected.push({reason:'normal200-receipt-required'});continue;}
  const owners=cards.filter(c=>c.yuyuteiUrl===receipt.url),bindings=next.catalog.filter(c=>c.detailUrl===receipt.url);
  if(owners.length!==1||bindings.length!==1||bindings[0].cardId!==owners[0].id){save('held');rejected.push({reason:'ambiguous-or-missing-saved-owner'});continue;}
  const card=owners[0],binding=bindings[0],parsed=replayYuyuteiProduct(card,binding,{...receipt,html:bytes.toString('utf8')},{now});
  if(!parsed||card.language!=='ja'||!card.identityKey){save('held');rejected.push({id:card.id,reason:'identity-condition-or-time-unconfirmed'});continue;}
  if(now-Date.parse(parsed.observedAt)>48*3600000){save('stale');rejected.push({id:card.id,reason:'older-than-adoption-deadline'});continue;}
  const priorAt=Date.parse(binding.observedAt),incomingAt=Date.parse(parsed.observedAt);
  if(priorAt===incomingAt&&(binding.price!==parsed.price||binding.stock!==parsed.stock)){save('held',{id:card.id});rejected.push({id:card.id,reason:'same-observation-conflict'});continue;}
  if(Number.isFinite(priorAt)&&priorAt>incomingAt){save('already-present-or-newer',{id:card.id});continue;}
  const incoming={...binding,...parsed,receiptSha256:digest,acquisitionEnvironment:'PC',sourceReceiptAt:parsed.observedAt};next.catalog[next.catalog.indexOf(binding)]=incoming;
  // Current quantity comes from this exact page, never the newest unrelated
  // history index. Historical insertion uses the original JST observation day.
  const day=require('./stock_history_statistics').dayOf(parsed.observedAt),dates=next.history.dates||=[];
  if(!dates.includes(day)){const index=dates.findIndex(d=>d>day),at=index<0?dates.length:index;dates.splice(at,0,day);for(const values of Object.values(next.history.stocks||{}))values.splice(at,0,null);}
  next.history.stocks||={};const values=next.history.stocks[card.id]||=[];while(values.length<dates.length)values.push(null);const i=dates.indexOf(day);
  const evidence=(next.history.quantityEvidence||={})[card.id]||={},old=evidence[day];
  if(old!==null&&(!old||Date.parse(old[2])<Date.parse(parsed.observedAt))){values[i]=parsed.stock;if(Number.isFinite(parsed.stock))evidence[day]=[parsed.stock,parsed.detailUrl,parsed.observedAt,card.identityKey];else delete evidence[day];}
  const changedSummary={cards:{[card.id]:{...(next.summary.cards?.[card.id]||{}),yuyuteiPrice:parsed.price,stock:parsed.stock,available:typeof parsed.available==='boolean'?parsed.available:parsed.stock>0,quantityKnown:Number.isFinite(parsed.stock),inventoryEvidence:parsed.inventoryEvidence||'visible-quantity-and-schema',observedAt:parsed.observedAt,priceObservedAt:parsed.observedAt,inventoryObservedAt:parsed.observedAt,identityVerified:true,conditionAccepted:true,state:'A',productUrl:parsed.detailUrl,receiptSha256:digest,acquisitionEnvironment:'PC'}}};
  require('./stock_history_statistics').apply(changedSummary,next.history,{asOf:new Date(now).toISOString()});next.summary.cards||={};next.summary.cards[card.id]=changedSummary.cards[card.id];
  save('adopted',{id:card.id,url:parsed.detailUrl});changes.push({id:card.id,url:parsed.detailUrl,before:binding.price,price:parsed.price,stock:parsed.stock,sourceAt:parsed.observedAt,receiptSha256:digest});
 }
 return {...next,changes,rejected,sourceRequests:0,newMappings:0,holdsChanged:0};
}
function run(root=path.join(__dirname,'..'),folder=process.env.YUYUTEI_PRODUCT_RECEIPTS_DIR||path.join(root,'.private','yuyutei-product-detail-raw'),now=Date.now()){
 if(!fs.existsSync(folder))return {status:'no-private-input',sourceRequests:0,recovered:0};
 const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8')),file='work/yuyutei-product-receipts.json';
 const captures=fs.readdirSync(folder,{withFileTypes:true}).filter(d=>d.isDirectory()).flatMap(d=>{const dir=path.join(folder,d.name),r=path.join(dir,'receipt.json'),h=path.join(dir,'response.html');return fs.existsSync(r)&&fs.existsSync(h)?[{receipt:JSON.parse(fs.readFileSync(r)),bytes:fs.readFileSync(h)}]:[];});
 const result=receive({cards:read('data/pokemon-cards.json'),catalog:read('work/yuyutei_catalog.json'),summary:read('data/yuyutei-stock-summary.json'),history:read('work/yuyutei_stock_history.json'),captures,checkpoint:fs.existsSync(path.join(root,file))?read(file):undefined,now});
 if(result.changes.length){atomicWrite(path.join(root,'work/yuyutei_catalog.json'),result.catalog,0);atomicWrite(path.join(root,'work/yuyutei_stock_history.json'),result.history,0);atomicWrite(path.join(root,'data/yuyutei-stock-summary.json'),result.summary,0);}
 const report={at:new Date(now).toISOString(),sourceRequests:0,recovered:result.changes.length,newMappings:0,holdsChanged:0,changes:result.changes,rejected:result.rejected};
 const prior=fs.existsSync(path.join(root,file))?read(file):null;if(JSON.stringify(prior)!==JSON.stringify(result.checkpoint))atomicWrite(path.join(root,file),result.checkpoint,0);
 if(result.changes.length||result.rejected.length)atomicWrite(path.join(root,'work/yuyutei-product-recovery.json'),report,0);
 return report;
}
if(require.main===module)console.log(JSON.stringify(run(undefined,process.argv[2]||undefined)));
module.exports={receive,run};
