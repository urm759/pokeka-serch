const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const builder = fs.readFileSync(path.join(__dirname, 'build_purchase_limit_audit.js'), 'utf8');
const prefix = builder.slice(0, builder.indexOf('const calculated = prepareCalculatedCards(state.cards);'));
const inject = `
for (const [key,file] of Object.entries({ReleaseYearFilter:'release-year-filter',CandidateVisibility:'candidate-visibility',PurchaseRatioModel:'purchase-ratio-model'})) window[key]=require('../'+file+'.js');
`;
const sourceLine = 'const source = fs.readFileSync(path.join(root, "app.js"), "utf8");';
const ref = process.argv[3];
if (ref && !/^[a-f0-9]{7,40}$/.test(ref)) throw new Error('Expected a commit hash');
const setup = prefix.replace(sourceLine, inject + (ref
  ? `const source = require('node:child_process').execFileSync('git',['show','${ref}:app.js'],{cwd:root,encoding:'utf8',maxBuffer:32000000});`
  : sourceLine));
const end = `
const old = source.includes('function cardSearchExclusions(') ? null : source.slice(source.indexOf('    .filter((card) => {',source.indexOf('function render()')),source.indexOf('    .sort((left, right) => {',source.indexOf('function render()')));
vm.runInContext('globalThis.filterApi={state,presetQualifications,'+(old ? 'exclude:card=>('+old.trim().replace(/^\\.filter\\(/,'').replace(/\\)$/, '')+')(card)?[]:["旧フィルター除外"]' : 'exclude:cardSearchExclusions,buildSearchAudit')+'};',context);
const api=context.filterApi;
const calculated=prepareCalculatedCards(state.cards);
const financialHash=require('node:crypto').createHash('sha256').update(JSON.stringify(calculated.map(c=>[c.id,c.price,c.psa10,c.buyLimits?.clean,c.purchaseDecision,c.psaDecision]))).digest('hex');
vm.runInContext('globalThis.normalizedQuery="";globalThis.compactQuery="";',context);
const rows=[];
for(const mode of ['combined','curated','now','low-risk','turnover','bargain']) {
  state.purchaseMode=mode;
  const cards=prepareCalculatedCards(state.cards);
  const key=mode==='low-risk'?'lowRisk':mode;
  const base=cards.filter(c=>api.presetQualifications(c)[key]);
  const final=base.filter(c=>api.exclude(c).length===0);
  const audit=api.buildSearchAudit?.(cards);
  rows.push({mode,presetOnly:base.length,displayed:final.length,ids:final.map(c=>c.id),now:final.filter(c=>api.presetQualifications(c).now).length,
    periodHeld:final.filter(c=>c.forecastPeriodMismatch).length,sequential:audit?.sequential||null,
    examples:final.slice(0,3).map(c=>({id:c.id,name:c.name,storePrice:c.currentStoreOffer?.value??null,limit:c.buyLimits?.clean?.finalMaxPrice??null,horizonMismatch:!!c.forecastPeriodMismatch})),
    exclusions:Object.fromEntries([...new Set(base.flatMap(c=>api.exclude(c)))].map(r=>[r,base.filter(c=>api.exclude(c).includes(r)).length]))});
}
const result={generatedAt:new Date().toISOString(),catalog:state.cards.length,financialHash,settings:{minSaleTx:state.minSaleTx,minRoi:state.minRoi,maxPsa10:state.maxPsa10,lockDays:state.lockDays,capital:state.psaCapital,lockedCapital:state.lockedCapital,reserve:state.gradingReserve,targetProfit:state.minExpectedProfit,targetRoi:state.minExpectedRoi,annualEfficiency:state.minAnnualEfficiency,exitPolicy:state.exitPolicy},rows};
if(process.argv[2])fs.writeFileSync(path.join(root,process.argv[2]),JSON.stringify(result));
console.log(JSON.stringify(result.rows.map(({ids,...row})=>row)));
`;
// Run the production audit's setup without writing its operational history.
new Function('require','__dirname','process',setup+end)(require,__dirname,process);
