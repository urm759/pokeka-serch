const fs=require('node:fs'),assert=require('node:assert/strict');
function enabled(expression,failed,outcome){
  const value=expression.replace(/failure\(\)/g,JSON.stringify(failed)).replace(/steps\.publication\.outcome/g,JSON.stringify(outcome??''));
  assert(!/[^\s'"a-zA-Z0-9_!&|=()-]/.test(value),'unexpected workflow expression');
  return Function('return ('+value+')')();
}
function check(file,job){
  const text=fs.readFileSync('.github/workflows/'+file,'utf8').replace(/\r\n/g,'\n');
  const start=text.indexOf('\n  '+job+':'),end=text.indexOf('\n  ',start+4);
  assert(start>=0);const block=text.slice(start+1).split(/\n  (?=[a-zA-Z_][\w-]*:)/)[0];
  const steps=block.split(/\n      - /).slice(1),publication=steps.findIndex(s=>/\n        id: publication\n/.test('\n      - '+s));
  assert(publication>=0,file+' publication checkpoint present');
  const later=steps.slice(publication+1),captures=later.filter(s=>s.includes('capture_unpublished_data.js'));
  const archives=later.filter(s=>/work\/unpublished-recovery\//.test(s));
  const warnings=later.filter(s=>/name: (?:priority|daily|catchup|watch)-post-publication-alert-/.test(s));
  assert(captures.length&&archives.length&&warnings.length===1,file+'/'+job+' has both recovery routes');
  const runs=(s,failed,outcome)=>enabled(s.match(/\n        if: ([^\n]+)/)?.[1]||'true',failed,outcome);
  for(const outcome of ['failure','skipped','cancelled',undefined]){
    assert(captures.every(s=>runs(s,true,outcome)),'pre-publication failure must retain raw inputs: '+outcome);
    assert(archives.every(s=>runs(s,true,outcome)),'pre-publication recovery remains downloadable');
    assert(!runs(warnings[0],true,outcome),'no published claim without successful checkpoint');
  }
  assert(captures.every(s=>!runs(s,true,'success')),'known published inputs must not become another unpublished archive');
  assert(archives.every(s=>!runs(s,true,'success')));assert(runs(warnings[0],true,'success'),'source warning evidence is still retained');
  assert(!runs(warnings[0],false,'success'),'normal success creates no warning artifact');
  assert(later.some(s=>s.includes('--report-failures')||s.includes('--report-alerts')),'failure notification remains separate');
  assert(!later.filter(s=>s.includes('--report-')).some(s=>s.includes('continue-on-error')),'warnings are not silently marked successful');
}
for(const pair of [['priority-price-refresh.yml','refresh'],['daily-fast-update.yml','update'],['watch-data-health.yml','catchup'],['watch-data-health.yml','watch']])check(...pair);
console.log('PASS real workflow failure matrix: before-publication raw recovery retained; after-publication warnings retained separately, no false published claim or suppressed failure');
