const assert=require('node:assert/strict'),fs=require('node:fs');
const {load}=require('./audit_search_profit_consistency');
const {userUrl}=require('./audit_efficiency_thresholds');
const at=new Date().toISOString(),api=load(fs.readFileSync('app.js','utf8'),at,{url:userUrl()});
const before=api.prepareCalculatedCards(api.state.cards);
const financial=JSON.stringify(before.map(c=>[c.id,c.buyLimits,c.purchaseDecision]));
const rows=before.map(c=>api.cardEfficiency(c,Date.parse(at)));
const key=api.computationKey();
api.state.efficiencyMin=0;
assert.equal(api.computationKey(),key);
assert.equal(JSON.stringify(before.map(c=>[c.id,c.buyLimits,c.purchaseDecision])),financial);
for(let i=0;i<before.length;i++)assert.equal(api.cardEfficiency(before[i],Date.parse(at)).profit,rows[i].profit,'search threshold never deducts profit');
api.state.efficiencyMin=40;api.state.minAnnualEfficiency=80;
const after=api.prepareCalculatedCards(api.state.cards);
let comparable=0;
for(let i=0;i<after.length;i++){
  const a=rows[i],b=api.cardEfficiency(after[i],Date.parse(at));
  if(!Number.isFinite(a.annual)||!Number.isFinite(b.annual))continue;
  comparable++;
  assert.equal(a.purchasePrice,b.purchasePrice);
  assert(Math.abs(a.profit-b.profit)<1e-6,'judgment hurdle is not an extra cost in current-sale efficiency');
  assert(Math.abs(a.annual-b.annual)<1e-6);
}
assert(comparable>0);
const app=fs.readFileSync('app.js','utf8');
assert(app.includes('PSA8以下・失敗の確率/売価は未評価'));
assert(rows.some(row=>row.warnings.some(warning=>warning.includes('非10の残り確率をPSA9価格で仮置き'))));
console.log(JSON.stringify({test:'search/judgment efficiency separation',cards:before.length,comparable,settingsChangedInProduction:false}));
