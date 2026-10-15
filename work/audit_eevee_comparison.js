const fs=require('node:fs'),assert=require('node:assert/strict');
const {load}=require('./audit_search_profit_consistency');
function isEeveeVSa(card){return /^S6A$/i.test(card.setCode||'')&&/V\s+SR\s*[:：]\s*SA\s*\[/i.test(card.name||'')&&!/VMAX/i.test(card.name);}
function build(phase='after'){
  const at=new Date().toISOString(),source=fs.readFileSync('app.js','utf8');
  const definitions=require('./search_profile_variants').allProfiles(JSON.parse(fs.readFileSync('work/priority-search-profiles.json')));
  const profiles=definitions.map(p=>{
    const api=load(source,at,{url:p.url}),cards=api.prepareCalculatedCards(api.state.cards).filter(isEeveeVSa);
    assert.equal(cards.length,8,'Only S6a V SR special-art eight species, not normal SR or VMAX');
    return {id:p.id,settings:{url:p.url,buyBasis:api.state.efficiencyBuy,fee:api.state.fee,exitPolicy:api.state.exitPolicy,lockDays:api.state.lockDays},cards:cards.map(c=>{
      const e=api.cardEfficiency(c),actual=api.cardEfficiency(c,Date.parse(at),api.state.purchaseMode,'current','store'),v=api.currentMarketView(c);
      const exclusions=api.cardSearchExclusions(c),reasons=[...new Set([...(e.blockingReasons||[]),...exclusions])];
      return {id:c.id,name:c.name,setCode:c.setCode,cardNumber:c.cardNumber,median:c.priceAggregation?.value,medianEvidence:e.medianEvidence||require('../exploration-metrics').referenceMedian(c,Date.parse(at)),
        store:c.currentStoreOffer||null,psa10:c.snkPsa10Price,psa9:c.snkPsa9Price,psa9Type:v.psa9Type,psa9ObservedAt:c.psa9ObservedAt,
        official:c.official,assumedRate:v.assumedRate,exit:v.exitLabel,selectedEfficiency:e,actualStoreEfficiency:actual,
        qualified:exclusions.length===0,exclusions,purchaseDecision:c.purchaseDecision,
        reasonGroups:{profit:reasons.filter(r=>/利益|効率|比率|価格範囲|価格帯|プリセット/.test(r)),
          freshnessOrMissing:reasons.filter(r=>/古値|日時|期限|未取得|不足|未確認|期間不一致/.test(r)),
          identityOrConflict:reasons.filter(r=>/仕様|紐付|対立|異常|手動/.test(r))}};
    })};
  });
  const ids=profiles[0].cards.map(c=>c.id).sort();
  fs.writeFileSync('work/comparison-price-targets.json',JSON.stringify({version:1,at,group:'S6a V SR SA eight-species requested comparison',ids,
    role:'Existing independent shop quota only. Never change financial or GO rules. Blocked origins remain stopped.'}));
  const out={version:1,at,phase,profiles,note:'All eight at one time/settings per profile. Profiles differ only as their saved URLs specify. Listing, analysis, qualification and GO are distinct. No price or probability inferred.'};
  fs.writeFileSync(phase==='before'?'work/eevee-comparison-before.json':'data/eevee-comparison-audit.json',JSON.stringify(out));
  console.log(JSON.stringify({at,phase,profiles:profiles.map(p=>({id:p.id,cards:p.cards.length,qualified:p.cards.filter(c=>c.qualified).map(c=>c.id)}))}));return out;
}
if(require.main===module)build(process.argv[2]);module.exports={build,isEeveeVSa};
