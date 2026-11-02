// Verify the received projection after Pages, with no GemRate/source requests.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),PUBLIC='https://urm759.github.io/pokeka-serch/';
const digest=b=>crypto.createHash('sha256').update(b.replace(/\r\n/g,'\n')).digest('hex');
async function main(){
 const file='data/gemrate-reference-summary.json',expected=fs.readFileSync(path.join(ROOT,file),'utf8'),ids=Object.keys(JSON.parse(expected).cards).sort(),attempts=[],started=Date.now();
 const read=async f=>{const r=await fetch(PUBLIC+f+'?reference-check='+Date.now(),{signal:AbortSignal.timeout(30000)});if(!r.ok){const e=Error('Own-site publication HTTP '+r.status);e.terminal=[401,403].includes(r.status);throw e;}return r.text();};
 do{
  try{const [raw,manifest]=await Promise.all([read(file),read('data/ui/manifest.json')]);const matches=digest(raw)===digest(expected)&&JSON.stringify(JSON.parse(manifest).referenceDisplayIds)===JSON.stringify(ids);
    attempts.push({at:new Date().toISOString(),matches});if(matches){const result={at:new Date().toISOString(),runId:process.env.GITHUB_RUN_ID||null,publicationConfirmed:true,references:ids.length,hash:digest(raw),attempts,sourceRequests:0,llmCalls:0,codexCalls:0};fs.writeFileSync(path.join(ROOT,'work/gemrate-publication-proof.json'),JSON.stringify(result));console.log(JSON.stringify(result));return result;}}
  catch(e){attempts.push({at:new Date().toISOString(),error:e.message});if(e.terminal)throw e;}
  fs.writeFileSync(path.join(ROOT,'work/gemrate-publication-proof.json'),JSON.stringify({attempts,publicationConfirmed:false,sourceRequests:0,llmCalls:0,codexCalls:0}));
  if(Date.now()-started>=240000)throw Error('Pages publication pending; no source refetch');
  await new Promise(r=>setTimeout(r,15000));
 }while(true);
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});module.exports={main};
