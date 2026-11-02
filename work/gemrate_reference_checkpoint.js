// Only compact validated references cross this boundary. Never commit the user index,
// CSV, credentials, raw history, receipt metadata or private paths.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const FILES=['data/gemrate-reference-summary.json','work/gemrate-confirmed-reference-registry.json'];
const BRANCH='codex/gemrate-reference-data',ROOT=path.resolve(__dirname,'..');
function git(root,args,options={}){const r=cp.spawnSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:16e6,...options});if(r.status!==0||r.error)throw Error('Reference checkpoint Git '+args[0]+' failed');return r.stdout.trim();}
function validate(root){require('./gemrate_confirmed_links').validatePublic(root,JSON.parse(fs.readFileSync(path.join(root,FILES[0]))),JSON.parse(fs.readFileSync(path.join(root,FILES[1]))));}
function enqueue(root=ROOT,store=path.resolve(root,'../private-research/gemrate')){
 if(!require('./gemrate_private_store').outside(fs.realpathSync(root),fs.realpathSync(store)))throw Error('Reference outbox must remain outside repository');
 validate(root);const outbox=path.join(store,'publication-outbox');fs.mkdirSync(outbox,{recursive:true});
 for(const f of FILES)fs.writeFileSync(path.join(outbox,path.basename(f)),fs.readFileSync(path.join(root,f)));
 require('./acquisition_retry').atomicWrite(path.join(outbox,'state.json'),{status:'validated-awaiting-cloud',at:new Date().toISOString(),files:FILES,sourceAcquisitions:0,llmCalls:0,codexCalls:0});
 return outbox;
}
function push(root=ROOT,store=path.resolve(root,'../private-research/gemrate')){
 const outbox=enqueue(root,store),release=require('./acquisition_retry').lock(path.join(store,'.reference-push.lock'));
 try{
 git(root,['fetch','origin','main']);
 const base=git(root,['rev-parse','origin/main']),heads=git(root,['ls-remote','--heads','origin','refs/heads/'+BRANCH]);
 let prior=null;if(heads){git(root,['fetch','origin',BRANCH]);prior=git(root,['rev-parse','FETCH_HEAD']);}
 const same=ref=>ref&&FILES.every(f=>{const r=cp.spawnSync('git',['show',ref+':'+f],{cwd:root,encoding:'utf8',maxBuffer:16e6});return r.status===0&&r.stdout.replace(/\r\n/g,'\n')===fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n');});
 const save=result=>{require('./acquisition_retry').atomicWrite(path.join(outbox,'state.json'),{...result,at:new Date().toISOString(),files:FILES,sourceAcquisitions:0,llmCalls:0,codexCalls:0});return result;};
 if(same(base))return save({status:'already-on-main',queued:false,commit:base});
 if(same(prior))return save({status:'already-queued',queued:false,commit:prior});
 const index=path.join(outbox,'temporary-index-'+process.pid),env={...process.env,GIT_INDEX_FILE:index,GIT_AUTHOR_NAME:'GemRate reference importer',GIT_AUTHOR_EMAIL:'reference-import@users.noreply.github.com',GIT_COMMITTER_NAME:'GemRate reference importer',GIT_COMMITTER_EMAIL:'reference-import@users.noreply.github.com'};
 git(root,['read-tree',base],{env});
 for(const f of FILES){const blob=git(root,['hash-object','-w','--stdin'],{input:fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n'),env});git(root,['update-index','--add','--cacheinfo','100644,'+blob+','+f],{env});}
 const tree=git(root,['write-tree'],{env}),parents=[...new Set([prior,base].filter(Boolean))].flatMap(p=>['-p',p]);
 const commit=git(root,['commit-tree',tree,...parents,'-m','Queue validated GemRate factual references'],{env});
 const changed=git(root,['diff','--name-only',base,commit]).split('\n').filter(Boolean);
 if(changed.some(f=>!FILES.includes(f)))throw Error('Checkpoint escapes compact reference boundary');
 git(root,['push','origin',commit+':refs/heads/'+BRANCH]);
 return save({status:'queued-for-cloud',queued:true,commit,changed});
 }finally{release();}
}
function apply(root=ROOT,ref='refs/remotes/origin/'+BRANCH){
 const old=require('./publication_lineage').verify(root),data=FILES.map(f=>JSON.parse(git(root,['show',ref+':'+f])));
 require('./gemrate_confirmed_links').validatePublic(root,data[0],data[1]);
 const current=JSON.parse(fs.readFileSync(path.join(root,FILES[0])));
 validateTransition(current,data[0]);
 let changed=false;for(let i=0;i<FILES.length;i++){const f=path.join(root,FILES[i]);if(!fs.existsSync(f)||JSON.stringify(JSON.parse(fs.readFileSync(f)))!==JSON.stringify(data[i])){require('./acquisition_retry').atomicWrite(f,data[i],0);changed=true;}}
 if(changed){require('./focus_pop_priority').build(root);require('./publication_lineage').seal(root,old.sources);require('./build_ui_data').build(root);}
 return {changed,sourceAcquisitions:0,calculationAdopted:0,references:Object.keys(data[0].cards).length};
}
function validateTransition(current,incoming){
 for(const [id,row]of Object.entries(current.cards||{})){const next=incoming.cards?.[id];if(!next||next[3]<row[3])throw Error('Queued reference would remove or age an existing observation');if(next[3]===row[3]&&JSON.stringify(next)!==JSON.stringify(row))throw Error('Same-date reference contradiction');}
}
if(require.main===module){try{const result=process.argv.includes('--apply')?apply():push();if(process.env.GITHUB_OUTPUT&&'changed'in result)fs.appendFileSync(process.env.GITHUB_OUTPUT,'changed='+result.changed+'\n');console.log(JSON.stringify(result));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={FILES,BRANCH,enqueue,push,apply,validate,validateTransition};
