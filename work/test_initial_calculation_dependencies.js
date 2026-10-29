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
(async()=>{context().ctx.boot.check();
 for(const patch of [{PurchaseDecisionModel:{}},{LimitDisplayModel:undefined},{LimitDisplayModel:{}},{CurrentMarketModel:{}},{PurchaseRatioModel:{}}]){
  const c=context(patch);await assert.rejects(c.ctx.boot.init(),e=>e.code==='CALCULATION_DEPENDENCY_UNAVAILABLE');assert.equal(c.fetched,0,'failed dependencies must not load data or produce partial candidates');
 }
 const linked=[...html.matchAll(/<script\s+src="\.\/([^?]+)\?v=([^"]+)"([^>]*)><\/script>/g)];
 const names=linked.map(m=>m[1]);assert(names.indexOf('limit-display-model.js')<names.indexOf('current-market-model.js'));assert(names.indexOf('current-market-model.js')<names.indexOf('app.js'));
 const attributes=fs.readFileSync(path.join(__dirname,'../.gitattributes'),'utf8');
 for(const file of ['decision-model.js','exploration-metrics.js','limit-display-model.js','current-market-model.js','purchase-ratio-model.js','search-controls.js','app.js']){
  const tag=linked.find(m=>m[1]===file);assert(tag,file);assert(!/\b(?:async|defer)\b/.test(tag[3]));
  const integrity=tag[3].match(/integrity="([^"]+)"/)?.[1];assert.equal(integrity,'sha384-'+crypto.createHash('sha384').update(fs.readFileSync(path.join(__dirname,'..',file))).digest('base64'),file+' exact asset version');
  assert.equal(tag[2],'20261029-pop-price-gap');
  assert(attributes.split(/\r?\n/).includes(file+' text eol=lf'),file+' must keep integrity bytes on Windows checkouts');
 }
 console.log('PASS cold dependency validation, simulated missing/old/out-of-order modules, explicit stop before any data load, ordered scripts and pinned integrity hashes; original user event cause remains unconfirmed');
})().catch(e=>{console.error(e);process.exitCode=1});
