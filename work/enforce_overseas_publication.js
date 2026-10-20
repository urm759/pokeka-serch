const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const access=require('./overseas_access_policy'),ROOT=path.resolve(__dirname,'..');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const hold={version:1,publicationStatus:'permission-wait',note:'海外価格・原票は公開許諾未確認のため非公開。未取得/0件とは異なる。内部原本・チェックポイントは保持'};
const pick=(row,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(row||{},k)).map(k=>[k,row[k]]));
function restricted(file){return /^(?:data\/(?:pokedata(?:\/|-)|overseas-glance\/|psa-market-trial\.json)|work\/(?:pokedata[-_].*\.json|pokedata-progress\.json|psa_market_trial_capture\.json|overseas_lead_history\.json))/.test(file);}
function project(file,value){
  if(file==='data/pokedata-route-status.json')return value;
  if(file==='data/market-research-summary.json')return {...value,comparisons:{},overseasLead:{status:'permission-wait'},fx:{rate:null,status:'海外価格非公開',stale:true},publicationStatus:hold.publicationStatus};
  if(file==='data/pokedata/manifest.json')return {...pick(value,['version','updatedAt','totalCards','totalLinkageRecords','acquisition','qualityAudit','nextSetPriorities']),...hold,
    sets:(value.sets||[]).map(s=>pick(s,['setName','setCode','count','linkageCount','sourceCount','updatedAt','file','localCardIds','status','acquisition']))};
  if(file.startsWith('data/pokedata/sets/'))return {...pick(value,['version','setName','setCode','updatedAt','sourceCount','count','linkageCount','acquisition']),...hold,
    cards:Object.fromEntries(Object.entries(value.cards||{}).map(([id,r])=>[id,{...pick(r,['localCardId','localCardName','linkStatus','sourceUrl','capturedAt']),
      pokedata:pick(r.pokedata,['id','setName','setCode','printedNumber','language','name','number']),markets:{}}])),
    linkageRecords:(value.linkageRecords||[]).map(r=>pick(r,['id','pokedataCardId','localCardId','localCardName','setCode','setName','status','linkStatus','sourceUrl']))};
  if(file.startsWith('data/overseas-glance/'))return {...hold,cards:{}};
  if(file.startsWith('data/pokedata-sales/'))return {...hold,...pick(value,['localCardId','capturedAt']),rows:[],summaries:{}};
  if(file==='data/psa-market-trial.json')return {...hold,cardCount:0,psaExcerptRows:0,overlappedRows:0,certificates:[],priceDevelopment:'stopped',tcgplayerNewAcquisitionStopped:false};
  if(file==='work/psa_market_trial_capture.json')return {...hold,certificates:[],fx:null};
  if(file==='work/overseas_lead_history.json')return {...hold,dates:[],cards:{}};
  if(/pokedata.*(?:config|link-map)\.json$/.test(file))return value;
  return {...pick(value,['version','updatedAt','startedAt','endedAt','capturedAt','status','completionStatus','attempted','fetched','failed','cacheHits','httpRequests','durationMs','cursor','nextIndex','setName','setCode','totalCards','acquisition','throttle','day','dailyAttempted','dailyCap','nextRetryAt']),...hold,
    checkpoint:pick(value.checkpoint,['setName','acquired','total','nextIndex']),
    coverage:pick(value.coverage,['acquired','linkedDomesticCards','totalCards','attemptedCards','exactMatchedCards']),
    linkage:{records:[],recordsStorage:'set-shards',recordsManifest:'data/pokedata/manifest.json'},
    storage:pick(value.storage,['format','manifest','setCount','cardDetailCount','lazyLoaded']),cards:Array.isArray(value.cards)?[]:{},rows:[],records:[],markets:{}};
}
// Inspect nested values as well as file paths: a renamed report must not leak prices.
function priceLeaks(value,trail='',foreign=false){
  if(!value||typeof value!=='object')return [];
  if(value.schema==='private-overseas-analysis-v1'||value.usage==='private-only')return [trail+'.private-only'];
  const context=foreign||(value.localCardId!=null&&value.pokedata!=null)||value.psaSourceUrl!=null||/overseas|ebayRaw|ebayPsa|psaMarket/i.test(trail)
    ||/pokedata(?:\.io)?/i.test([value.source,value.sourceUrl,value.provider].filter(v=>typeof v==='string').join(' '));
  const out=[];
  for(const [k,v]of Object.entries(value)){
    if(v!==null&&['string','number'].includes(typeof v)&&(/^(?:foreignJpy|gapPct|overseasGapPct|overseasDecisionLabel)$/.test(k)
      || /^(?:api[_-]?key|api[_-]?token|authorization)$/i.test(k)&&String(v).trim()))out.push(trail+'.'+k);
    if(v!==null&&['string','number'].includes(typeof v)&&(/^(?:overseasMedianJpy|medianUsd|sold_price|jpyAtReferenceFx)$/.test(k)||context&&/^(?:medianJpy|jpy|usd|price|priceText|value|rawPrice|psa10Price)$/.test(k)))out.push(trail+'.'+k);
    if(typeof v==='object')out.push(...priceLeaks(v,trail+'.'+k,context));
  }
  return out;
}
function files(root){
  const out=[];for(const dir of ['data','work']){
    function scan(relative){if(!fs.existsSync(path.join(root,relative)))return;for(const e of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){
      const f=relative+'/'+e.name;if(e.isDirectory()&&dir==='data')scan(f);else if(e.isFile()&&f.endsWith('.json'))out.push(f);
    }}scan(dir);
  }return out;
}
function enforce(root=ROOT){
  if(access.allowed(root,'public'))return {status:'documented-permission',changed:0};
  const changed=[];let bytes=0;
  for(const file of files(root)){
    if(!restricted(file)&&file!=='data/market-research-summary.json')continue;
    const before=fs.readFileSync(path.join(root,file));let value;try{value=JSON.parse(before);}catch{throw Error('Invalid overseas JSON; publication stopped: '+file);}
    const next=project(file,value),text=JSON.stringify(next);
    if(priceLeaks(next).length)throw Error('Projection contains restricted price: '+file);
    if(JSON.stringify(value)===text)continue;
    const target=access.privatePath(root,'archive/'+hash(before)+'/'+file);fs.mkdirSync(path.dirname(target),{recursive:true});
    if(!fs.existsSync(target))fs.writeFileSync(target,before);
    if(hash(fs.readFileSync(target))!==hash(before))throw Error('Overseas private backup hash mismatch');
    fs.writeFileSync(path.join(root,file),text);changed.push({file,hash:hash(before),bytes:before.length});bytes+=before.length;
  }
  const audit={at:new Date().toISOString(),changed,bytes,restoration:'Private immutable originals by SHA256; never upload archive or publish historical raw data'};
  const f=access.privatePath(root,'archive-manifests/'+hash(JSON.stringify(changed))+'.json');fs.mkdirSync(path.dirname(f),{recursive:true});if(changed.length)fs.writeFileSync(f,JSON.stringify(audit));
  return {status:'permission-wait',changed:changed.length,privatelyPreservedBytes:bytes};
}
function privateLeaks(value,trail=''){
  if(!value||typeof value!=='object')return [];
  if(value.schema==='private-overseas-analysis-v1'||value.usage==='private-only')return [trail+'.private-only'];
  return Object.entries(value).flatMap(([key,v])=>{
    const at=trail+'.'+key;
    if(v!==null&&['string','number'].includes(typeof v)&&(/^(?:foreignJpy|gapPct|overseasGapPct|overseasDecisionLabel)$/.test(key)
      || /^(?:api[_-]?key|api[_-]?token|authorization)$/i.test(key)&&String(v).trim()))return [at];
    return typeof v==='object'?privateLeaks(v,at):[];
  });
}
function verify(root=ROOT,{staged=false}={}){
  const publicAllowed=access.allowed(root,'public');
  const names=staged?cp.execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean):files(root);
  const bad=[];let checked=0;
  if(staged){
    const unstaged=cp.execFileSync('git',['diff','--name-only','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(f=>f.endsWith('.json'));
    if(unstaged.length)throw Error('Stage current sanitized JSON before publication: '+unstaged.slice(0,5).join(', '));
  }
  for(const file of names){
    if(/^\.private\//.test(file)){bad.push(file);continue;}
    if(/\.html?$/.test(file)&&fs.readFileSync(path.join(root,file),'utf8').includes('data-private-overseas="true"')){bad.push(file);continue;}
    if(!file.endsWith('.json'))continue;
    let value;try{value=JSON.parse(fs.readFileSync(path.join(root,file)));}catch{if(staged||file.startsWith('data/'))throw Error('Invalid JSON; publication stopped: '+file);continue;}
    checked++;
    if(privateLeaks(value).length||!publicAllowed&&(restricted(file)&&JSON.stringify(project(file,value))!==JSON.stringify(value)||priceLeaks(value).length))bad.push(file);
  }
  if(bad.length)throw Error('Unlicensed overseas prices/raw in publication: '+bad.slice(0,12).join(', '));return {checked};
}
if(require.main===module){try{console.log(JSON.stringify(process.argv.includes('--verify')?verify(ROOT,{staged:process.argv.includes('--staged')}):enforce()));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={enforce,verify,project,restricted,priceLeaks,privateLeaks};
