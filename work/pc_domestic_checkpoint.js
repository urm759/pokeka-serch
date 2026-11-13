// Preserve a proven failed publication worktree intact, then replay only
// validated private product receipts into a fresh trusted-main checkout.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
function preserveConflicted({root,worker,store,owner,at=new Date().toISOString()}){
 const git=(args,cwd=worker)=>{const r=cp.spawnSync('git',args,{cwd,encoding:'utf8',maxBuffer:16e6});if(r.status!==0||r.error)throw Error('Checkpoint proof Git '+args[0]+' failed');return r.stdout.trim();};
 const merge=cp.spawnSync('git',['rev-parse','--verify','MERGE_HEAD'],{cwd:worker,encoding:'utf8'});
 if(merge.status!==0)return null;
 if(path.dirname(fs.realpathSync(worker))!==fs.realpathSync(store)||!owner?.base)throw Error('Unproven isolated checkpoint');
 const head=git(['rev-parse','HEAD']),incoming=merge.stdout.trim();
 const p=path.join(worker,'work/publish-recovery.json');
 const proof=fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):null;
 if(proof?.checkpointCommit!==head||proof.base!==owner.base||proof.status!=='manual-merge-required')throw Error('Unproven failed publication checkpoint');
 for(const args of [['merge-base','--is-ancestor',owner.base,head],['merge-base','--is-ancestor',incoming,'origin/main']])git(args);
 const own=git(['diff','--name-only',owner.base,head]).split('\n').filter(Boolean);
 if(!own.length||own.some(f=>! /^(data|work)\/.+\.json$/.test(f)))throw Error('Pending checkpoint has non-data changes; review required');
 const dirty=git(['diff','--name-only','HEAD']).split('\n').filter(Boolean);
 for(const file of dirty.filter(f=>! /^(data|work)\/.+\.json$/.test(f))){
  // A merge can stage raw HTML supplied by main. It is not a PC code change.
  // Unknown/local code modifications still stop this recovery route.
  if(!/^work\/price-source-[a-zA-Z0-9_-]+\.html$/.test(file))throw Error('Unknown non-data merge input retained for review');
  git(['diff','--quiet',incoming,'--',file]);
 }
 const suffix=at.replace(/[:.]/g,'-')+'-'+head.slice(0,12),held=path.resolve(store,'domestic-held-'+suffix);
 if(path.dirname(held)!==path.resolve(store)||fs.existsSync(held))throw Error('Unsafe or duplicate held checkout path');
 const conflicts=git(['diff','--name-only','--diff-filter=U']).split('\n').filter(Boolean);
 // git worktree move retains index stages, working bytes, bundle and history.
 // No merge abort/reset/delete and no source winner is selected here.
 git(['worktree','move',worker,held],root);
 const record={at,status:'original-checkpoint-held-independent-receipt-replay',head,incoming,base:owner.base,held,conflicts,
  sourceRequests:0,recoveryApplied:false,normalUpdatesMayContinue:true};
 fs.appendFileSync(path.join(store,'pc-domestic-held-history.jsonl'),JSON.stringify(record)+'\n');
 return record;
}
module.exports={preserveConflicted};
