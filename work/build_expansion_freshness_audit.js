const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.join(__dirname,'..');
function build(ref) {
  if(!/^[a-f0-9]{7,40}$/.test(ref))throw new Error('Explicit baseline required');
  const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  const before=file=>JSON.parse(cp.execFileSync('git',['show',`${ref}:${file}`],{cwd:root,maxBuffer:40000000}));
  const old=before('data/psa-population-summary.json'),now=read('data/psa-population-summary.json');
  const cards=new Map(read('data/pokemon-cards.json').map(c=>[c.id,c]));
  const added=Object.keys(now.cards).filter(id=>!old.cards[id]);
  const held=Object.keys(old.cards).filter(id=>!now.cards[id]);
  const result={version:1,generatedAt:new Date().toISOString(),baselineCommit:ref,
    modelChanged:false,safetyChanged:false,newOfficialHttpAcquisitions:0,
    official:{before:Object.keys(old.cards).length,after:Object.keys(now.cards).length,
      added:added.map(id=>({id,name:cards.get(id)?.name,official:now.cards[id]})),
      held:held.map(id=>({id,name:cards.get(id)?.name,previous:old.cards[id],review:now.specificationHeld[id]})),
      meaning:'保存済み公式行の再照合。名称・仕様不一致は保留、個別取得日時を新しくしない。新規通信取得ではない'},
    completion:read('data/operation-improvement-audit.json').counts,
    sourceAcquisition:read('data/completion-acquisition.json'),
    fixedCohort:{before:before('data/priority-price-monitor.json').fixedCohortFreshness.sources.hareruya2.latest,
      after:read('data/priority-price-monitor.json').fixedCohortFreshness.sources.hareruya2.latest,
      capacity:read('data/priority-price-monitor.json').sources.hareruya2.capacity},
    browserValidation:{status:'未完了',reason:'Windows画面操作が現在のブラウザURLを安全に確認できず停止。PC/スマホ実測の改善は未主張',
      codeChange:'完全に同じカードHTMLはDOM再生成せず、変更カードだけ更新。計算式・警告・検索条件は同じ',
      metrics:['calculationMs','markupMs','domCommitMs','changedCards','reusedCards','frameCompletionMs']},
    followup:'次の定期実行は既存の非AI受領証・公開ハッシュ監視へ。AI予定タスクを再開しない',llmCalls:0,codexCalls:0};
  require('./acquisition_retry').atomicWrite(path.join(root,'data/expansion-freshness-audit.json'),result,0);
  console.log(JSON.stringify({completion:result.completion,psaAdded:added.length,psaHeld:held.length,fixed:result.fixedCohort.after}));
}
if(require.main===module)build(process.argv[2]);
module.exports={build};
