const path=require('node:path'),cp=require('node:child_process'),{inventory}=require('./operational_test_inventory');
function run(root=path.join(__dirname,'..')){
 const plan=inventory(root),results=[];console.log(JSON.stringify({workflows:Object.fromEntries(Object.entries(plan.workflows).map(([k,v])=>[k,v.length])),uniqueTests:plan.tests.length}));
 for(const file of plan.tests){const at=Date.now(),r=cp.spawnSync(process.execPath,[file],{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
  results.push({file,status:r.status,durationMs:Date.now()-at});
  if(r.status!==0||r.error){process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');throw Error('Operational prepublication regression failed: '+file+' '+(r.error?.message||''));}
  console.log('PASS '+file+' '+results.at(-1).durationMs+'ms');
 }return {scope:plan.scope,results,sourceRequests:0,llmCalls:0,codexCalls:0};
}
if(require.main===module){try{const r=run();console.log(JSON.stringify({passed:r.results.length,sourceRequests:0}));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={run};
