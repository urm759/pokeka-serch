const fs=require('node:fs'),path=require('node:path');
const IDS=['x-106796',...Array.from({length:9},(_,i)=>'x-'+(122054+i))];
function evaluate(profile,at,inspectIds=[]){
 const api=require('./audit_search_profit_consistency').load(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),at,{url:profile.url,fixedModelClock:true});
 // Relative store and market rankings must use the full population, not the ten-card subset.
 const all=api.prepareCalculatedCards(api.state.cards),rows=all.filter(c=>IDS.includes(c.id)).map(c=>{
   const facts=require('./profile_candidate_evidence').cardFacts(api,c),profit=api.searchProfitView(c),eff=api.cardEfficiency(c);
   return {id:c.id,name:c.name,qualified:facts.exclusions.length===0,buy:eff.purchasePrice,buyBasis:eff.basis,psa9Price:facts.psa9.price,psa9Ratio:facts.psa9.ratio,psa10Price:c.psa10,psa10Roi:profit.psa10Roi,profit:eff.profit,annualEfficiency:eff.annual,lockDays:eff.days,exit:eff.exitLabel,reasons:facts.exclusions,facts};
 });
 if(rows.length!==10)throw Error('NAGABA specifications missing or duplicated');
 return {id:profile.id,name:profile.reportName,url:profile.url,at,rows,candidateIds:all.filter(c=>api.cardSearchExclusions(c).length===0).map(c=>c.id),inspectedFacts:Object.fromEntries(all.filter(c=>inspectIds.includes(c.id)).map(c=>[c.id,require('./profile_candidate_evidence').cardFacts(api,c)])),settings:{fee:api.state.fee,lockDays:api.state.lockDays,buyBasis:api.state.efficiencyBuy,mode:api.state.purchaseMode},sourceRequests:0};
}
if(require.main===module){const input=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(evaluate(input.profile,input.at,input.inspectIds||[])));}
module.exports={evaluate,IDS};
