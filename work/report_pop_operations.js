const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=require('node:path').join(__dirname,'..'),read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const {load}=require('./audit_search_profit_consistency'),outcomes=require('./audit_completion_outcomes');
function build(){
  const at=new Date().toISOString(),baseline='59e28a14';
  const old=cp.execFileSync('git',['show',baseline+':app.js'],{encoding:'utf8',maxBuffer:8e6}),source=fs.readFileSync('app.js','utf8');
  const cache=new Map(),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
  const profiles=[];
  for(const p of require('./search_profile_variants').allProfiles(read('work/priority-search-profiles.json'))){
    const before=load(old,at,{url:p.url}),after=load(source,at,{url:p.url});
    const calc=(api,which)=>{const key=which+api.computationKey();if(!cache.has(key))cache.set(key,api.prepareCalculatedCards(api.state.cards));return cache.get(key);};
    const b=calc(before,'old'),a=calc(after,'new');
    const finances=rows=>hash(rows.map(c=>[c.id,c.buyLimits,c.purchaseDecision]));
    assert.equal(finances(b),finances(a),'POP display must not change buying calculations or GO');
    const ids=(api,rows)=>rows.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id);
    assert.deepEqual(ids(before,b),ids(after,a),'fixed-condition IDs must not change with display code');
    profiles.push({id:p.id,ids:ids(after,a),financialHash:finances(a),codeOnlyDifference:0});
  }
  const before=outcomes.unpack(read('work/20261018-pop-before-completion.json')),after=outcomes.snapshot(root);
  const prior=read('work/20261018-pop-before-profiles.json').profiles;
  const oldIds=new Set(prior.flatMap(p=>p.urlOnly.ids)),ids=new Set(profiles.flatMap(p=>p.ids));
  const result={at,baseline,profiles,independentCandidates:{before:oldIds.size,after:ids.size,gained:[...ids].filter(id=>!oldIds.has(id)),lost:[...oldIds].filter(id=>!ids.has(id))},
    delta:outcomes.compare(before,after),cohortBefore:read('work/20261018-pop-before-rarity.json').readiness2020,
    cohortAfter:read('data/modern-high-rarity-audit.json').readiness2020,
    popGlance:require('./build_psa_pop_glance').build(root),
    latestFreshness:read('data/priority-price-monitor.json').fixedCohortFreshness.sources.hareruya2.latest,
    llmCalls:0,codexCalls:0,note:'表示・分類母数の訂正と、実取得による不足補完を分離。現行4条件/GO不変更。手動取得と将来の定期成功は別。'};
  fs.writeFileSync('data/pop-operations-outcomes.json',JSON.stringify(result));
  console.log(JSON.stringify({delta:result.delta,independent:result.independentCandidates,profiles:profiles.map(p=>({id:p.id,count:p.ids.length})),glance:result.popGlance}));
}
if(require.main===module)build();module.exports={build};
