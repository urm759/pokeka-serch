const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const assert = require('node:assert/strict');
const guard = require('./enforce_overseas_publication');
const root = path.join(__dirname, '..'), base = 'https://urm759.github.io/pokeka-serch/';
async function main() {
  const files = cp.execFileSync('git', ['ls-files', '-z'], {cwd:root,encoding:'utf8'}).split('\0')
    .filter(f=>f.endsWith('.json') && (guard.restricted(f) || f==='data/market-research-summary.json' || f==='data/overseas-access-policy.json'));
  const checked=[];
  for (const file of files) {
    const response=await fetch(base+file+'?privacy-verify='+Date.now(),{signal:AbortSignal.timeout(15000)});
    assert(response.ok, file+': HTTP '+response.status);
    const value=await response.json(), local=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
    assert.deepEqual(value,local,'published data differs: '+file);
    assert.equal(guard.priceLeaks(value).length,0,'overseas price in public response: '+file);
    checked.push(file);
  }
  const response=await fetch(base+'.private/overseas/api/runtime.json',{signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,404,'private API storage must not be public');
  const report={at:new Date().toISOString(),commit:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
    url:base,files:checked.length,checked,privateUrlStatus:response.status,pricesFound:0,
    limitation:'Current published bytes only. Historical Git commits/caches require separate approved remediation.'};
  fs.writeFileSync(path.join(__dirname,'20261019-overseas-public-release.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,checked:undefined}));
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={main};
