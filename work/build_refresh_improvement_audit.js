const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const codec = require('../ui-data-codec');
const {project,SUMMARY} = require('./build_ui_data');
const root = path.join(__dirname,'..');
const baseline = process.argv[2] || 'f583dd0f';
const oldText = file => execFileSync('git',['show',baseline+':'+file],{cwd:root,encoding:'utf8',maxBuffer:40*1024*1024});
const read = file => JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const oldSource = oldText('work/build_ui_data.js');
const beforeProject = new Function('structuredClone',oldSource.slice(oldSource.indexOf('function project('),oldSource.indexOf('const SUMMARY'))+';return project;')(structuredClone);
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const payload = SUMMARY.map(name=>{
  const input = read('data/'+name+'.json');
  return {file:name,before:bytes(codec.encode(beforeProject(name,input))),after:bytes(codec.encode(project(name,input))),
    expandedSummaryJson:bytes(project(name,input)),originalDetailJson:bytes(input)};
});
const previous = JSON.parse(oldText('data/card-catalog-completion.json')),current = read('data/card-catalog-completion.json');
const oldPop = JSON.parse(oldText('data/psa-population-summary.json')),pop = read('data/psa-population-summary.json');
const oldIds = new Set(Object.keys(oldPop.cards||{})),newIds = Object.keys(pop.cards||{});
const completion = read('data/completion-outcomes.json');
const result = {version:1,baselineCommit:baseline,generatedAt:new Date().toISOString(),
  changes:{calculationRules:false,safetyRules:false,freshnessHours:false,dataUpdate:true,displayAndPayload:true},
  acquisition:read('work/psa_acquisition_result.json'),handoff:read('data/psa-publication-handoff.json'),
  outcomes:{listedBefore:previous.summary.total,listedAfter:current.summary.total,newListed:0,
    newLinked:newIds.filter(id=>!oldIds.has(id)).length,usableNet:newIds.length-oldIds.size,
    analyzableBefore:previous.summary.analyzable,analyzableAfter:current.summary.analyzable,
    analyzableNet:current.summary.analyzable-previous.summary.analyzable,pending:current.summary.priorityQueueRemaining,
    oneAway:completion.oneAway,domesticPsa9IndividualCards:completion.domesticPsa9IndividualCards},
  payload:{method:'同じ最新入力を旧/新要約で生成。圧縮通信は公開ResourceTimingで別測定',files:payload,
    before:payload.reduce((n,r)=>n+r.before,0),after:payload.reduce((n,r)=>n+r.after,0)},
  cadence:read('data/refresh-cadence-audit.json'),performance:read('data/performance-guard.json'),
  pending:['修正後の次回定期実行の取得・保存・公開照合','PSA未紐付け・仕様保留・未登録セットURL',
    '国内PSA9/状態A個別実成約の正規取得経路','認証PokeDATA個別成約','カードラッシュ/遊々亭403',
    '42/91/119/147日期間別予測の実証','季節性・海外先行性','12月以降の返却時バックテスト',
    'PC独立観測タスクは登録権限待ち'],
  llmAcquisitionCalls:0,codexAcquisitionCalls:0};
fs.writeFileSync(path.join(root,'data/refresh-improvement-audit.json'),JSON.stringify(result));
console.log(JSON.stringify({outcomes:result.outcomes,payloadBefore:result.payload.before,payloadAfter:result.payload.after}));
