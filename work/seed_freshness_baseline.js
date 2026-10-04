const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),file=path.join(root,'work/priority-freshness-history.json'),{observe}=require('./fixed_freshness.js');
const previous=JSON.parse(fs.readFileSync(file,'utf8'));
if(!previous.baselineSourceCommit){
 const ref=process.env.REFERENCE_BASE_COMMIT||'4437445';
 const published=JSON.parse(execFileSync('git',['show',`${ref}:data/priority-price-monitor.json`],{cwd:root,encoding:'utf8',maxBuffer:10000000}));
 const fixed={...published,sources:Object.fromEntries(Object.entries(published.sources).map(([id,r])=>[id,{...r,cards:r.cards.filter(c=>previous.sources[id]?.cohort.includes(c.id))}]))};
 const at=Date.parse(published.generatedAt);if(!Number.isFinite(at)||at>=Date.parse(previous.baselineAt))throw new Error('No earlier timestamped baseline available');
 const seed=observe({sources:Object.fromEntries(Object.entries(previous.sources).map(([id,r])=>[id,{cohort:r.cohort}]))},fixed,at);
 for(const [id,row]of Object.entries(previous.sources))row.observations=[seed.sources[id].observations[0],...row.observations];
 previous.baselineAt=published.generatedAt;previous.baselineSourceCommit=ref;
 fs.writeFileSync(file,JSON.stringify(previous));
 console.log(JSON.stringify({baselineAt:previous.baselineAt,sources:Object.fromEntries(Object.entries(previous.sources).map(([id,r])=>[id,{before:r.observations[0],after:r.observations.at(-1)}]))}));
}
