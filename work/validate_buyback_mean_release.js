const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const root=path.join(__dirname,'..'),tests=fs.readdirSync(__dirname).filter(f=>/^test_.*\.js$/.test(f)),results=[];
for(const f of tests) {
  const r=cp.spawnSync(process.execPath,[path.join(__dirname,f)],{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:8e6});
  results.push({file:f,success:r.status===0,error:r.status===0?null:(r.stderr||r.stdout||String(r.error)).slice(-2000)});
  console.log((r.status===0?'PASS ':'FAIL ')+f);
}
fs.writeFileSync(path.join(__dirname,'buyback-mean-tests.json'),JSON.stringify({at:new Date().toISOString(),results}));
if(results.some(r=>!r.success))process.exitCode=1;
