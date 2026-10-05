const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const root = path.join(__dirname,'..');
const ref = process.argv[2];
if (!ref) throw new Error('A verified baseline Git reference is required');
const oldSource = execFileSync('git',['show',`${ref}:app.js`],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
const newSource = fs.readFileSync(path.join(root,'app.js'),'utf8');
const loader = fs.readFileSync(path.join(__dirname,'build_purchase_limit_audit.js'),'utf8').split('const calculated = prepareCalculatedCards(state.cards);')[0]
  .replace('const source = fs.readFileSync(path.join(root, "app.js"), "utf8");','const source = appSource;');
const evaluate = new Function('require','__dirname','appSource',loader+`
  return prepareCalculatedCards(state.cards).map(c=>({id:c.id,cap:c.buyLimits?.clean?.maxPrice??null,
    verdict:c.purchaseDecision?.verdict??null,profit:c.psaDecision?.expectedProfit??null,roi:c.psaDecision?.expectedRoi??null}));`);
const before = evaluate(require,__dirname,oldSource);
const after = evaluate(require,__dirname,newSource);
assert.deepEqual(after,before,'Default decision and cap must stay unchanged for identical data/settings');
const result = {baselineRef:ref,checkedAt:new Date().toISOString(),cardCount:after.length,changedCaps:0,changedVerdicts:0,
  changedExpectedProfits:0,changedExpectedRois:0,comparison:'同じ最新取得データ・既定設定で旧コードと新コードを比較。利用者の0円設定変更は別。'};
fs.writeFileSync(path.join(root,'data/roi-model-impact-audit.json'),JSON.stringify(result));
console.log(JSON.stringify(result));
