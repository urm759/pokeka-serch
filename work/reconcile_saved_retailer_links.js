// Link identity only from retained catalogs. Never copy prices/stock or advance
// their observation times; an access hold still prevents future acquisition.
const fs=require('node:fs'),path=require('node:path');
const parser=require('./update_cardrush_links'),identity=require('./card_identity');
function signature(row){
  const s=parser.extractCardrushComponents(row);
  if(!s.base||!s.setCode||!s.cardNo||!s.rarity)return null;
  return [s.setCode.toUpperCase(),s.cardNo,s.rarity,parser.normalizeLooseText(s.base),s.finish,
    identity.extractVariant(row.name),identity.variantFrom(row.name),
    ['ja','en','ko','zh','id'].includes(row.language)?row.language:identity.extractLanguage(row.name)].join('|');
}
function reconcile(cards,rows,{now=Date.now(),invalidUrls=[],holds={}}={}){
  const byKey=new Map(),cardKeys=new Map(),owners=new Map(),invalid=new Set(invalidUrls),links=[];
  for(const c of cards){const k=signature(c);if(k){const ids=cardKeys.get(k)||new Set();ids.add(c.id);cardKeys.set(k,ids);}
    if(c.cardrushUrl){const ids=owners.get(c.cardrushUrl)||new Set();ids.add(c.id);owners.set(c.cardrushUrl,ids);}}
  for(const row of rows){
    let u;try{u=new URL(row.detailUrl);}catch{continue;}
    const at=Date.parse(row.observedAt||'');
    if(row.state!=='A'||row.referenceOnly||row.conditionAccepted===false||row.cardMismatchSuspected||row.priceQuarantined||row.identityVerified===false
      ||row.matchStatus==='mismatch'||row.identityHoldReason||invalid.has(row.detailUrl)
      ||u.protocol!=='https:'||u.hostname!=='www.cardrush-pokemon.jp'||!/^\/product\/\d+$/.test(u.pathname)||u.search||u.hash
      ||!Number.isFinite(at)||at>now||/(?:PSA|BGS|CGC|ARS|ACE|TAG)\s*\d|鑑定品|特価|傷あり|状態A[-−]|未開封|セット商品/i.test(row.name||''))continue;
    const key=signature(row);if(!key)continue;
    const list=byKey.get(key)||[];list.push(row);byKey.set(key,list);
  }
  const updated=cards.map(c=>{
    if(c.cardrushLinkEvidence?.reviewRequired)return c;
    if(c.cardrushUrl&&c.cardrushLinkEvidence?.source==='cardrush-retained-catalog'){
      const observed=rows.filter(r=>r.detailUrl===c.cardrushUrl&&signature(r));
      if(observed.some(r=>signature(r)!==c.cardrushLinkEvidence.signature)){
        const next={...c,cardrushLinkEvidence:{...c.cardrushLinkEvidence,previousUrl:c.cardrushUrl,reviewRequired:true,
          reason:'保存済み商品の仕様変更・矛盾。原価格/日時を保持し、再確認まで自動再紐付けしない'}};
        delete next.cardrushUrl;return next;
      }
    }
    if(c.cardrushUrl||c.manualReview||c.identityReviewRequired||holds[c.id])return c;
    const key=signature(c),candidates=byKey.get(key)||[],urls=[...new Set(candidates.map(r=>r.detailUrl))];
    if(!key||cardKeys.get(key)?.size!==1||urls.length!==1||owners.has(urls[0]))return c;
    const candidatesForUrl=candidates.filter(r=>r.detailUrl===urls[0]);
    if(candidatesForUrl.some(r=>r.cardId&&r.cardId!==c.id))return c;
    const row=candidatesForUrl.sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0];
    if(require('./quarantine_shop_identity').reason(c,row.name))return c;
    const evidence={source:'cardrush-retained-catalog',sourceObservedAt:row.observedAt,
      identityVerifiedAt:new Date(now).toISOString(),signature:key,priceRecovered:false};
    owners.set(row.detailUrl,new Set([c.id]));links.push({id:c.id,url:row.detailUrl,...evidence});
    return {...c,cardrushUrl:row.detailUrl,cardrushLinkEvidence:evidence};
  });
  return {cards:updated,links,sourceRequests:0,pricesRecovered:0};
}
function run(root=path.join(__dirname,'..')){
  const read=(f,fallback)=>{const p=path.join(root,f);return fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):fallback;};
  const cards=read('data/pokemon-cards.json',[]),rows=read('work/cardrush_catalog.json',[]);
  const result=reconcile(cards,rows,{invalidUrls:read('work/cardrush_invalid_urls.json',[]),
    holds:read('work/candidate-shop-refresh.json',{}).checkpoints?.cardrush?.manualWait||{}});
  const changedCards=result.cards.filter((c,i)=>c!==cards[i]).length;
  if(changedCards)require('./acquisition_retry').atomicWrite(path.join(root,'data/pokemon-cards.json'),result.cards,0);
  return {changedCards,newLinks:result.links.length,links:result.links,sourceRequests:0,pricesRecovered:0};
}
if(require.main===module)console.log(JSON.stringify(run()));
module.exports={signature,reconcile,run};
