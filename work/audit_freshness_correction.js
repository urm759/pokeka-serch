const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {plan,confirmedInventoryAt} = require('./priority_price_queue.js');
const {observe} = require('./fixed_freshness.js');
const root = path.join(__dirname,'..');
const ref = process.argv[2];
if (!ref) throw new Error('A verified baseline Git reference is required');
const before = file => JSON.parse(execFileSync('git',['show',`${ref}:${file}`],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024}));
const original = before('data/priority-price-monitor.json');
const history = before('work/priority-freshness-history.json');
const corrected = structuredClone(original);
const cards = before('data/pokemon-cards.json');
const runs = before('work/source-update-runs.json').sources;
const inventory = before('work/toreca-source-inventory.json');
const at = confirmedInventoryAt(inventory,runs.toreca);
const present = new Set(inventory.cards.map(r=>r.id));
const config = before('data/priority-price-config.json');
const now = Date.parse(original.generatedAt);
for (const id of ['hareruya2','cardrush']) {
  const candidateRows = Object.fromEntries(original.sources[id].cards.map(r=>[r.id,{}]));
  const catalog = before(`work/${id}_catalog.json`);
  const result = plan({cards,sourceId:id,catalog,candidateRows,config,now});
  const cohort = new Set(history.sources[id].cohort);
  corrected.sources[id].fixedCards = result.records.filter(r=>cohort.has(r.card.id)).map(r=>({id:r.card.id,lastConfirmedAt:r.lastSuccessAt,status:r.status}));
}
const prices = new Map(cards.map(c=>[c.id,c.price]));
const fixed = history.sources.toreca.cohort;
corrected.sources.toreca.fixedCards = fixed.map(id=>({id,lastConfirmedAt:present.has(id)&&prices.get(id)>0?at:null,status:'取得一覧確認'}));
corrected.sources.toreca.cards = corrected.sources.toreca.cards.map(r=>({...r,lastConfirmedAt:present.has(r.id)&&prices.get(r.id)>0?at:null,status:'取得一覧確認'}));
const measured = observe(history,corrected,now);
const changes = {};
for (const id of ['hareruya2','toreca','cardrush']) {
  const old = history.sources[id].observations.at(-1);
  const next = measured.sources[id].observations.at(-1);
  changes[id] = {cohort:old.cohort,old,new:next,reason:id==='toreca'?'成功・全件数一致の変更なし再確認日時を使用。実売日時ではない':'現在候補から外れた固定IDの保存済み確認日時も集計'};
}
const output = {version:1,baselineRef:ref,baselineAt:original.generatedAt,checkedAt:new Date().toISOString(),
  changes,externalAcquisitionCount:0,note:'同じ旧データ・同じ固定ID群・同じ時刻の集計修正だけを比較。今回の店舗実取得による鮮度改善はpriority-price-impact.jsonで別監査。'};
fs.writeFileSync(path.join(root,'data/freshness-correction-audit.json'),JSON.stringify(output));
console.log(JSON.stringify(changes));
