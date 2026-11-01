// A missing provider reference is not a missing market. Investigate a distinct
// purchase quote without replacing domesticPrice or declaring analysis complete.
const fs=require('node:fs'),path=require('node:path');
const HOUR=3600000,TTL=48*HOUR;
const read=(root,file,fallback={})=>{try{return JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));}catch{return fallback;}};
function validQuote(row,source,now){
  const stamp=row?.priceObservedAt||row?.observedAt||'',at=Date.parse(stamp);
  return Number(row?.[source+'Price'])>0&&row.identityVerified===true&&row.conditionAccepted!==false
    &&!row.referenceOnly&&!row.priceQuarantined&&!row.cardMismatchSuspected&&!row.identityHoldReason
    &&/T\d{2}:\d{2}/.test(stamp)&&Number.isFinite(at)&&at<=now&&now-at<=TTL;
}
function plan({cards,completion,shops,holds={},now=Date.now(),leadMs=0}){
  const rows=[];
  for(const card of cards){
    const missing=completion[card.id]?.m;
    // Price conflicts, other confirmed deficiencies, and specification holds
    // require their own evidence; do not turn those into repeated shop requests.
    if(!(Number(card.price)===0&&Array.isArray(missing)&&missing.length===1&&missing[0]==='domesticPrice')
      ||card.identityReviewRequired)continue;
    const sources=['hareruya2','torecacamp'].filter(s=>card[s+'Url']&&!holds[s]?.sourceBlocked
      &&holds[s]?.manualWait?.[card.id]?.url!==card[s+'Url']);
    const fresh=sources.filter(s=>validQuote(shops[s]?.[card.id],s,now));
    const latest=fresh.sort((a,b)=>Date.parse(shops[b][card.id].priceObservedAt||shops[b][card.id].observedAt)-Date.parse(shops[a][card.id].priceObservedAt||shops[a][card.id].observedAt))[0];
    const latestAt=latest?Date.parse(shops[latest][card.id].priceObservedAt||shops[latest][card.id].observedAt):null;
    if(latest&&latestAt+TTL>now+leadMs){rows.push({id:card.id,status:'saved-quote-reusable',source:latest,confirmedAt:new Date(latestAt).toISOString(),request:false});continue;}
    // One known source is enough for this purchase-price investigation. Keep
    // source-specific retry/access guards in the existing fetchers.
    const source=latest||sources[0];
    rows.push({id:card.id,status:source?'alternate-purchase-check':'no-current-authorized-route',source:source||null,
      request:Boolean(source),field:'shopStateA',missingReference:'domesticPrice',refreshHours:48,
      replacesReference:false,domesticAnalysisCompleted:false});
  }
  return rows;
}
function load(root,now=Date.now(),leadMs=0){
  const held=read(root,'work/candidate-shop-refresh.json').checkpoints||{};
  const camp=read(root,'work/torecacamp_progress.json');
  if(camp.manualHold||camp.sourceRetry?.manual)held.torecacamp={...held.torecacamp,sourceBlocked:'Existing source hold retained'};
  return plan({cards:read(root,'data/pokemon-cards.json',[]),completion:read(root,'work/card-completion-queue.json').cards||{},
    shops:Object.fromEntries(['hareruya2','torecacamp'].map(s=>[s,read(root,'data/'+s+'-stock-summary.json').cards||{}])),holds:held,now,leadMs});
}
module.exports={plan,load,validQuote};
