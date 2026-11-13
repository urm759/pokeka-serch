const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const inputs=require('./publication_merge_inputs');
const DERIVED=new Set(['data/publication-lineage.json','data/update-status.json','data/performance-guard.json','data/performance-history.json',
  'data/runtime-availability-audit.json','data/update-health-banner.json','data/scheduled-cycle-receipts.json',
  'data/search-profile-cycle-progress.json','data/psa-pop-coverage.json','work/psa-pop-coverage-history.json']);
// These contain scheduling/observation history, not replaceable generated seeds.
// Use the same strict reconciliation as saved-source recovery before regenerating.
const RECONCILABLE=new Map([
  ['work/priority-price-checkpoint.json','mergePriorityCheckpoint'],
  ['work/priority-freshness-history.json','mergeFixedFreshness']
]);
DERIVED.add('data/priority-price-monitor.json');
DERIVED.add('data/operational-freshness-audit.json');
// Scheduling rows are a projection. The carried publication proof is selected
// strictly below, not discarded when the projection is regenerated.
DERIVED.add('data/proactive-refresh-audit.json');
// Pure projection of the completion queue and saved linkage evidence. It is
// rebuilt by finalize_update_status; never resolve a queue/raw-price conflict here.
DERIVED.add('data/one-item-completion-audit.json');
DERIVED.add('data/priority-search-profile-audit.json');
DERIVED.add('work/pop-focus-targets.json');
// Produced from saved authoritative inputs, never acquired quotes or histories.
for(const file of ['25th-promo-coverage','acquisition-progress-audit','acquisition-resilience','buyback-observation-summary','buyback-support-audit',
  'candidate-daily-audit','completion-outcomes','domestic-psa9-provenance-details','domestic-psa9-route-audit','focus-monitor','linkage-evidence-audit',
  'linkage-evidence-details','modern-high-rarity-audit','previous-qualified-reference','psa9-provenance-audit','purchase-issue-alias-audit',
  'purchase-limit-model-audit','purchase-price-freshness-audit','raw-condition-reference-summary','raw-psa9-gap-audit','shop-identity-quarantine',
  'state-a-price-audit','supply-demand-validation-summary'])DERIVED.add('data/'+file+'.json');
for(const file of ['high-rarity-completion-plan','pop-focus-targets','psa_priority_queue','purchase-price-targets','saved-shop-link-reconciliation'])DERIVED.add('work/'+file+'.json');
const projection=file=>file.startsWith('data/ui/')||/^data\/(?:psa-pop-glance\/\d{2}|raw-condition-reference\/\d{1,2})\.json$/.test(file)||DERIVED.has(file);
function mergeTimedRows(a,b,key,time){
  const rows=new Map();for(const row of [...a,...b]){const k=key(row),old=rows.get(k);if(!old||Date.parse(time(row))>=Date.parse(time(old)))rows.set(k,row);}
  return [...rows.values()].sort((x,y)=>Date.parse(time(x))-Date.parse(time(y))).slice(-400);
}
function mergeReceipts(a,b){
  if(!a.pipelines||!b.pipelines)throw Error('Receipt schema changed; preserve all sides for review');
  const pipelines={...a.pipelines};
  for(const [key,row]of Object.entries(b.pipelines))if(!pipelines[key]||Date.parse(row.recordedAt)>Date.parse(pipelines[key].recordedAt))pipelines[key]=row;
  return {...a,pipelines};
}
function resolve(cwd,{rebuild}={}) {
  const git = args => {
    const run=spawnSync('git', args, {cwd, encoding:'utf8', maxBuffer:64*1024*1024});
    if (run.error || run.status!==0) throw new Error(`git ${args[0]} failed (${run.error?.code || run.status}): ${String(run.stderr || run.error?.message || '').slice(0,1024)}`);
    return run.stdout.trim();
  };
  const conflicts=git(['diff','--name-only','--diff-filter=U']).split('\n').filter(Boolean);
  if (!conflicts.length) return false;
  if (conflicts.some(name=>!projection(name)&&!RECONCILABLE.has(name)&&!inputs.TYPES.has(name))) return false;
  const incoming=git(['rev-parse','MERGE_HEAD']);
  const archive=path.join(cwd,'work/generated-merge-stages',incoming);
  const staged=new Map();
  // Save every side before replacing a generated seed. Source-record conflicts never enter this path.
  for(const file of conflicts){
    const sides=[1,2,3].map(stage=>{
      const text=git(['show',`:${stage}:${file}`]);
      const target=path.join(archive,String(stage),file);
      fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);
      return JSON.parse(text);
    });
    staged.set(file,sides);
  }
  const planned=[];
  const auditAt=ref=>JSON.parse(git(['show',ref+':data/purchase-limit-model-audit.json']));
  const context=conflicts.includes('work/candidate-daily-history.json')?{baseAudit:auditAt(git(['merge-base','HEAD','MERGE_HEAD'])),leftAudit:auditAt('HEAD'),rightAudit:auditAt('MERGE_HEAD')}:{};
  for(const [file,[base,a,b]]of staged){
    let seed=a;
    if(inputs.TYPES.has(file))seed=inputs.merge(file,base,a,b,context);
    if(RECONCILABLE.has(file))seed=require('./reconcile_saved_source_merge')[RECONCILABLE.get(file)](base,a,b);
    if(file==='data/proactive-refresh-audit.json')seed={...a,publicationEvidence:
      require('./reconcile_saved_source_merge').latest(a.publicationEvidence??null,b.publicationEvidence??null,base.publicationEvidence??null)};
    if(file==='data/performance-history.json'){
      const records=[...new Map([...(a.records||[]),...(b.records||[])].map(r=>[JSON.stringify(r),r])).values()];
      seed={...a,records:records.sort((x,y)=>Date.parse(x.generatedAt)-Date.parse(y.generatedAt)).slice(-90)};
    }
    if(file==='data/scheduled-cycle-receipts.json')seed=mergeReceipts(a,b);
    if(file==='data/search-profile-cycle-progress.json'){
      if(!Array.isArray(a.cycles)||!Array.isArray(b.cycles))throw Error('Cycle schema changed; review required');
      seed={...a,cycles:mergeTimedRows(a.cycles,b.cycles,r=>r.key+'|'+r.runId,r=>r.recordedAt)};
    }
    if(file==='work/psa-pop-coverage-history.json')seed={runs:mergeTimedRows(a.runs||[],b.runs||[],r=>r.at+'|'+r.runId,r=>r.at)};
    planned.push([file,seed]);
  }
  // A genuine checkpoint conflict (including a manual hold or changed fixed
  // denominator) must leave every conflicted input untouched for review.
  for(const [file,seed]of planned)fs.writeFileSync(path.join(cwd,file),JSON.stringify(seed));
  if (conflicts.includes('data/update-status.json')) {
    const [,a,b]=staged.get('data/update-status.json');
    const seed={...a};
    for(const key of ['completeDate','allDataCompleteDate','majorDataCompleteDate']) {
      const dates=[a[key],b[key]].filter(Boolean).sort();
      seed[key]=dates[0] || null;
    }
    fs.writeFileSync(path.join(cwd,'data/update-status.json'),JSON.stringify(seed));
  }
  if(rebuild)rebuild(cwd);
  else {
    // Finalization computes outcomes and embeds exactly that snapshot in the
    // monitor before sealing lineage. Never recompute outcomes afterwards.
    for(const file of ['audit_state_a_prices.js','build_card_completion.js','audit_acquisition_progress.js','build_psa_priority_queue.js','finalize_update_status.js','measure_performance_guard.js','build_ui_data.js','test_ui_data.js','test_card_catalog_completion.js']){
      const child=spawnSync(process.execPath,['work/'+file],{cwd,encoding:'utf8',env:{...process.env,PRICE_EVIDENCE_FETCH_LIMIT:'0'},timeout:300000,maxBuffer:32*1024*1024});
      if(child.status!==0)throw new Error(`${file}: ${child.stderr||child.stdout||child.error?.message||'regeneration failed'}`);
    }
    const receiptFile=path.join(cwd,'data/scheduled-cycle-receipts.json');
    if(process.env.GITHUB_RUN_ID&&fs.existsSync(receiptFile)){
      const receipts=JSON.parse(fs.readFileSync(receiptFile,'utf8'));
      const key=Object.keys(receipts.pipelines||{}).find(k=>String(receipts.pipelines[k].runId)===String(process.env.GITHUB_RUN_ID));
      if(key){require('./scheduled_cycle_evidence').record(key,cwd);require('./build_ui_data').build(cwd);
        const check=spawnSync(process.execPath,['work/test_ui_data.js'],{cwd,encoding:'utf8',timeout:60000});
        if(check.status!==0)throw Error(check.stderr||check.stdout||'Merged receipt validation failed');}
    }
    const verify=spawnSync(process.execPath,['work/build_purchase_limit_audit.js','--verify'],{cwd,encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024});
    if(verify.status!==0)throw new Error(verify.stderr||verify.stdout||'Required purchase audit failed');
  }
  git(['add',...conflicts]);
  const trackedRoots=['data','work'].filter(dir=>git(['ls-files','--',dir]).length);
  git(['add','--update','--',...trackedRoots]);
  git(['commit','--no-edit']);
  return true;
}
module.exports={resolve,DERIVED,RECONCILABLE,mergeReceipts,mergeTimedRows};
