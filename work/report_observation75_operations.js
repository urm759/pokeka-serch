const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {load}=require('./audit_search_profit_consistency'),outcomes=require('./audit_completion_outcomes');
const root=require('node:path').join(__dirname,'..'),read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
function build() {
  const at=new Date().toISOString(),base='9663bbe9';
  const source=fs.readFileSync('app.js','utf8'),old=cp.execFileSync('git',['show',base+':app.js'],{encoding:'utf8',maxBuffer:8e6});
  const m={exports:{}};new Function('module',cp.execFileSync('git',['show',base+':exploration-metrics.js'],{encoding:'utf8',maxBuffer:8e6}))(m);
  const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
  const profiles=[];
  const calculations=new Map();
  const calculate=(api,version)=>{const key=version+':'+api.computationKey();if(!calculations.has(key))calculations.set(key,api.prepareCalculatedCards(api.state.cards));return calculations.get(key);};
  for(const p of require('./search_profile_variants').allProfiles(read('work/priority-search-profiles.json'))) {
    const before=load(old,at,{url:p.url,explorationMetrics:m.exports}),after=load(source,at,{url:p.url});
    const b=calculate(before,'before'),a=calculate(after,'after');
    const finances=cards=>hash(cards.map(c=>[c.id,c.buyLimits,c.purchaseDecision]));
    assert.equal(finances(b),finances(a),'unselected observation comparison cannot change production finances/GO');
    const ids=(api,cards)=>cards.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id);
    assert.deepEqual(ids(before,b),ids(after,a),'fixed A/B conditions unchanged');
    profiles.push({id:p.id,ids:ids(after,a),financialHash:finances(a),codeOnlyDifference:0});
  }
  const before=outcomes.unpack(read('work/20261018-before-completion.json')),after=outcomes.snapshot(root);
  const filledByField={},filledExamples=[];
  for(const [id,row]of Object.entries(after.rows)){
    const old=before.rows[id];if(!old)continue;
    const fields=row.fields.filter(f=>!old.fields.includes(f)&&!['psa9Evidence','buybackExitEvidence'].includes(f));
    for(const field of fields)filledByField[field]=(filledByField[field]||0)+1;
    if(fields.some(f=>f!=='release'))filledExamples.push({id,fields});
  }
  const prior=JSON.parse(cp.execFileSync('git',['show','8f718187:data/observation75-operations.json'],{encoding:'utf8',maxBuffer:8e6})).profiles;
  const previousIds=new Set(prior.flatMap(p=>p.ids)),currentIds=new Set(profiles.flatMap(p=>p.ids));
  const acquired=JSON.parse(cp.execFileSync('git',['show','8f718187:work/candidate-shop-refresh.json'],{encoding:'utf8',maxBuffer:8e6})).sources.hareruya2;
  const result={at,baseline:base,comparison:'同一の最新データ・URL全項目・評価時刻。75日を未選択の既存4条件',profiles,
    dataDelta:outcomes.compare(before,after),filledByField,filledExamples,
    independentCandidates:{before:previousIds.size,after:currentIds.size,gained:[...currentIds].filter(id=>!previousIds.has(id)),lost:[...previousIds].filter(id=>!currentIds.has(id))},
    dataScope:'今回の手動取得と再開中にmainへ届いた定期/PC保存データを含む。日付補完と必須不足補完は分離。',
    manualAcquisitionEvidence:'8f718187:work/candidate-shop-refresh.json',newSourceAcquisition:{purchaseAttempted:acquired.attemptedCount,purchaseConfirmed:acquired.refreshedCount,
      http:acquired.httpRequests,durationMs:acquired.durationMs,newLinks:acquired.newLinkedCount,newPrices:acquired.newAcquiredCount},
    releaseEvidence:['https://www.pokemon-card.com/ex/mc/','https://www.30th.pokemon-card.com/product/m6a'],
    readiness2020:read('data/modern-high-rarity-audit.json').readiness2020,
    fixedFreshness:read('data/priority-price-monitor.json').fixedCohortFreshness.sources.hareruya2.latest,
    llmCalls:0,codexCalls:0,notes:['399枚の発売日根拠補完を必須不足解消や新規分析可能と混同しない','今回の手動取得と修正版の次回定期成功は別','平均・海外表示は上限やGOへ不使用。真の欠損・買取不足・仕様保留は維持']};
  fs.writeFileSync('data/observation75-operations.json',JSON.stringify(result));
  console.log(JSON.stringify({profiles:profiles.map(p=>({id:p.id,count:p.ids.length})),dataDelta:result.dataDelta}));
}
if(require.main===module)build();
module.exports={build};
