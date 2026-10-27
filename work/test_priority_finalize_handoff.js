const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'daily_fast_update.js'),'utf8');
function execute({parent,changed=false,sourceFailure=false,finalizeFailure=false}={}){
 const calls=[],writes=new Map(),output=[],clock=Date;let exit=0;
 const fakeFs={readFileSync:()=>JSON.stringify([{id:'fixture'}]),writeFileSync:(f,t)=>writes.set(path.basename(f),JSON.parse(t))};
 const spawnSync=(_,args)=>{const script=path.basename(args[0]);calls.push(script);
  if(script==='update_pokemon_site.js')return{status:sourceFailure?1:0,stdout:'FAST_UPDATE_RESULT '+JSON.stringify({changed,processedCards:1,changedCards:changed?1:0,httpRequests:1,cacheHits:0})+'\n'};
  return{status:script==='finalize_update_status.js'&&finalizeFailure?1:0,stdout:'{}\n'};};
 const fakeProcess={execPath:'node',env:parent?{FAST_PARENT_FINALIZES:'priority'}:{},stdout:{write:t=>output.push(t)},stderr:{write(){}},exit:code=>{exit=code;throw Error('exit '+code);}};
 try{vm.runInNewContext(source,{require:n=>n==='fs'?fakeFs:n==='path'?path:n==='child_process'?{spawnSync}:n==='./source_observability.js'?{appendRunHistory(){},updateRun(){}}:require(n),__dirname,process:fakeProcess,Date:clock,console:{error(){},log:t=>output.push(t)}});}catch(e){if(!exit)throw e;}
 return{calls,writes,output,exit};
}
for(const changed of [false,true]){
 const standalone=execute({changed}),parent=execute({changed,parent:true});
 assert.equal(standalone.exit,0);assert.equal(parent.exit,0);
 assert.equal(standalone.calls.filter(s=>s==='finalize_update_status.js').length,1);
 assert(!parent.calls.includes('finalize_update_status.js'));
 assert(parent.calls.includes('build_market_analysis.js'),'real observation saving remains before handoff');
 assert(parent.writes.has('update-performance.json'),'acquisition metrics remain saved');
 assert(parent.output.some(s=>s.includes('deferred-to-priority')));
}
assert.equal(execute({sourceFailure:true,parent:true}).exit,1);
assert.equal(execute({finalizeFailure:true}).exit,1,'standalone required finalization failure cannot masquerade as success');
const priority=fs.readFileSync(path.join(__dirname,'run_priority_price_refresh.js'),'utf8');
assert(priority.includes("if (!run('work/finalize_update_status.js')) throw new Error('Update status rebuild failed')"));
console.log('PASS Priority handoff: acquisition/observation saved, one parent finalization, standalone/source failures retained');
