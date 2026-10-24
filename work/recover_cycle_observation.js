const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),s=require('./scheduled_cycle_evidence');
function recover(root,key,commit){
  if(!/^[a-f0-9]{40}$/.test(commit)||!['safe','daily','priority','catchup'].includes(key))throw Error('Explicit pipeline and saved publication commit required');
  const file=path.join(root,'data/scheduled-cycle-receipts.json'),all=JSON.parse(fs.readFileSync(file)),receipt=all.pipelines[key];
  const from=f=>cp.execFileSync('git',['show',commit+':'+f],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
  const original=JSON.parse(from('data/scheduled-cycle-receipts.json')).pipelines[key];
  if(String(receipt?.runId)!==String(original?.runId)||receipt.hashes[s.OBSERVATION_FILE]!==original.hashes[s.OBSERVATION_FILE])throw Error('Receipt identity/hash mismatch');
  const text=from(s.OBSERVATION_FILE);if(s.hash(text)!==receipt.hashes[s.OBSERVATION_FILE])throw Error('Saved observation does not match original receipt');
  if(s.observationText(receipt,s.OBSERVATION_FILE))return {unchanged:true,runId:receipt.runId};
  receipt.publishedObservations||={};receipt.publishedObservations[s.OBSERVATION_FILE]=s.packObservation(text,{commit,recoveredAt:new Date().toISOString(),httpRequests:0});
  require('./acquisition_retry').atomicWrite(file,all,0);
  return {runId:receipt.runId,recovered:1,compressedBytes:receipt.publishedObservations[s.OBSERVATION_FILE].body.length,httpRequests:0};
}
if(require.main===module)console.log(JSON.stringify(recover(path.join(__dirname,'..'),process.argv[2],process.argv[3])));
module.exports={recover};
