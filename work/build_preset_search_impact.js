const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.join(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const before = read('work/preset-filter-before.json');
const after = read('work/preset-filter-after.json');
const baseline = '87ca19d';
for (const key of Object.keys(before.settings)) {
  if (before.settings[key] !== after.settings[key]) throw new Error(`Comparison settings differ: ${key}`);
}
if (before.catalog !== after.catalog) throw new Error('Comparison card cohorts differ');
const priorModel = JSON.parse(execFileSync('git', ['show', `${baseline}:data/purchase-limit-model-audit.json`], {cwd:root,maxBuffer:64*1024*1024,encoding:'utf8'}));
const currentModel = read('data/purchase-limit-model-audit.json');
if (!before.financialHash || before.financialHash !== after.financialHash) throw new Error('Same-data financial model comparison differs');
const oldRows=new Map(priorModel.rows.map(row=>[row.cardId,row]));
const dataChanges=currentModel.rows.filter(row=>JSON.stringify(row)!==JSON.stringify(oldRows.get(row.cardId)));
const result = {
  version:1, generatedAt:new Date().toISOString(), baseline, catalog:after.catalog,
  settings:after.settings, cohort:'同じ国内カード群・同じ設定。公開一覧の海外ID追加は国内の上限へ不使用',
  calculationChanges:0, upperLimitChanges:0, financialHash:after.financialHash, authenticatedSalesAdded:0,
  separateDataUpdate:{affectedRows:dataChanges.length,cards:dataChanges.map(row=>({id:row.cardId,name:row.cardName,beforeMarketPrice:oldRows.get(row.cardId)?.marketPurchasePrice,afterMarketPrice:row.marketPurchasePrice,beforeTheoryLimit:oldRows.get(row.cardId)?.newLimit,afterTheoryLimit:row.newLimit,beforeOperatingLimit:oldRows.get(row.cardId)?.newOperationalLimit,afterOperatingLimit:row.newOperationalLimit}))},
  note:'119日返却に対する91日モデルは参考探索。購入GOを増やした結果ではない。件数は利用者の追加条件で変わる。',
  presets:after.rows.map(row=>{
    const old=before.rows.find(previous=>previous.mode===row.mode);
    const oldIds=new Set(old.ids);
    const recovered=row.ids.filter(id=>!oldIds.has(id));
    const sequentialExcluded=Object.values(row.sequential||{}).reduce((a,b)=>a+b,0);
    if (row.presetOnly-sequentialExcluded!==row.displayed) throw new Error(`Counts do not reconcile: ${row.mode}`);
    return {mode:row.mode,beforePreset:old.presetOnly,afterPreset:row.presetOnly,beforeDisplayed:old.displayed,afterDisplayed:row.displayed,
      recovered:recovered.length,recoveredIds:recovered,now:row.now,periodHeld:row.periodHeld,
      sequential:row.sequential,overlapping:row.exclusions,examples:row.examples};
  })
};
fs.writeFileSync(path.join(root,'data/preset-search-impact.json'), JSON.stringify(result));
console.log(JSON.stringify(result.presets.map(({recoveredIds,examples,...row})=>row)));
