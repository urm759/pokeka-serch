const fs=require('node:fs'),path=require('node:path'),access=require('./overseas_access_policy');
const retry=require('./acquisition_retry');
const COSTS={account:0,search:1,sets:5,set:5,pricing:10,population:5};
function pricing(payload,{capturedAt,fx=null}={}){
  if(!payload||payload.language!=='JAPANESE'||!Number.isFinite(Number(payload.id)))throw Error('Japanese card identity required');
  const market=key=>{
    const r=payload.pricing?.[key];
    if(!r||typeof r.value!=='number'||!Number.isFinite(r.value)||r.value<=0||!['usd','eur','jpy'].includes(String(r.currency).toLowerCase()))return null;
    const currency=r.currency.toUpperCase(),rate=fx?.currency===currency&&Number.isFinite(fx?.jpyRate)&&fx.jpyRate>0&&Number.isFinite(Date.parse(fx?.rateDate))?fx.jpyRate:null;
    return {value:r.value,currency,jpy:currency==='JPY'?r.value:rate==null?null:r.value*rate,
      fxDate:currency==='JPY'?null:rate==null?null:fx.rateDate,priceType:'provider-aggregate',
      individualSales:null,saleCount:null,lastSaleAt:null,providerObservedAt:null,capturedAt,
      condition:key==='eBay Raw'?'状態混在・美品未証明':'PSA10',sourceLabel:key};
  };
  return {version:1,id:Number(payload.id),language:payload.language,name:payload.name,num:payload.num,setCode:payload.set_code,setId:payload.set_id,
    capturedAt,raw:market('eBay Raw'),psa10:market('PSA 10.0'),source:'PokeDATA official /v0/pricing',
    usage:'private-only',individualSaleHistory:'未提供・未確認',decisionImpact:false};
}
async function request(root,endpoint,params={},options={}){
  access.assertInternal(root);
  if(!Object.hasOwn(COSTS,endpoint))throw Error('Undocumented endpoint refused');
  const budget=Number(options.approvedCredits??process.env.POKEDATA_APPROVED_CREDITS??0);
  if(!Number.isFinite(budget)||budget<COSTS[endpoint])throw Error('API credit budget approval required');
  const token=options.token||process.env.POKEDATA_API_TOKEN;if(!token)throw Error('PokeDATA official API key missing; no request');
  if(['pricing','population'].includes(endpoint)&&(!/^\d+$/.test(String(params.id))||params.asset_type!=='CARD'))throw Error('Card ID and CARD type required');
  if(Object.keys(params).some(k=>!['id','asset_type','query','language','set_id'].includes(k)))throw Error('Undocumented parameter refused');
  const url=new URL('/v0/'+endpoint,'https://www.pokedata.io');
  for(const [k,v]of Object.entries(params).sort(([a],[b])=>a.localeCompare(b)))url.searchParams.set(k,String(v));
  const requestKey=endpoint+'?'+url.searchParams;
  const stateFile=access.privatePath(root,'api/runtime.json');fs.mkdirSync(path.dirname(stateFile),{recursive:true});
  const release=retry.lock(stateFile+'.lock');
  try{
    let state={};try{state=JSON.parse(fs.readFileSync(stateFile));}catch{}
    const sourceRetry=state.sourceRetry||(state.retry?.scope==='source'?state.retry:null);
    const urlRetry=state.urlFailures?.[requestKey];
    if(!retry.eligible(sourceRetry)||!retry.eligible(urlRetry))throw Error('PokeDATA official API waiting: '+(!retry.eligible(sourceRetry)?sourceRetry.reason:urlRetry.reason));
    const day=new Date().toISOString().slice(0,10),used=state.day===day?Number(state.reservedCredits||0):0;
    if(used+COSTS[endpoint]>budget)throw Error('Approved daily API credit budget exhausted');
    const wait=Math.max(0,1200-(Date.now()-Date.parse(state.lastRequestAt||'')));
    if(Number.isFinite(wait)&&wait>0)await new Promise(r=>setTimeout(r,wait));
    state={...state,day,reservedCredits:used+COSTS[endpoint],lastRequestAt:new Date().toISOString()};retry.atomicWrite(stateFile,state);
    try{
      const response=await(options.fetcher||fetch)(url.href,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Object.assign(Error('PokeDATA official API HTTP '+response.status),{httpStatus:response.status});
      const payload=await response.json();
      const at=new Date().toISOString(),file=access.privatePath(root,'api/'+endpoint+'-'+require('node:crypto').createHash('sha256').update(url.search).digest('hex')+'-'+Date.parse(at)+'.json');
      fs.writeFileSync(file,JSON.stringify({capturedAt:at,endpoint,params,payload}));
      const urlFailures={...state.urlFailures};delete urlFailures[requestKey];
      retry.atomicWrite(stateFile,{...state,lastSuccessAt:at,retry:null,sourceRetry:null,urlFailures});
      return {payload,capturedAt:at,credits:COSTS[endpoint],privateFile:file};
    }catch(error){
      const policy=retry.classify(error),failure=retry.failure((policy.scope==='source'?sourceRetry:urlRetry)||{},error);
      retry.atomicWrite(stateFile,{...state,retry:null,...(policy.scope==='source'?{sourceRetry:failure}:{urlFailures:{...state.urlFailures,[requestKey]:failure}})});throw error;
    }
  }finally{release();}
}
module.exports={COSTS,pricing,request};
