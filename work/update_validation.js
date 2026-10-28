const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const ROOT=path.join(__dirname,'..'),FILE='work/update-validation-state.json';
// These checks remain on every data publication. The larger related suite runs
// after any tracked code/test/workflow change; weekly full tests remain separate.
const REQUIRED=['test_price_integrity','test_price_comparison','test_publication_lineage',
  'test_card_catalog_completion','test_stock_history_statistics','test_initial_calculation_dependencies'];
function fingerprint(root=ROOT){
  const list=cp.execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(f=>
    /^(?:[^/]+\.js|work\/[^/]+\.js|\.github\/workflows\/[^/]+\.yml|\.gitattributes)$/.test(f)
    ||/\/(?:[^/]*access-policy|performance-budgets|priority-search-profiles|psa-name-aliases)\.json$/.test(f));
  const h=crypto.createHash('sha256');
  for(const file of [...new Set(list)].sort())if(fs.existsSync(path.join(root,file)))h.update(file+'\0'+fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n')+'\0');
  return h.digest('hex');
}
function plan(root=ROOT){
  let saved={};try{saved=JSON.parse(fs.readFileSync(path.join(root,FILE)));}catch{}
  const code=fingerprint(root),mode=saved.version===1&&saved.verified===true&&saved.code===code?'required':'regression';
  return {mode,code,reason:mode==='required'?'同じコードの検証済み記録あり。毎回の価格・仕様・日時・版整合検証は維持':'コード・テスト・workflow変更または検証記録なし。関連回帰を実行'};
}
function required(root=ROOT){
  const rows=[];for(const file of ['build_ui_data',...REQUIRED,'test_ui_data']){
    const start=Date.now(),r=cp.spawnSync(process.execPath,['work/'+file+'.js'],{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:8e6});
    process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');rows.push({file,durationMs:Date.now()-start,status:r.status});
    if(r.status!==0||r.error)throw Error('Required publication validation failed: '+file);
  }return rows;
}
function record(root=ROOT){const p=plan(root);const row={version:1,verified:true,code:p.code,mode:p.mode,at:new Date().toISOString(),runId:process.env.GITHUB_RUN_ID||null,required:REQUIRED,llmCalls:0,codexCalls:0};fs.writeFileSync(path.join(root,FILE),JSON.stringify(row));return row;}
if(require.main===module){try{
  const arg=process.argv[2];if(arg==='--mode')console.log(plan().mode);
  else if(arg==='--record')console.log(JSON.stringify(record()));
  else if(arg==='--required')console.log(JSON.stringify({checks:required()}));
  else console.log(JSON.stringify(plan()));
}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={fingerprint,plan,required,record,REQUIRED,FILE};
