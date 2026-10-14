const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const outcomes=require('./audit_completion_outcomes');
const root=path.join(__dirname,'..'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const hash=v=>crypto.createHash('sha256').update(v.toString('utf8').replace(/\r\n/g,'\n')).digest('hex');
const git=f=>cp.execFileSync('git',['show',`e8a1ceb2:${f}`],{cwd:root,maxBuffer:64e6});
const baseline=read('work/search-profile-cycle-baseline-targeted.json');
const after=outcomes.snapshot(root),before=outcomes.unpack(baseline.snapshot);
const cycle=read('data/search-profile-cycle-progress.json').cycles.find(r=>r.key==='targeted'&&r.baselineAt===baseline.at);
if(!cycle)throw Error('Missing fixed-profile acquisition comparison');
const config=read('work/priority-search-profiles.json');
const oldConfig=JSON.parse(git('work/priority-search-profiles.json'));
if(config.profiles.some(p=>oldConfig.profiles.find(r=>r.id===p.id)?.url!==p.url))throw Error('Fixed URL changed');
const files=['app.js','decision-model.js','current-market-model.js','exploration-metrics.js','index.html','styles.css'];
const unchanged=Object.fromEntries(files.map(f=>[f,hash(git(f))===hash(fs.readFileSync(path.join(root,f)))]));
if(Object.values(unchanged).some(v=>!v))throw Error('Frontend or decision model changed');
const psa=read('work/psa-fetch-progress.json'),discovery=read('data/state-a-url-discovery.json');
const shop=read('data/completion-acquisition.json'),completion=read('data/card-catalog-completion.json');
const catalogue=read('data/pokemon-cards.json'),names=new Map(catalogue.map(c=>[c.id,c.name]));
const overall=outcomes.compare(before,after);
const acquisitionFilledIds=Object.keys(after.rows).filter(id=>before.rows[id]&&['psaOfficial','hareruya2'].some(s=>after.rows[id].sources[s]?.valid&&!before.rows[id].sources[s]?.valid));
const newlyAnalyzable=Object.entries(after.rows).filter(([id,r])=>r.analysis&&!before.rows[id]?.analysis).map(([id])=>({id,name:names.get(id)}));
const monitor=read('data/priority-price-monitor.json').fixedCohortFreshness;
let browserPerformance=null;
if(fs.existsSync(path.join(root,'work/fixed-profile-browser-raw.json'))){
  const samples=read('work/fixed-profile-browser-raw.json'),median=xs=>xs.slice().sort((a,b)=>a-b)[Math.floor(xs.length/2)];
  if(samples.length!==8)throw Error('Incomplete browser comparison');
  const measure=r=>({fullCalculationMs:median(r.samples.map(s=>s.full.calculationMs)),conditionDomMs:median(r.samples.map(s=>s.condition.domMs)),
    detailDomMs:median(r.samples.map(s=>s.detail.domMs)),initialJsonBytes:r.initialJsonBytes,jsonParseMs:r.jsonParseMs,transferredBytes:r.transferredBytes});
  browserPerformance=[];
  for(const width of [1440,390])for(const double of [false,true]){
    const b=samples.find(r=>r.width===width&&r.mode===(double?'before-double':'before'));
    const a=samples.find(r=>r.width===width&&r.mode===(double?'double':'after'));
    if(!a||!b||a.financialHash!==b.financialHash||JSON.stringify(a.ids)!==JSON.stringify(b.ids)||a.displayed!==60)throw Error('Browser calculation/ID mismatch');
    browserPerformance.push({width,double,loaded:a.loadedCards,before:measure(b),after:measure(a),financialHash:a.financialHash,idsEqual:true});
  }
}
const report={version:1,generatedAt:after.at,baselineAt:baseline.at,baselineCommit:'e8a1ceb2',
  unchangedFrontendAndModel:unchanged,fixedUrlsUnchanged:true,
  approvedSavedOverlay:config.knownSavedOverlay,historicalValidationOverlay:config.historicalSavedOverlay,
  profiles:cycle.profiles,overall,newlyAnalyzable,acquisitionFilledIds,
  acquisitionFilledCards:acquisitionFilledIds.length,
  availabilityOnlyNote:'必須取得済みフラグ163のうち店舗4は既存材料の再集計。新規店舗価格3とPSA有効純増159は実取得証拠で別計上し、163を実補完成果と呼ばない。',
  acquisition:{psa:{sets:psa.attemptedCount,rows:psa.refreshedCount,newRaw:psa.newAcquiredCount,changedRaw:psa.changedCount,
    durationMs:psa.durationMs,selection:psa.selectedLanes,status:psa.status,mode:'manual-authenticated-Chrome',
    validDomesticNet:overall.sources.psaOfficial.usableNet},
    productDiscovery:{attempted:discovery.attempted,newUrls:discovery.newLinked,httpRequests:discovery.httpRequests,
      cacheHits:discovery.cacheHits,durationMs:discovery.durationMs},
    purchase:{attempted:shop.attempted,acquired:shop.acquired,newAcquired:shop.newAcquired,failures:shop.failures,durationMs:shop.durationMs},
    buyback:{source:'cardshop151-store',items:376,matched:256,active:255,unmatched:120,
      note:'今回の1店舗実取得。未照合120を未掲載と断定せず、他店舗の正常値と停止理由を保持。A/Bの2店舗出口復帰0。'},
    newCards:{httpRequests:1,cacheHits:1,newListed:0,processed:0,reason:'HTTP 304・価格再確認/観測日数増加ではない'}},
  current:{catalogue:catalogue.length,analyzable:completion.summary.analyzable,oneAway:completion.summary.completableAfterNext,
    routes:read('data/one-item-completion-audit.json').byRoute},
  freshness:{fixedCohort:monitor,warning:'取得後の鮮度回復と定期維持は別。区間最低は前回値の保守的推計。今回の3購入価格は固定192群の回復とは別。'},
  scheduled:{evidence:read('data/scheduled-execution-audit.json'),newCodeFirstScheduledSuccess:'未実証・次回非AI受領証で記録。手動PSA/店舗取得で代用しない'},
  browserPerformance,
  residuals:['国内PSA9・状態A個別実成約: 未実装/正規取得許諾待ち','認証PokeDATA実価格不足','カードラッシュ・遊々亭・料金403: 停止維持',
    'PSA仕様保留/曖昧/未登録URL: 通常版POPへ代用しない','期間別予測・季節性・海外先行性: 検証蓄積中','返却時バックテスト: 最短12/1・時間待ち'],
  normalAcquisitionLlmCalls:0,normalAcquisitionCodexCalls:0,aiAutomation:'停止維持',
  note:'全体448枚は前回の成果。今回はこの基準スナップショットとの差分だけ。新規原票/URL発見/有効国内値/分析可能/指定適合を分離。安全基準・鮮度基準・URL条件は変更しない。'};
fs.writeFileSync(path.join(root,'data/fixed-profile-completion-report.json'),JSON.stringify(report));
console.log(JSON.stringify({overall,current:report.current,profiles:report.profiles.map(p=>({id:p.id,before:p.before,after:p.after,filled:p.profileFilledCards,first:p.firstQualified.length,remaining:p.remainingProspects}))}));
