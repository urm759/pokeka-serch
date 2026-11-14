const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{inventory,WORKFLOWS}=require('./operational_test_inventory'),{jobProperty}=require('./workflow_structure');
const root=path.join(__dirname,'..'),plan=inventory(root),tests=new Set(plan.tests);
assert.equal(Object.keys(plan.workflows).length,4);
for(const file of WORKFLOWS){assert(plan.workflows[file].length>0,'operational tests missing for '+file);for(const test of plan.workflows[file])assert(tests.has(test),file+' CI omission: '+test);}
for(const test of plan.required)assert(tests.has(test),'mandatory publication test omitted: '+test);
assert(plan.workflows['watch-data-health.yml'].includes('work/test_watch_catchup_trigger.js'));assert(tests.has('work/test_watch_catchup_trigger.js'));
const text=fs.readFileSync(path.join(root,'.github/workflows/operational-path-checks.yml'),'utf8');
for(const filter of ["'.github/workflows/**'","'work/**/*.js'","'*.js'"])assert(text.includes(filter),'runtime/code changes must trigger operational CI');
assert.equal(jobProperty(text,'operational-regressions','if'),null,'prepublication suite must not silently skip a PR');
assert(text.includes('run: node work/run_operational_regressions.js'));assert(!text.includes('continue-on-error'));
console.log('PASS dynamic prepublication union of all Watch/Priority/Daily/Safe tests and mandatory checks; workflow/code triggers and no failure suppression');
