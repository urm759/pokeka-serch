const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const {load}=require('./audit_search_profit_consistency');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function compare(ref='ec8ab3cc',at=new Date().toISOString()) {
  const sources=[cp.execFileSync('git',['show',ref+':app.js'],{encoding:'utf8',maxBuffer:12e6}),fs.readFileSync('app.js','utf8')];
  const profiles=require('./priority-search-profiles.json').profiles,results=[];
  for(const source of sources) {
    const result={};
    for(const profile of profiles) {
      const api=load(source,at,{url:profile.url,fixedModelClock:true}),cards=api.prepareCalculatedCards(api.state.cards);
      const financialHash=hash(cards.map(c=>[c.id,c.buyLimits,c.purchaseDecision]));
      for(const median of [false,true]) {
        api.state.efficiencyBuy=median?'median':'auto';
        result[profile.id+(median?'-median':'')]={ids:cards.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id),financialHash};
      }
    }
    results.push(result);
  }
  const rows=Object.keys(results[0]).map(id=>({id,count:results[1][id].ids.length,idsEqual:hash(results[0][id].ids)===hash(results[1][id].ids),
    financialEqual:results[0][id].financialHash===results[1][id].financialHash,ids:results[1][id].ids}));
  const result={ref,at,sameData:true,sameClock:true,rows,passed:rows.every(r=>r.idsEqual&&r.financialEqual)};
  require('./acquisition_retry').atomicWrite('work/display-revision-comparison.json',result,0);
  if(!result.passed)throw Error('Unintended financial/candidate difference');
  console.log(JSON.stringify(result));return result;
}
if(require.main===module)compare(process.argv[2]);
module.exports={compare};
