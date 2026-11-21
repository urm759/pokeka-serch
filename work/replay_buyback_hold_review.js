// Replay the design snapshot without touching the checkout or requesting any source.
const cp = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {canAttempt, warnings} = require('./buyback_hold_review');
const ref = 'e4d64a8cf8b82684638523195a065ac79c905a01';
const root = path.join(__dirname,'..');
const read = name => JSON.parse(cp.execFileSync('git',['show',ref+':data/'+name+'.json'],{cwd:root,maxBuffer:32*1024*1024}));
const summary = read('shop-buyback-summary'), deadlines = read('formal-freshness-deadlines'), execution = read('priority-price-execution');
const held = Object.entries(summary.shops).filter(([,s])=>s.reviewStatus==='count-drop-review');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(),'buyback-replay-'));
try {
  for (const dir of ['data','work']) fs.mkdirSync(path.join(scratch,dir));
  const script=path.join(scratch,'work','run_priority_price_refresh.js');
  fs.copyFileSync(path.join(__dirname,'run_priority_price_refresh.js'),script);
  const report = saved => {
    fs.writeFileSync(path.join(scratch,'data/priority-price-execution.json'),JSON.stringify(saved));
    return cp.spawnSync(process.execPath,[script,'--report-failures'],{env:{...process.env,GITHUB_RUN_ID:saved.runId}}).status;
  };
  // In this snapshot the buyback audit immediately follows its tracked child.
  const audit=execution.runs.findIndex(r=>r.source==='shopBuyback' && r.field==='buybackExitEvidence');
  if (execution.runs[audit-1]?.script!=='work/run_tracked_update.js' || execution.runs[audit-1].processStatus!=='failed')
    throw Error('Unexpected shape of saved execution');
  console.log('saved execution',execution.runId,'report',report(execution));
  const onlyHolds=structuredClone(execution);
  onlyHolds.runs[audit-1].processStatus='success';
  console.log('known holds only',report(onlyHolds),'new failure',report(execution));
  for(const [id,shop] of held) console.log(id,'120h',new Date(Date.parse(shop.lastSuccess)+120*3600000).toISOString());
  for(const day of [22,23,24,25]) for(const hour of ['00','03']) {
    const at='2026-11-'+day+'T'+hour+':00:00Z', now=Date.parse(at);
    const issues=warnings(summary,deadlines,now);
    const row=held.map(([id,shop])=>{
      const due=canAttempt(shop,now,false), issue=issues.find(i=>i.shopId===id);
      // Fixed hypothetical opportunities, with each due source still nonempty and below half.
      if (due) shop.lastAttempt=at;
      return [id,due,issue.within24,issue.within48,issue.formalCount];
    });
    console.log(at,JSON.stringify(row),'report',report(onlyHolds));
  }
} finally {fs.rmSync(scratch,{recursive:true,force:true});}
