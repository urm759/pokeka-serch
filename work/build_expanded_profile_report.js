const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const ROOT=path.join(__dirname,'..'),outcomes=require('./audit_completion_outcomes');
const read=f=>JSON.parse(fs.readFileSync(path.join(ROOT,f),'utf8'));
function lastJson(file,test) {
  const lines=fs.readFileSync(path.join(ROOT,file),'utf8').split(/\r?\n/);
  return lines.map(line=>{try{return JSON.parse(line);}catch{return null;}}).filter(x=>x&&test(x)).at(-1)||null;
}
function build() {
  const before=read('work/search-profile-cycle-baseline-expanded-20261014.json'),now=outcomes.snapshot(ROOT),prior=outcomes.unpack(before.snapshot);
  const cycle=read('data/search-profile-cycle-progress.json').cycles.findLast(c=>c.key==='expanded-20261014'&&c.baselineAt===before.at);
  const oldCards=JSON.parse(cp.execFileSync('git',['show','e1431005:data/pokemon-cards.json'],{cwd:ROOT,maxBuffer:30000000}));
  const current=read('data/pokemon-cards.json'),old=new Map(oldCards.map(c=>[c.id,c])),byId=new Map(current.map(c=>[c.id,c]));
  const added=current.filter(c=>!old.has(c.id)).map(c=>({id:c.id,name:c.name,price:c.price,psa10:c.snkPsa10Price,qualifiedProfiles:cycle.profiles.filter(p=>p.firstQualified.includes(c.id)).map(p=>p.id)}));
  const newlyAnalyzable=Object.entries(now.rows).filter(([id,r])=>prior.rows[id]&&!prior.rows[id].analysis&&r.analysis).map(([id])=>({id,name:byId.get(id)?.name}));
  const newPurchaseUrls=current.filter(c=>old.has(c.id)&&!old.get(c.id).hareruya2Url&&c.hareruya2Url).map(c=>({id:c.id,name:c.name,url:c.hareruya2Url}));
  const completionRuns=['work/expanded-completion-20261014.log','work/expanded-completion-broad-20261014.log'].map(f=>lastJson(f,x=>Array.isArray(x.selected)&&Number.isFinite(x.attempted)));
  const report={version:1,at:now.at,baselineAt:before.at,baseCommit:'e1431005',conditions:'固定URL A/Bと承認済み2項目のみ。その他端末条件は未観測。安全/鮮度/式/点数は変更しない',
    overall:outcomes.compare(prior,now),newListed:added,newlyAnalyzable,newPurchaseUrls,
    acquisition:{psa:read('work/psa-fetch-progress.json'),completionRuns:completionRuns.map(r=>r&&({startedAt:r.startedAt,endedAt:r.endedAt,durationMs:r.durationMs,attempted:r.attempted,acquired:r.acquired,newAcquired:r.newAcquired,failures:r.failures,stopReason:r.stopReason})),
      priceRefresh:read('work/candidate-shop-refresh.json').sources.hareruya2},
    profiles:cycle.profiles,freshness:read('data/priority-price-monitor.json').fixedCohortFreshness,
    specificationHolds:read('data/psa-mapping-review.json').rows.length,
    oneItem:read('data/one-item-completion-audit.json'),scheduled:read('data/scheduled-execution-audit.json').runs.map(r=>({workflow:r.workflow,id:r.id,sha:r.sha,conclusion:r.conclusion,publications:r.jobs.map(j=>j.publication),failedSteps:r.jobs.flatMap(j=>j.steps.filter(s=>s.status==='failure'))})),
    performance:fs.existsSync(path.join(ROOT,'work/expanded-browser-performance-20261014.json'))?read('work/expanded-browser-performance-20261014.json').pairs:null,
    llmCalls:0,codexCalls:0,publication:'保存済み。Pages公開・JSON一致は別受領証',
    note:'全体補完と指定条件適合は別。新URLだけを有効値や初適合と数えない。原票新規と国内仕様照合も別。手動直後の鮮度回復を定期維持成功としない。'};
  fs.writeFileSync(path.join(ROOT,'data/expanded-profile-outcomes.json'),JSON.stringify(report));
  console.log(JSON.stringify({overall:report.overall,newListed:added,profiles:cycle.profiles.map(p=>({id:p.id,before:p.before,after:p.after,filled:p.profileFilledCards,firstQualified:p.firstQualified,freshnessRestored:p.freshnessRestored,lost:p.lost})),urls:newPurchaseUrls.length}));
  return report;
}
if(require.main===module)build();
module.exports={build};
