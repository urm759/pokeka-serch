const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../current-market-model.js'),'utf8');
const browser={window:{},console};vm.createContext(browser);vm.runInContext(source,browser);
const cm=browser.window.CurrentMarketModel;assert(cm);assert.throws(()=>cm.assertDependencies(),e=>e.code==='CALCULATION_DEPENDENCY_UNAVAILABLE'&&/classifyCap/.test(e.message));
browser.window.LimitDisplayModel={summarize(){}};assert.throws(()=>cm.evaluate({card:{}},{}),/classifyCap/);
browser.window.LimitDisplayModel=require('../limit-display-model');assert.equal(cm.assertDependencies().classifyCap(9999).cap,9500,'late valid dependency is resolved at use, not captured as undefined');
assert.equal(cm.targetGuide({eligible:false},{fee:10000,minProfit:0,minRoi:10}).cap,null);
browser.window.LimitDisplayModel=undefined;assert.throws(()=>cm.targetGuide({eligible:false},{}),/classifyCap/,'dependency disappearance fails explicitly');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const bindings=app.split('// Browser event bindings start here;')[0];
function context(overrides={}){let fetched=0;const w={PurchaseDecisionModel:require('../decision-model'),PurchaseRatioModel:require('../purchase-ratio-model'),LimitDisplayModel:require('../limit-display-model'),CurrentMarketModel:require('../current-market-model'),ExplorationMetrics:require('../exploration-metrics'),...overrides};const ctx=vm.createContext({window:w,document:{getElementById:()=>null,querySelectorAll:()=>[]},console,URL,URLSearchParams,setTimeout,clearTimeout,fetch:()=>{fetched++;throw Error('test must fail before data loading')}});vm.runInContext(bindings+';globalThis.boot={init,check:assertCalculationDependencies};',ctx);return{ctx,get fetched(){return fetched}};}
async function verifyCatalogRequestOrdering() {
  const {ctx} = context();
  const pending = new Map(), renders = [];
  ctx.deferChunk = url => new Promise((resolve, reject) => pending.set(url, {resolve, reject}));
  ctx.recordRender = value => renders.push(value);
  const fixture = vm.runInContext(`
    fetchJsonMaybe = deferChunk;
    renderContent = () => recordRender({query:state.q, diagnostic:state.diagnosticSearch, ids:[...state.searchRankById.keys()]});
    state.catalogScope = 'analysis';
    state.catalogIndex = ['Alpha','Beta','Gamma','Delta'].map((name,chunk) => ({name,id:name,chunk,status:'分析可能'}));
    state.catalogManifest = {files:state.catalogIndex.map(entry => ({file:entry.name}))};
    function input(query, diagnostic) {
      state.q=query;
      state.diagnosticSearch=diagnostic;
      scheduleCatalogQueryLoad();
      render();
    }
    ({input, runtime:searchRuntime, boot() { searchRuntime.booted=true; scheduleCatalogQueryLoad(); }})
  `, ctx);
  const waitFor = async (condition) => {
    const deadline = Date.now() + 3000;
    while (!condition()) {
      assert(Date.now() < deadline, 'catalog request or render did not settle');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  };
  fixture.input('Alpha',false);
  fixture.input('Alpha',true);
  assert.equal(pending.size,0,'initial input is retained until the initial snapshot is installed');
  fixture.boot();
  await waitFor(() => pending.has('./Alpha'));
  fixture.input('Beta',false);
  await waitFor(() => pending.has('./Beta'));
  pending.get('./Beta').resolve([{id:'Beta'}]);
  await waitFor(() => fixture.runtime.phase==='ready');
  assert.equal(renders.at(-1).query,'Beta','new result renders while the obsolete chunk is still pending');
  const rendered = renders.length;
  pending.get('./Alpha').reject(Error('obsolete request failed'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(renders.length,rendered);
  assert.equal(fixture.runtime.phase,'ready','obsolete error preserves the latest successful search');
  fixture.input('Gamma',false);
  await waitFor(() => pending.has('./Gamma'));
  fixture.input('Gamma',true);
  fixture.input('Gamma',false);
  fixture.input('Gamma',true);
  await new Promise(resolve => setTimeout(resolve, 250));
  pending.get('./Gamma').resolve([{id:'Gamma'}]);
  await waitFor(() => fixture.runtime.phase==='ready');
  assert.equal(renders.at(-1).diagnostic,true,'only the final diagnostic choice is rendered');
  fixture.input('Delta',true);
  await waitFor(() => pending.has('./Delta'));
  pending.get('./Delta').reject(Error('latest request failed'));
  await waitFor(() => fixture.runtime.phase==='error');
  assert.match(fixture.runtime.error,/latest request failed/);
  fixture.input('',false);
  assert.equal(fixture.runtime.phase,'ready','clearing the query clears the query-specific error');
}
(async()=>{context().ctx.boot.check();
 await verifyCatalogRequestOrdering();
 for(const patch of [{PurchaseDecisionModel:{}},{PurchaseDecisionModel:{...require('../decision-model'),stockConfirmationCoverage:undefined}},{LimitDisplayModel:undefined},{LimitDisplayModel:{}},{CurrentMarketModel:{}},{PurchaseRatioModel:{}},{ExplorationMetrics:{}}]){
  const c=context(patch);await assert.rejects(c.ctx.boot.init(),e=>e.code==='CALCULATION_DEPENDENCY_UNAVAILABLE');assert.equal(c.fetched,0,'failed dependencies must not load data or produce partial candidates');
 }
 const linked=[...html.matchAll(/<script\s+src="\.\/([^?]+)\?v=([^"]+)"([^>]*)><\/script>/g)];
 const names=linked.map(m=>m[1]);assert(names.indexOf('limit-display-model.js')<names.indexOf('current-market-model.js'));assert(names.indexOf('current-market-model.js')<names.indexOf('app.js'));
 const attributes=fs.readFileSync(path.join(__dirname,'../.gitattributes'),'utf8');
 for(const file of ['decision-model.js','exploration-metrics.js','limit-display-model.js','current-market-model.js','purchase-ratio-model.js','search-controls.js','app.js','psa10-listing-counts.js']){
  const tag=linked.find(m=>m[1]===file);assert(tag,file);assert(!/\b(?:async|defer)\b/.test(tag[3]));
  const integrity=tag[3].match(/integrity="([^"]+)"/)?.[1];assert.equal(integrity,'sha384-'+crypto.createHash('sha384').update(fs.readFileSync(path.join(__dirname,'..',file))).digest('base64'),file+' exact asset version');
  assert.equal(tag[2],['app.js','search-controls.js','psa10-listing-counts.js'].includes(file)?'20261121-verified-windows':file==='exploration-metrics.js'?'20261113-profit-recovery':file==='decision-model.js'?'20261114-stock-scope':'20261101-guide80-stock');
  assert(attributes.split(/\r?\n/).includes(file+' text eol=lf'),file+' must keep integrity bytes on Windows checkouts');
 }
 assert(names.indexOf('psa10-listing-counts.js')<names.indexOf('exploration-metrics.js'),'shared listing calculations load before the optional search facade');
 const pop=linked.find(m=>m[1]==='gemrate-pop-model.js');assert(pop);assert(names.indexOf('gemrate-pop-model.js')<names.indexOf('app.js'));
 assert.equal(pop[3].match(/integrity="([^"]+)"/)?.[1],'sha384-'+crypto.createHash('sha384').update(fs.readFileSync(path.join(__dirname,'../gemrate-pop-model.js'))).digest('base64'));
 console.log('PASS cold dependency validation, simulated missing/old/out-of-order modules, explicit stop before any data load, ordered scripts and pinned integrity hashes; original user event cause remains unconfirmed');
})().catch(e=>{console.error(e);process.exitCode=1});
