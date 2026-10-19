const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const baseline=JSON.parse(fs.readFileSync('.private/condition-reference/baseline.json'));
const beforeCode=cp.execFileSync('git',['show',`${baseline.head}:app.js`],{encoding:'utf8',maxBuffer:16000000});
const afterCode=fs.readFileSync('app.js','utf8'),at=new Date().toISOString(),cache=new Map();
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function evaluate(code,p,dataRef=null,time=at){
  const api=require('./audit_search_profit_consistency').load(code,time,{url:p.url,dataRef});
  const key=(dataRef||'current')+':'+api.computationKey()+':'+time;
  let cards=cache.get(key);if(!cards){cards=api.prepareCalculatedCards(api.state.cards);cache.set(key,cards);}
  const target=cards.find(c=>c.id==='x-106796');
  return {ids:cards.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id),
    hash:digest(cards.map(c=>[c.id,c.buyLimits,c.purchaseDecision])),
    target:require('./profile_candidate_evidence').cardFacts(api,target),
    targetEfficiency:api.cardEfficiency(target),targetExclusions:api.cardSearchExclusions(target)};
}
const profiles=[];
for(const p of require('./search_profile_variants').allProfiles(require('./priority-search-profiles.json'))){
  const before=evaluate(beforeCode,p,baseline.head),sameDataOld=evaluate(beforeCode,p),after=evaluate(afterCode,p);
  assert.equal(sameDataOld.hash,after.hash,'presentation does not alter calculation or GO');
  assert.deepEqual(sameDataOld.ids,after.ids,'same current data and time keep candidate IDs');
  profiles.push({id:p.id,before:before.ids,after:after.ids,gained:after.ids.filter(id=>!before.ids.includes(id)),lost:before.ids.filter(id=>!after.ids.includes(id)),
    sameDataCodeUnchanged:true,nagaba:after.target,nagabaEfficiency:after.targetEfficiency,nagabaExclusions:after.targetExclusions});
}
const delta=require('./audit_completion_outcomes').compare(baseline.completion,require('./audit_completion_outcomes').snapshot(process.cwd()));
const rarity=require('../data/modern-high-rarity-audit.json').readiness2020.srFamily;
const report={at,baselineAt:baseline.at,baselineCommit:baseline.head,profiles,delta,
  independent:{before:new Set(profiles.flatMap(p=>p.before)).size,after:new Set(profiles.flatMap(p=>p.after)).size},
  reference:require('../data/raw-condition-reference-summary.json'),correctedPackagingHolds:require('../data/shop-identity-quarantine.json').corrections.length,
  readiness:{listed:rarity.listed,analyzable:rarity.analyzable,analysisPct:rarity.analysisPct,unknown:rarity.unknown},
  note:'同一時刻の旧保存データ/現在データ比較と、同一現在データの旧コード/新コード比較を分離。参考分離/再集計を実取得の純増に数えない。定期成功は別実証。'};
fs.writeFileSync('work/20261019-compact-reference-outcomes.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({profiles:profiles.map(p=>({id:p.id,before:p.before.length,after:p.after.length,gained:p.gained,lost:p.lost,nagaba:p.nagabaExclusions})),delta,independent:report.independent,readiness:report.readiness}));
