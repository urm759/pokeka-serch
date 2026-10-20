const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const base=process.argv[2],at=new Date().toISOString();
if(!/^[a-f0-9]{7,40}$/.test(base||''))throw Error('Explicit comparison commit required');
const old=cp.execFileSync('git',['show',base+':app.js'],{encoding:'utf8',maxBuffer:16e6}),current=fs.readFileSync('app.js','utf8');
const profiles=require('./search_profile_variants').allProfiles(require('./priority-search-profiles.json'));
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function evaluate(code,p,dataRef=null){
  const api=require('./audit_search_profit_consistency').load(code,at,{url:p.url,dataRef}),cards=api.prepareCalculatedCards(api.state.cards);
  return {ids:cards.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id),hash:hash(cards.map(c=>[c.id,c.buyLimits,c.purchaseDecision]))};
}
const comparisons=profiles.map(p=>{const before=evaluate(old,p),after=evaluate(current,p),prior=evaluate(old,p,base);
  assert.deepEqual(after,before,'demand display must not change candidate IDs or limits/GO');
  return {id:p.id,count:after.ids.length,ids:after.ids,calculationHash:after.hash,unchanged:true,priorData:prior.ids,
    returned:after.ids.filter(id=>!prior.ids.includes(id)),lost:prior.ids.filter(id=>!after.ids.includes(id))};});
const summary=require('../data/buyback-observation-summary.json'),m=require('../exploration-metrics'),cards=require('../data/pokemon-cards.json'),examples=[];
let valid=0,compared=0,hiddenMaximum=0;
for(const c of cards){const v=m.buybackSupport(summary,c.id,'all',[],Date.parse(at),c.snkPsa10Price,c.identityKey),q=v.highestQuote;if(!q)continue;
  valid++;if(q.samples>=10)compared++;if(q.ratio>v.max)hiddenMaximum++;
  if(q.samples>=10)examples.push({id:c.id,name:c.name,shop:q.name,fulfilment:q.fulfilment,ratio:q.ratio,normal:q.standard,premium:q.premium,topPct:q.topPct,samples:q.samples,at:q.at});
}
const result={at,base,profiles:comparisons,independent:new Set(comparisons.flatMap(p=>p.ids)).size,validCurrentCards:valid,peerComparedCards:compared,
  higherThanConservativeMaximum:hiddenMaximum,examples:examples.sort((a,b)=>b.ratio-a.ratio).slice(0,10),
  note:'同一データ/時刻/固定4条件のコード差。表示追加/再集計は新規取得・補完・初適合ではない。'};
fs.writeFileSync('work/20261020-highest-buyback-outcomes.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,profiles:comparisons.map(p=>({id:p.id,count:p.count,unchanged:p.unchanged})),examples:result.examples.slice(0,3)}));
