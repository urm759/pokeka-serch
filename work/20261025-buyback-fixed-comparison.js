const fs=require('fs'),e=require('./build_priority_search_targets'),v=require('./search_profile_variants');
const config=require('./priority-search-profiles.json'),after=require('../data/priority-search-profile-audit.json');
const profiles=v.searchModeProfiles(config),pairs=[];
for(const p of profiles) {
  const expected=after.profiles.find(r=>r.urlOnly.id===p.id).urlOnly;
  const inspected=[...new Set([...expected.ids,'pk-2699','pk-38392','pk-63635','pk-1506','pk-43864','x-122054'])];
  const before=e.isolatedEvaluation(p,after.at,inspected,{dataRef:'9b594b3f',collectAvailability:false});
  const current=e.isolatedEvaluation(p,after.at,inspected,{collectAvailability:false});
  const gained=current.ids.filter(id=>!before.ids.includes(id)),lost=before.ids.filter(id=>!current.ids.includes(id));
  const pair={id:p.id,urlHash:current.urlHash,at:after.at,beforeIds:before.ids,afterIds:current.ids,gained,lost,
    details:[...new Set([...gained,...lost,'pk-43864','x-122054'])].map(id=>({id,before:before.inspectedRows[id],after:current.inspectedRows[id]}))};
  pairs.push(pair);fs.writeFileSync('work/20261025-buyback-fixed-comparison.json',JSON.stringify({baseline:'9b594b3f',sameCode:true,sameClock:true,at:after.at,pairs}));
  console.log(JSON.stringify({id:p.id,before:before.ids.length,after:current.ids.length,gained,lost}));
}
