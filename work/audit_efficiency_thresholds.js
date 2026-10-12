const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { load, specifiedUrl } = require('./audit_search_profit_consistency');
const root = path.join(__dirname, '..');
function userUrl() {
  const url = new URL(specifiedUrl);
  url.searchParams.delete('priceMax');
  for (const [key, value] of Object.entries({roi:25,buyBelowCap:0,purchaseMin:0,purchaseMax:26000,
    effMin:40,effManual:'off',sellDays:7,payoutDays:3,effBuy:'auto',effScenario:'current',effRef:1,headroomMin:-25})) url.searchParams.set(key, String(value));
  return url.href;
}
const digest = rows => crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
function build(at = new Date().toISOString()) {
  const url = userUrl(), api = load(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), at, {url});
  const cards = api.prepareCalculatedCards(api.state.cards);
  const original = api.state.efficiencyMin;
  const financeBefore = digest(cards.map(c => [c.id,c.buyLimits,c.purchaseDecision]));
  const settingsBefore = api.computationKey();
  const pool = cards.filter(c => !api.cardSearchExclusions(c, {efficiency:false}).length);
  const cases = [];
  let priorIds = [];
  for (const minimum of [40,30,20,0,null]) {
    api.state.efficiencyMin = minimum;
    const selected = cards.filter(c => !api.cardSearchExclusions(c).length);
    const ids = selected.map(c => c.id);
    for (const id of priorIds) assert(ids.includes(id), 'Lower search threshold must retain candidates');
    const summary = api.efficiencySummary(selected);
    cases.push({minimum,final:ids.length,ids,addedSincePrevious:ids.filter(id => !priorIds.includes(id)),
      efficiencyStates:summary,now:selected.filter(c => api.presetQualifications(c).now).length,
      impliedMinimumHoldingRoi:minimum == null ? null : minimum * (api.state.lockDays + api.state.efficiencySaleDays + api.state.efficiencyPayoutDays) / 365});
    priorIds = ids;
    assert.equal(api.computationKey(),settingsBefore,'Search threshold must not invalidate financial calculations');
    assert.equal(api.state.minAnnualEfficiency,40,'Search sweep must not change the judgment threshold');
  }
  api.state.efficiencyMin = original;
  assert.equal(financeBefore,digest(cards.map(c => [c.id,c.buyLimits,c.purchaseDecision])));
  const reasons = {}, examples = [];
  for (const card of pool) {
    const value = api.cardEfficiency(card);
    const failures = api.cardSearchExclusions(card).filter(reason => reason.includes('資金効率'));
    for (const reason of new Set(failures)) reasons[reason] = (reasons[reason] || 0) + 1;
    if (Number.isFinite(value.annual)) examples.push({id:card.id,name:card.name,buy:value.purchasePrice,
      investment:value.investment,profit:value.profit,roi:value.roi,days:value.days,annual:value.annual,
      basis:value.basis,scenario:value.scenario,exit:value.exitLabel,state:value.calculationState,warnings:value.warnings});
  }
  return {version:1,at,urlHash:digest(url),privacy:'Personal capital values and full URL are not republished.',
    catalog:cards.length,poolWithoutEfficiencyFilter:pool.length,poolStates:api.efficiencySummary(pool),
    otherConditionsUnchanged:true,limitsAndGoUnchanged:true,calculationHash:financeBefore,
    judgmentMinimumAnnual:api.state.minAnnualEfficiency,judgmentReturnDays:api.state.lockDays,
    searchHoldingDays:api.state.lockDays+api.state.efficiencySaleDays+api.state.efficiencyPayoutDays,
    judgmentImpliedMinimumRoi:api.state.minAnnualEfficiency*api.state.lockDays/365,
    searchBasis:api.state.efficiencyBuy,searchScenario:api.state.efficiencyScenario,
    exitPolicy:api.state.exitPolicy,includeReference:api.state.efficiencyIncludeReference,
    cases,reasons,examples:examples.sort((a,b)=>b.annual-a.annual).slice(0,12),
    note:'Same data, card cohort and time; only effMin changes. Reference exploration is not purchase GO. Annualization is neither loss protection nor a guaranteed yearly return.'};
}
if (require.main === module) {
  const report = build(process.env.EFFICIENCY_AUDIT_AT || new Date().toISOString());
  const output = process.env.EFFICIENCY_AUDIT_OUTPUT || 'data/efficiency-threshold-audit.json';
  fs.writeFileSync(path.join(root,output),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({at:report.at,pool:report.poolWithoutEfficiencyFilter,states:report.poolStates,cases:report.cases.map(({ids,addedSincePrevious,...row})=>row),reasons:report.reasons,examples:report.examples.slice(0,2)}));
}
module.exports = {build,userUrl};
