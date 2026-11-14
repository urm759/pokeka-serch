const fs=require('node:fs'),path=require('node:path'),{testCommands}=require('./workflow_structure');
const WORKFLOWS=['watch-data-health.yml','priority-price-refresh.yml','daily-fast-update.yml','safe-checkpoint-backfill.yml'];
function inventory(root=path.join(__dirname,'..')){
 const workflows=Object.fromEntries(WORKFLOWS.map(name=>[name,testCommands(fs.readFileSync(path.join(root,'.github/workflows',name),'utf8'))]));
 const required=require(path.join(root,'work/update_validation')).REQUIRED.map(n=>'work/'+n+'.js');
 const tests=[...new Set([...Object.values(workflows).flat(),...required,'work/test_ui_data.js','work/test_workflow_structure.js','work/test_operational_ci_coverage.js'])].sort();
 for(const file of tests)if(!/^work\/test_[\w-]+\.js$/.test(file)||!fs.existsSync(path.join(root,file)))throw Error('Operational regression missing: '+file);
 return {workflows,required,tests,scope:'Static Node tests of Watch/Priority/Daily/Safe including regression branches, plus mandatory publication tests. No source acquisition.',sourceRequests:0,llmCalls:0,codexCalls:0};
}
module.exports={WORKFLOWS,inventory};
if(require.main===module)console.log(JSON.stringify(inventory()));
