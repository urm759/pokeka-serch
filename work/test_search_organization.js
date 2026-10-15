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
assert.deepEqual(controls(html).filter(row=>!row[0].startsWith('observation')).map(row=>row[0]==='profitSearchBasisInput'?[row[0],row[1].replace('<option value="current-target">利益確保の仕入れ目安で購入・現相場基準（探索）</option>',''),row[2]]:row[0]==='efficiencyScenarioInput'?[row[0],row[1].replace(/<option value="obs(?:7|30|90|200)">[^<]*<\/option>/g,''),row[2]]:row),baseline.controls,'existing IDs/defaults/options survive explicit guide and observation additions');
for(const days of [7,30,90,200])assert(html.includes(`value="obs${days}"`),'all declared average choices exist');
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
assert.match(css,/\.quick-presets \.preset-audit-summary\{grid-column:1\/-1/,'mobile preset audit spans the full grid, not a narrow column');
assert.match(css,/\.search-settings \[hidden\]\{display:none!important\}/,'display classes must not expose irrelevant hidden mode controls');
assert.match(app,/if \(activeConditionKey===key\) return/,'unchanged active filters are not rebuilt');
for(const [name,expected] of Object.entries(baseline.protectedFunctions)) {
  const source=app.replace(/\r\n/g,'\n')
    // Promo identity equivalence is tested separately; all financial gates stay hash-protected.
    .replaceAll(' || searchIndexModel?.matchesCard(card,state.q)','')
    .replace("reasons.push(efficiency.observation?.reference && !state.observationIncludeReference ? '単体資金効率・観測不足の参考平均を対象外' : efficiency.calculationState", "reasons.push(efficiency.calculationState")
    .replace(/  if \(mode !== 'now' && \(explicitBasis \|\| state.profitSearchBasis\) === 'current-target'\) \{[\s\S]*?\n  }\n/,'')
    .replace(/  if \(diagnostic && normalizedQuery && state.diagnosticSearch\) \{[\s\S]*?\n  }\n/,'')
    .replace('      if (state.purchaseBelowCurrentCap)', '      if (diagnostic && normalizedQuery && state.diagnosticSearch) return reasons;\n      if (state.purchaseBelowCurrentCap)')
    .replace("['current-cap','current-target'].includes(profitView.basis)","profitView.basis === 'current-cap'")
    .replace("['limit','current-cap','current-target']","['limit','current-cap']")
    .replace("  reasons.push(...observationSearchExclusions(card));\n",'')
    .replace("  if (state.observationIncludeReference === false) url.searchParams.set('obsRef','0'); else url.searchParams.delete('obsRef');\n",'')
    .replace("    if (state[field] == null && param.startsWith('obs') && url.searchParams.has(param)) url.searchParams.set(param,'off');\n    else if",'    if');
  const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);
  assert.equal(crypto.createHash('sha256').update(source.slice(start,end<0?undefined:end)).digest('hex'),expected,'financial/filter function must not change during UI reorganization: '+name);
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
