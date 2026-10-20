const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base=process.argv[2],at=new Date().toISOString();
const output=process.argv[3] || 'work/20261020-buyback-search-outcomes.json';
if(!/^[a-f0-9]{7,40}$/.test(base||''))throw Error('Explicit baseline commit required');
if(!/^work\/[a-zA-Z0-9_-]+\.json$/.test(output))throw Error('Report path must stay inside work');
const oldFile=file=>JSON.parse(cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8',maxBuffer:64e6}));
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const before=cp.execFileSync('git',['show',base+':app.js'],{encoding:'utf8',maxBuffer:16e6}),after=fs.readFileSync('app.js','utf8');
const evaluate=(code,p,dataRef)=>{
  const api=require('./audit_search_profit_consistency').load(code,at,{url:p.url,dataRef});
  const cards=api.prepareCalculatedCards(api.state.cards);
  const ids=()=>cards.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id);
  const original=ids(),financeHash=crypto.createHash('sha256').update(JSON.stringify(cards.map(c=>[c.id,c.buyLimits,c.purchaseDecision]))).digest('hex');
  const thresholds={};for(const n of [1,1.05]){api.state.buybackHighestMin=n;thresholds[n]=ids();}
  return {ids:original,financeHash,thresholds};
};
const profiles=require('./search_profile_variants').allProfiles(read('work/priority-search-profiles.json')).map(p=>{
  const old=evaluate(before,p),current=evaluate(after,p),prior=evaluate(before,p,base);
  assert.deepEqual(current.ids,old.ids,'no threshold specified: candidate IDs unchanged');
  assert.equal(current.financeHash,old.financeHash,'demand filter must not change limits/GO');
  return {id:p.id,count:current.ids.length,ids:current.ids,unchanged:true,financeHash:current.financeHash,
    addedByData:current.ids.filter(id=>!prior.ids.includes(id)),lostByData:prior.ids.filter(id=>!current.ids.includes(id)),thresholds:current.thresholds};
});
const oldCards=oldFile('data/pokemon-cards.json'),cards=read('data/pokemon-cards.json');
const previous=oldFile('data/card-catalog-completion.json'),current=read('data/card-catalog-completion.json');
const newlyAnalyzable=cards.filter(c=>current.cards[c.id]?.s==='分析可能'&&previous.cards[c.id]?.s!=='分析可能').map(c=>c.id);
const filled=cards.filter(c=>(previous.cards[c.id]?.m||[]).some(f=>!(current.cards[c.id]?.m||[]).includes(f))).map(c=>c.id);
const oldShop=oldFile('data/hareruya2-stock-summary.json').cards||{},shop=read('data/hareruya2-stock-summary.json').cards||{};
const time=row=>Date.parse(row?.observedAt||row?.updatedAt||'');
const fresh=(r,t)=>r?.hareruya2Price>0&&r.available===true&&r.stock>0&&r.identityVerified===true&&!r.cardMismatchSuspected
  && Number.isFinite(time(r))&&time(r)<=t&&t-time(r)<=48*3600000
  && Number.isFinite(Date.parse(r.inventoryObservedAt))&&Date.parse(r.inventoryObservedAt)<=t&&t-Date.parse(r.inventoryObservedAt)<=48*3600000;
const freshRestored=Object.keys(shop).filter(id=>fresh(shop[id],Date.parse(at))&&!fresh(oldShop[id],Date.parse(at)));
const report={at,base,profiles,independent:new Set(profiles.flatMap(p=>p.ids)).size,
  listedAdded:cards.filter(c=>!oldCards.some(old=>old.id===c.id)).map(c=>c.id),filled,newlyAnalyzable,freshRestored,
  pop:((p)=>({catalog:p.catalog,official:p.official,comparable:p.comparable,reasons:p.reasons,fresh:p.fresh,stale:p.stale}))(read('data/psa-pop-coverage.json')),
  highRarity:((r)=>({listed:r.srFamily.listed,analyzable:r.srFamily.analyzable,listingPct:r.srFamily.listingPct,analysisPct:r.srFamily.analysisPct,unknown:r.srFamily.unknown,availability:r.requiredAvailability}))(read('data/modern-high-rarity-audit.json').readiness2020),
  freshness:read('data/priority-price-monitor.json').fixedCohortFreshness?.sources?.hareruya2,
  note:'同じ現在データ・時刻で未指定時の旧/新コードを比較。差分取得・再確認・独立初適合は別。過去適合の有無は既存サイクル監査を確認する。'};
fs.writeFileSync(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,profiles:profiles.map(p=>({...p,ids:undefined,thresholds:Object.fromEntries(Object.entries(p.thresholds).map(([n,ids])=>[n,ids.length]))})),freshness:undefined}));
