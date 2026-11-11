const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const model=require('../search-controls');
const html=fs.readFileSync('index.html','utf8'),baseline=JSON.parse(fs.readFileSync('work/fixtures/search-organization-baseline.json','utf8'));
const {load,specifiedUrl}=require('./audit_search_profit_consistency');
function controls(h) {
  const attr=(s,k)=>s.match(new RegExp(`\\b${k}="([^"]*)"`))?.[1];
  return [...h.matchAll(/<input\b([^>]*)>|<select\b([^>]*)>([\s\S]*?)<\/select>/g)].map(m=>{
    const a=m[1]??m[2];return [attr(a,'id'),m[1]!=null?attr(a,'value')||'':m[3].replace(/\s+/g,' ').trim(),/\bchecked\b/.test(a)];
  }).filter(r=>r[0]).sort((a,b)=>a[0].localeCompare(b[0]));
}
const ratioAdditions=['listingMean200MinInput','listingMean200MaxInput','rawListingMean200MinInput','rawListingMean200MaxInput','rawListingCurrentMinInput','rawListingCurrentMaxInput','rawListingMeanMinInput','rawListingMeanMaxInput','listingCurrentMinInput','listingCurrentMaxInput','listingMeanMinInput','listingMeanMaxInput','buybackMeanMinInput','buyback7RatioMinInput','buyback30RatioMinInput','buyback75RatioMinInput','buybackRatioDaysMinInput','buybackRatioReferenceInput'];
const buyAdditions=['calculationBuyModeInput','medianBuyPctInput'];
assert.deepEqual(controls(html).find(r=>r[0]===buyAdditions[0]),[buyAdditions[0],'<option value="median" selected>素体参考相場・中央値へ統一</option><option value="store">旧・現在買える状態A価格で比較</option><option value="legacy">旧設定を保持して比較</option>',false]);
assert.deepEqual(controls(html).find(r=>r[0]===buyAdditions[1]),[buyAdditions[1],'',false],'optional hypothetical percentage starts off');
for(const id of ratioAdditions){const row=controls(html).find(r=>r[0]===id);assert(row,'authorized optional ratio control present: '+id);assert.equal(row[1],'');assert.equal(row[2],false,'new ratio controls remain disabled by default');}
assert.deepEqual(controls(html).filter(row=>!row[0].startsWith('observation') && !['buybackHighestMinInput','psa9AboveGuideInput','psa9GuideMinInput','psa9CostWithin5Input','psa9RoiMinInput',...ratioAdditions,...buyAdditions].includes(row[0])).map(row=>row[0]==='profitSearchBasisInput'?[row[0],row[1].replace('<option value="current-target">利益確保の仕入れ目安で購入・現相場基準（探索）</option>',''),row[2]]:row[0]==='efficiencyScenarioInput'?[row[0],row[1].replace(/<option value="obs(?:7|30|75|200)">[^<]*<\/option>/g,''),row[2]]:row[0]==='efficiencyBuyInput'?[row[0],row[1].replace(/<option value="(?:store|median|reference-min)"(?: selected)?>[^<]*<\/option>/g,''),row[2]]:row),baseline.controls,'existing IDs/options survive; only enumerated authorized additions are separated');
for(const days of [7,30,75,200])assert(html.includes(`value="obs${days}"`),'all declared average choices exist');
for(const [id,value,type] of [['roiInput','20','number'],['expectedRoiFilterInput','0','number'],['floorStateInput','stable','select'],['purchaseBelowCurrentCapInput','', 'checkbox']]) {
  const el={id,value,type,checked:true,tagName:type==='select'?'SELECT':'INPUT',options:[{value:'all'},{value:'stable'}]};
  assert(model.clear(el));assert.equal(el.checked,type==='checkbox'?false:true);assert.equal(el.value,type==='checkbox'?'':type==='select'?'all':'');
}
for(const id of ['saleFeeRateInput','exitPolicyInput','lockedCapitalInput','minExpectedRoiInput','psa9RatioAggregateInput','efficiencyIncludeReferenceInput','profitSearchBasisInput','year2020Input','actualPurchaseMinInput','psaMaxInput','showSkippedInput']) {
  const el={id,value:'8',checked:true,type:'number'};assert(!model.clear(el));assert.equal(el.value,'8');assert.equal(el.checked,true);
}
assert(model.active({id:'roiInput',type:'number',value:'0'}));assert(!model.active({id:'roiInput',type:'number',value:''}));
for(const id of ['minFloorScoreInput','psaRateMinInput','saleTxMaxInput','purchaseHeadroomMinInput']) assert(model.active({id,type:'number',value:'0'}),'valid zero filter must remain visible');
assert(!model.active({id:'saleTxMinInput',type:'number',value:'0'}));
assert(!model.applicable('roiInput',{purchaseMode:'current-market',currentMarketSearchKind:'cap',profitSearchBasis:'auto'}));
assert(model.applicable('roiInput',{purchaseMode:'current-market',currentMarketSearchKind:'cap',profitSearchBasis:'current-cap'}));
assert(!model.applicable('snkrRawProfitMinInput',{purchaseMode:'combined'}));
assert(!model.applicable('efficiencyMinInput',{purchaseMode:'snkr-raw'}));
const app=fs.readFileSync('app.js','utf8');
assert.match(app,/data-clear-extra-conditions/);assert.match(app,/active-filter-chips/);
assert(!app.slice(app.indexOf('function renderActiveFilters'),app.indexOf('async function loadCandidateReductionAudit')).includes('savedItems.join'));
assert.match(html,/id="decisionCalculationSettings"/);
assert(!html.includes('performance-evaluation-time'),'frozen evaluation time is local preview only');
assert(!app.includes('window.Date=FixtureDate'),'production clock and freshness are unchanged');
const css=fs.readFileSync('styles.css','utf8');
// Exact financial/filter bodies from public 0e8eb13c0; no Git history required on shallow CI.
const releasedFunctionHashes={"buildBuyLimits":"42afeb1305afed426731f0c1873aad766502cfec21d0fbe0f5e00f556dac84bb","finalizeCardDecision":"9ca2a8ca14ae16ee53a45a84a3df6167a1c2a3d80d3f78b24e901de0c6c1fd33","calc":"635844c295b4c9a51c1888126dbbb47250dc2b8f76d62c7ee4e0d79f97bda09b","computeSearchProfitView":"4e03c758f8ad8d55cab995f32aa10a97c2843880d4b3b4131fa858333034bb61","prepareCalculatedCards":"42753a0a40dd7dab29cbcf19e283752e0d958471f35a3c15942fc7ad42b55572","computeCardSearchExclusions":"1c940ddd56a80199fc75b8da00d357af32ee40a65cba22f69f57943f12ed69f5","buildShareUrl":"084eb510ddab03b0e9987b7190128a5d74c13d5f12d3d9c52f54216cab0638bd"};
const functionBody=(text,name)=>{const start=text.indexOf('function '+name+'('),end=text.indexOf('\nfunction ',start+1);assert(start>=0,name);return text.slice(start,end<0?undefined:end);};
const approved=JSON.parse(fs.readFileSync('work/fixtures/search-organization-approved-20261103.json','utf8'));
assert.equal(approved.publicCommit,'0ef283576f6267642e20ad522629c078f98c0f11');
assert.deepEqual(Object.keys(approved.protectedFunctions).sort(),Object.keys(baseline.protectedFunctions).sort());
assert.match(css,/\.quick-presets \.preset-audit-summary\{grid-column:1\/-1/,'mobile preset audit spans the full grid, not a narrow column');
assert.match(css,/\.search-settings \[hidden\]\{display:none!important\}/,'display classes must not expose irrelevant hidden mode controls');
assert.match(app,/if \(activeConditionKey===key\) return/,'unchanged active filters are not rebuilt');
// The requested actual-buy branch is pinned separately; removing only that exact
// branch must leave the immutable legacy finance/search bodies unchanged.
function beforeRequestedBuyMigration(text){
  const start=text.indexOf("  if(['store','median'].includes(state.calculationBuyMode)",text.indexOf('function computeSearchProfitView(')),end=text.indexOf('  if(referenceSearchEnabled()',start);
  const branch=text.slice(start,end);
  assert.equal(crypto.createHash('sha256').update(branch).digest('hex'),'5f49fa6bc5594c9e99b28db5e62d17c146920303ce6e4406f4ebb6c9c6dcda62','only the separately tested shared median/store branch is authorized');
  return text.slice(0,start)+text.slice(end);
}
const legacyApp=beforeRequestedBuyMigration(app.replace(/\r\n/g,'\n'))
  .replace('  url.searchParams.set("calcBuy",state.calculationBuyMode);\n','')
  .replace(" && !(['store','median'].includes(state.calculationBuyMode) && profitView.horizonDays===0)",'')
  .replace("const ratioView = currentMode || state.calculationBuyMode==='median' ?","const ratioView = currentMode ?");
for(const [name,expected] of Object.entries(baseline.protectedFunctions)) {
  const source=legacyApp
    // Authorized two-mode routing is tested in test_two_search_modes, not a financial formula change.
    .replace('"combined", "specified", "curated"','"combined", "curated"')
    .replace("  if (mode === 'specified') reasons.push(...specifiedDataExclusions(card));\n",'')
    .replace("mode !== 'specified' && !currentMode",'!currentMode')
    .replace(/specifiedFilterEnabled\(mode,'[^']+'\) && /g,'')
    .replace(/  if \(state.purchaseMode === 'specified'\) for\(const \[id,param\][^\n]+\n/,'')
    .replace(/      const forecastFilterActive = [^\n]+\n/,'')
    .replace("(mode !== 'specified' || forecastFilterActive) && !currentMode",'!currentMode')
    .replace('  url.searchParams.set("preset", quickSearchMode(state.purchaseMode));','  if (["curated", "combined", "bargain", "turnover", "now", "aggressive", "snkr-raw", "current-market"].includes(state.purchaseMode)) url.searchParams.set("preset", state.purchaseMode);\n  else url.searchParams.delete("preset");')
    // Explicit observation-window migration and display-only overseas helpers are separately tested.
    .replace(/const overseasGlanceCache=new Map\(\),overseasGlanceRequests=new Map\(\);[\s\S]*?(?=\/\/ Presentation only:)/,'')
    .replaceAll("'obs75'","'obs90'")
    .replace("  url.searchParams.delete('obs90Min');url.searchParams.delete('obs90Max');\n",'')
    .replace("  filterUrl.search=new URLSearchParams(migrateObservationControls(Object.fromEntries(filterUrl.searchParams),true).value).toString();\n",'')
    // Promo identity equivalence is tested separately; all financial gates stay hash-protected.
    .replaceAll(' || searchIndexModel?.matchesCard(card,state.q)','')
    // Only the audited price-evidence selector changed, not these financial gates.
    // Its stale/reference/true-conflict behaviour is covered by test_price_comparison.
    .replaceAll('(card.priceAggregation?.comparison || card.priceAggregation)?.conflicted','card.priceAggregation?.conflicted')
    .replaceAll('decisionModel.priceReview(priceAggregation).conflicted','priceAggregation.conflicted')
    // Record-level quarantine was authorized and tested separately; this guard protects all remaining financial gates.
    .replaceAll('decisionModel.hasBlockingDataAnomaly(card.dataQuality)','card.dataQuality?.dataAnomaly')
    .replace('  priceAggregation.comparison = decisionModel.comparablePriceEvidence(priceAggregation, { now: Date.now(), divergencePct: 35 });\n','')
    .replace("reasons.push(efficiency.observation?.reference && !state.observationIncludeReference ? '単体資金効率・観測不足の参考平均を対象外' : efficiency.calculationState", "reasons.push(efficiency.calculationState")
    .replace(/  if \(mode !== 'now' && \(explicitBasis \|\| state.profitSearchBasis\) === 'current-target'\) \{[\s\S]*?\n  }\n/,'')
    .replace(/  if \(diagnostic && normalizedQuery && state.diagnosticSearch\) \{[\s\S]*?\n  }\n/,'')
    .replace('      if (state.purchaseBelowCurrentCap)', '      if (diagnostic && normalizedQuery && state.diagnosticSearch) return reasons;\n      if (state.purchaseBelowCurrentCap)')
    .replace("['current-cap','current-target'].includes(profitView.basis)","profitView.basis === 'current-cap'")
    .replace("['limit','current-cap','current-target']","['limit','current-cap']")
    // Optional PSA9 guide comparisons are covered by test_psa9_guide_*; old financial gates stay protected.
    .replace("  const psa9GuideReason = psa9GuideExclusion(card);\n  if(psa9GuideReason) reasons.push(psa9GuideReason);\n",'')
    .replace('  url.searchParams.set("psa9AboveGuide",state.psa9AboveGuide?"1":"0");\n','')
    .replace('  url.searchParams.set("psa9Cost5",state.psa9CostWithin5?"1":"0");\n','')
    .replace("  reasons.push(...observationSearchExclusions(card));\n",'')
    .replace("  const buybackReason = buybackHighestExclusion(card);\n  if (buybackReason) reasons.push(buybackReason);\n",'')
    .replace("  if (state.observationIncludeReference === false) url.searchParams.set('obsRef','0'); else url.searchParams.delete('obsRef');\n",'')
    .replace("    if (state[field] == null && param.startsWith('obs') && url.searchParams.has(param)) url.searchParams.set(param,'off');\n    else if",'    if');
  const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);
  const oldHash=crypto.createHash('sha256').update(source.slice(start,end<0?undefined:end)).digest('hex');
  // Keep the original fixture. Later authorized reference-buy/plan migrations are
  // tested separately; this release must still match the exact pre-change public code.
  if(oldHash!==expected){const actual=crypto.createHash('sha256').update(functionBody(legacyApp,name)).digest('hex');
    assert([releasedFunctionHashes[name],approved.protectedFunctions[name]].includes(actual),'financial/filter function differs from both immutable reviewed public releases: '+name);}
}
const oldApp=process.argv.includes('--report')?execFileSync('git',['show','a37fbbfa:app.js'],{encoding:'utf8',maxBuffer:10000000}):app;
const at=process.env.SEARCH_ORGANIZATION_AT || new Date().toISOString();
const reports=[];
for(const preset of process.argv.includes('--report') ? ['combined','now','current-market','low-risk','turnover','snkr-raw'] : ['combined']) {
  const url=new URL(specifiedUrl);url.searchParams.set('preset',preset);
  const after=load(app,at,{url:url.href}),before=process.argv.includes('--report')?load(oldApp,at,{url:url.href}):after;
  const b=after.prepareCalculatedCards(after.state.cards),a=before===after?b:before.prepareCalculatedCards(before.state.cards);
  assert.equal(JSON.stringify(a.map(c=>[c.id,c.buyLimits,c.purchaseDecision])),JSON.stringify(b.map(c=>[c.id,c.buyLimits,c.purchaseDecision])));
  const ids=(api,rows)=>rows.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id);
  assert.equal(JSON.stringify(ids(before,a)),JSON.stringify(ids(after,b)));
  assert.equal(before.buildShareUrl().href,after.buildShareUrl().href,'URL serialization remains compatible');
  reports.push({preset,count:ids(after,b).length,calculationUnchanged:true,idsUnchanged:true});
}
if(process.argv.includes('--report'))fs.writeFileSync('data/search-organization-validation.json',JSON.stringify({version:1,at,baseline:'a37fbbfa',controls:controls(html).length,profiles:reports,financialModelChanged:false,removedFunctions:0},null,2)+'\n');
console.log('PASS search inventory, safe explicit clear, default/URL compatibility and '+reports.length+' preset profile(s) '+JSON.stringify(reports));

assert.match(html,/<option value="reference-min" selected>/,'authorized reference-min default stays explicit; legacy auto remains a distinct option');
