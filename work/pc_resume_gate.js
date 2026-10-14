function decision(state={},now=Date.now(),force=false) {
  if(force)return {allowed:true,reason:'明示的な単発取得。未実行回数は再生しない'};
  const confirmed=Date.parse(state.lastSuccessAt||'');
  const normal=['acquired','success','partial'].includes(state.status)&&state.acquiredCount>0;
  const age=Number.isFinite(confirmed)?now-confirmed:null;
  if(age!=null&&age<0)return {allowed:false,reason:'PC取得記録が未来・要確認'};
  return {allowed:!(normal&&age!=null&&age<2*3600000),ageMs:age,minimumIntervalMs:2*3600000,
    reason:normal&&age!=null&&age<2*3600000?'直近の正常部分取得から2時間以内。公開回収は先に行い、取得を重複しない':'保存チェックポイントから現在必要な対象を1区間処理。欠落した実行回数をまとめて再生しない'};
}
module.exports={decision};
if(require.main===module){
  const fs=require('node:fs'),state=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));
  const result=JSON.stringify(decision(state,Date.now(),process.argv.includes('--force'))),index=process.argv.indexOf('--output');
  if(index>=0){if(!process.argv[index+1])throw Error('Output path required');fs.writeFileSync(process.argv[index+1],result,'utf8');console.log('Resume gate saved');}
  else console.log(result);
}
