const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const files=['data/performance-guard.json','data/performance-history.json','data/runtime-availability-audit.json','data/ui/manifest.json','data/ui/update-status.json','data/update-health-banner.json','data/update-status.json'];
const unresolved=cp.execFileSync('git',['diff','--name-only','--diff-filter=U'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
assert.deepEqual(unresolved.sort(),files.slice().sort(),'only known generated conflicts may be rebuilt');
for(const file of files) {
  const ours=cp.execFileSync('git',['show','HEAD:'+file],{maxBuffer:96e6}),incoming=cp.execFileSync('git',['show','MERGE_HEAD:'+file],{maxBuffer:96e6});
  for(const [side,content]of [['local',ours],['scheduled',incoming]]){const target=path.join('work/buyback-mean-merge-stages',side,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);}
  let value=JSON.parse(incoming);
  if(file==='data/performance-history.json')value.records=[...new Map([...JSON.parse(ours).records,...value.records].map(r=>[JSON.stringify(r),r])).values()].sort((a,b)=>Date.parse(a.generatedAt||a.at)-Date.parse(b.generatedAt||b.at));
  fs.writeFileSync(file,JSON.stringify(value));
}
console.log('7 generated conflicts preserved; incoming monitor retained; derived output requires rebuild');
