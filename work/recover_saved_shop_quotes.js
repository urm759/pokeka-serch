const fs=require('node:fs'),crypto=require('node:crypto');
const read=(file,fallback={})=>{try{return JSON.parse(fs.readFileSync(file));}catch{return fallback;}},write=(f,v)=>require('./acquisition_retry').atomicWrite(f,v,0);
function run(){
  const source='hareruya2',cards=read('data/pokemon-cards.json',[]),byId=new Map(cards.map(c=>[c.id,c])),cache=read('work/priority-price-http-cache.json');
  const checkpoint=read('work/candidate-shop-refresh.json'),run=checkpoint.sources?.[source],catalog=read('work/hareruya2_catalog.json',[]),summary=read('data/hareruya2-stock-summary.json');
  const replay=[],collector=require('./refresh_candidate_shops'),completion=read('work/completion-acquisition-checkpoint.json');
  for(const record of run?.records || []){
    if(record.status!=='manual-wait'||record.error!=='同一カード・番号・セット・レアリティ・仕様の一致を確認できない')continue;
    const c=byId.get(record.id),saved=cache[record.url+'.js'];if(!c||c.hareruya2Url!==record.url||!saved?.body||!saved.checkedAt||Date.parse(saved.checkedAt)<Date.parse(record.startedAt))continue;
    let product;try{product=JSON.parse(saved.body);}catch{continue;}
    if(!collector.exactIdentity(c,product))continue;
    const quote=collector.shopifyQuote(product,null,record.url);if(!quote)continue;
    const old=catalog.findIndex(r=>r.cardId===c.id),prior=old<0?{}:catalog[old];
    if(Date.parse(prior.observedAt)>=Date.parse(saved.checkedAt))continue;
    const row={...prior,cardId:c.id,name:product.title,detailUrl:record.url,price:quote.price,stock:quote.stock,available:quote.available,observedAt:saved.checkedAt,identityVerified:true};
    if(old<0)catalog.push(row);else catalog[old]=row;
    summary.cards ||= {};summary.cards[c.id]={...(summary.cards[c.id]||{}),hareruya2Price:quote.price,stock:quote.stock,available:quote.available,conditionAccepted:true,identityVerified:true,identityVerifiedAt:saved.checkedAt,observedAt:saved.checkedAt,priceObservedAt:saved.checkedAt,inventoryObservedAt:saved.checkedAt};
    const hold=checkpoint.checkpoints?.[source]?.manualWait?.[c.id];if(hold?.url===record.url)delete checkpoint.checkpoints[source].manualWait[c.id];
    if(completion.cards?.[c.id]?.reason===record.error)completion.cards[c.id]={...require('./completion_routes').failureState(completion.cards[c.id],{status:'verified',startedAt:record.startedAt,endedAt:saved.checkedAt},Date.parse(saved.checkedAt)),field:'shopStateA',source};
    replay.push({id:c.id,url:record.url,price:quote.price,available:quote.available,observedAt:saved.checkedAt,newPrice:old<0,bodySha256:crypto.createHash('sha256').update(saved.body).digest('hex'),reason:'店舗固有のSV2a-Ma表記を既存厳格照合で確認。元HTTP応答を再解析・追加HTTP0'});
  }
  write('work/hareruya2_catalog.json',catalog);write('data/hareruya2-stock-summary.json',summary);write('work/candidate-shop-refresh.json',checkpoint);write('work/completion-acquisition-checkpoint.json',completion);
  const audit={at:new Date().toISOString(),httpRequests:0,recovered:replay.length,rows:replay,originalAttemptFailuresPreserved:true};if(replay.length)write('data/saved-shop-recovery.json',audit);return audit;
}
if(require.main===module)console.log(JSON.stringify(run()));module.exports={run};
