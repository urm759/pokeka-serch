const fs=require('node:fs'),path=require('node:path'),lineage=require('./publication_lineage');
function decide(root,now=Date.now()){
  const read=f=>{try{return JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));}catch{return {};}};
  let saved;
  try{saved=lineage.verify(root);if(!saved)return {mode:'rebuild',reason:'保存済み集計の版根拠なし・取得前に再検証'};}
  catch(error){return {mode:'rebuild',reason:error.message};}
  if(saved.reuseInputs&&saved.reuseInputs!==lineage.reuseInputs(root))return {mode:'rebuild',reason:'保存原票・平均・費用・計算入力が変更済み。再取得せず先に集計/公開を復旧'};
  const gate=require('./price_refresh_gate').decision(read('data/priority-price-execution.json'),now,true);
  if(gate.allowed)return {mode:'acquire',reason:gate.reason};
  return saved.generationCode===lineage.generationCode(root)
    ?{mode:'reuse',reason:'取得なし・原票と生成コードは同一。必須検証は維持し全件再集計/再測定/補完受領証を省略'}
    :{mode:'rebuild',reason:'生成コードの変更または旧版。保存原票だけ再集計・新規通信なし'};
}
if(require.main===module){const result=decide(path.join(__dirname,'..'));if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'mode='+result.mode+'\n');console.log(JSON.stringify(result));}
module.exports={decide};
