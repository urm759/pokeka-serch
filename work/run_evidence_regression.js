const fs=require('node:fs'),cp=require('node:child_process');
const files=fs.readdirSync('work').filter(f=>/^test_.*\.js$/.test(f)).sort(),rows=[];
for(const file of files){const start=Date.now(),r=cp.spawnSync(process.execPath,['work/'+file],{encoding:'utf8',timeout:180000,maxBuffer:32*1024*1024});fs.writeFileSync('work/evidence-'+file+'.log',(r.stdout||'')+(r.stderr||'')+(r.error?.message||''));rows.push({file,exit:r.status,durationMs:Date.now()-start});console.log(file+': '+r.status);}
fs.writeFileSync('work/evidence-regression.json',JSON.stringify({at:new Date().toISOString(),rows,passed:rows.every(r=>r.exit===0)},null,2));if(rows.some(r=>r.exit!==0))process.exitCode=1;
