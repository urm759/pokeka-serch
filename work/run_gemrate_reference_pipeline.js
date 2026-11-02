// Receipt processing is separate from acquisition and domestic updates.
const fs=require('node:fs'),path=require('node:path');
function run({push=false}={}){
 const root=path.resolve(__dirname,'..'),store=process.env.GEMRATE_PRIVATE_STORE||path.resolve(root,'../private-research/gemrate'),at=new Date().toISOString();
 const imported=require('./gemrate_private_inbox').run(store);
 const projection=require('./build_gemrate_public_reference').build(root,store);
 const checkpoint=require('./gemrate_reference_checkpoint');
 const publication=push?checkpoint.push(root,store):{status:'validated-local-outbox',path:checkpoint.enqueue(root,store)};
 const result={at,imported:{newPrivateObservations:imported.newPrivateObservations,firstMatchedIdentities:imported.firstMatchedIdentities,reusedMappings:imported.reusedMappings,retainedCsvReevaluations:imported.retainedCsvReevaluations},projection,publication,sourceAcquisitions:0,calculationAdopted:0,llmCalls:0,codexCalls:0};
 require('./acquisition_retry').atomicWrite(path.join(store,'last-reference-pipeline.json'),result);console.log(JSON.stringify(result));return result;
}
if(require.main===module){try{run({push:process.argv.includes('--push')});}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={run};
