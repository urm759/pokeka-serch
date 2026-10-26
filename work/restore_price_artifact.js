// Restore verified acquisition inputs only. Derived reports must be regenerated.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),zlib=require('node:zlib'),crypto=require('node:crypto');
const ROOT=path.join(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const INPUTS=['data/pokemon-cards.json','data/pokemon-cards-meta.json','data/shop-buyback-summary.json',
  'data/psa10-observation-receipt.json','data/domestic-trade-source-audit.json','data/state-a-price-evidence.json',
  'data/hareruya2-stock-summary.json','data/cardrush-stock-summary.json','data/priority-price-execution.json','data/price-catchup-status.json',
  'work/source-update-runs.json','work/source-update-history.json','work/changed-card-ids.json',
  'work/toreca-source-inventory.json','work/toreca_source_diff.json','work/market_stability_history.json',
  'work/buyback-price-observations.json','work/shop_buyback_history.json','work/shop_buyback_catalog.json',
  'work/shop_buyback_unmatched.json','work/shop_buyback_item_matches.json','work/shop_buyback_quarantine.json',
  'work/homura-public-checkpoint.json','work/hareruya2_catalog.json','work/cardrush_catalog.json',
  'work/hareruya2_stock_history.json','work/cardrush_stock_history.json','work/priority-price-checkpoint.json',
  'work/priority-price-http-cache.json','work/candidate-shop-refresh.json','work/price-catchup-history.json',
  'work/card-new-arrivals.json','work/card-lifecycle.json','work/priority-freshness-history.json'];
function zipEntries(bytes){
  let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
  if(end<0||bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6))throw Error('ZIP end/disk unsupported');
  const count=bytes.readUInt16LE(end+10),start=bytes.readUInt32LE(end+16),entries=new Map();
  if(count===65535||count>3000)throw Error('ZIP64/count unsupported');
  let pos=start,total=0;
  for(let i=0;i<count;i++){
    if(pos+46>bytes.length||bytes.readUInt32LE(pos)!==0x02014b50)throw Error('ZIP central header invalid');
    const flags=bytes.readUInt16LE(pos+8),method=bytes.readUInt16LE(pos+10),size=bytes.readUInt32LE(pos+24),
      compressed=bytes.readUInt32LE(pos+20),local=bytes.readUInt32LE(pos+42),len=bytes.readUInt16LE(pos+28),
      extra=bytes.readUInt16LE(pos+30),comment=bytes.readUInt16LE(pos+32);
    const name=bytes.subarray(pos+46,pos+46+len).toString('utf8');total+=size;
    if(flags&1||![0,8].includes(method)||size>128e6||total>1e9||!/^[a-zA-Z0-9_./-]+$/.test(name)||name.includes('..')||name.startsWith('/')||entries.has(name)
      ||(bytes.readUInt32LE(pos+38)>>>16&0xf000)===0xa000)throw Error('Unsafe/unsupported ZIP entry');
    entries.set(name,()=>{if(bytes.readUInt32LE(local)!==0x04034b50)throw Error('ZIP local header invalid');
      const offset=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28),body=bytes.subarray(offset,offset+compressed);
      const value=method===0?body:zlib.inflateRawSync(body,{maxOutputLength:128e6});
      if(value.length!==size)throw Error('ZIP length mismatch');return value;});
    pos+=46+len+extra+comment;
  }
  return entries;
}
function restore(file,runId,base,root=ROOT){
  if(!/^\d+$/.test(String(runId))||!/^[a-f0-9]{40}$/.test(base))throw Error('Explicit trusted run/base required');
  const archive=fs.readFileSync(file),entries=zipEntries(archive);
  const manifests=[...entries.keys()].filter(f=>f.endsWith('/recovery-manifest.json'));
  if(manifests.length!==1)throw Error('Expected one reconstruction manifest');
  const manifest=JSON.parse(entries.get(manifests[0])()),prefix=manifests[0].slice(0,-'recovery-manifest.json'.length);
  if(String(manifest.workflowRunId)!==String(runId)||manifest.invalidJson?.length)throw Error('Recovery run/JSON proof mismatch');
  const plan=[],conflicts=[],seen=new Set();
  for(const row of manifest.files){
    if(!INPUTS.includes(row.file))continue;
    if(seen.has(row.file))throw Error('Duplicate manifest input');seen.add(row.file);
    const read=entries.get(prefix+row.file);if(!read)throw Error('Missing recovery input');
    let incoming=read();if(incoming.length!==row.bytes||sha(incoming)!==row.sha256)throw Error('Recovery hash mismatch: '+row.file);
    let data=JSON.parse(incoming);const target=path.join(root,row.file);
    const current=fs.existsSync(target)?fs.readFileSync(target):null;
    let original=null;try{original=cp.execFileSync('git',['show',base+':'+row.file],{cwd:root,maxBuffer:128e6,stdio:['ignore','pipe','pipe']});}catch{}
    const equivalent=(a,b)=>a===null||b===null?a===b:JSON.stringify(JSON.parse(a))===JSON.stringify(JSON.parse(b));
    if(equivalent(current,incoming))continue;
    if(!equivalent(current,original)){
      if(row.file==='work/priority-freshness-history.json'&&current&&original){
        data=require('./reconcile_saved_source_merge').mergeFixedFreshness(JSON.parse(original),JSON.parse(current),data);
        incoming=Buffer.from(JSON.stringify(data));
        if(equivalent(current,incoming))continue;
      }else{conflicts.push(row.file);continue;}
    }
    plan.push({file:row.file,incoming,current,data});
  }
  if(!seen.has('data/pokemon-cards.json'))throw Error('Recovery acquisition input missing');
  if(conflicts.length)throw Error('Concurrent source changes require merge; saved archive retained: '+conflicts.join(', '));
  const receipt=path.join(root,'work/recovery-applied-'+runId+'.json');
  if(!plan.length && fs.existsSync(receipt)){
    const previous=JSON.parse(fs.readFileSync(receipt));
    if(previous.zipSha256!==sha(archive))throw Error('Recovery receipt archive mismatch');
    return {...previous,status:'already-restored',previouslyRestored:previous.restored,restored:[]};
  }
  const backup=path.join(root,'work/recovery-applied',String(runId));fs.mkdirSync(backup,{recursive:true});
  for(const row of plan){const b=path.join(backup,row.file);fs.mkdirSync(path.dirname(b),{recursive:true});if(row.current)fs.writeFileSync(b,row.current);}
  for(const row of plan)require('./acquisition_retry').atomicWrite(path.join(root,row.file),row.data,0);
  const result={runId,base,at:new Date().toISOString(),zipSha256:sha(archive),verifiedInputs:seen.size,restored:plan.map(r=>r.file),backup:path.relative(root,backup),
    stage:'acquisition-inputs-restored-required-rebuild-and-validation-pending',sourceRequests:0,llmCalls:0,codexCalls:0};
  require('./acquisition_retry').atomicWrite(receipt,result,0);
  return result;
}
if(require.main===module){try{console.log(JSON.stringify(restore(process.argv[2],process.argv[3],process.argv[4])));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={INPUTS,zipEntries,restore};
