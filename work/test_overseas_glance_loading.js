const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8'),code=app.slice(app.indexOf('const overseasGlanceCache='),app.indexOf('const psaPopGlanceCache='));
const card={id:'test',identityKey:'same',psa10:10000,psa10ObservedAt:'2026-10-19T01:00:00Z'},now=Date.parse('2026-10-19T02:00:00Z');
const row={identity:'same',url:'https://www.pokedata.io/card/test',at:'2026-10-19T01:00:00Z',fx:{rate:150,rateDate:'2026-10-18'},
  psa10:{grade:'PSA10',jpy:12000,count:3,lastSale:'2026-10-18',source:'PokeDATA / eBay 実成約',condition:'PSA10'}};
function setup(fetch){
  const c=vm.createContext({Date,Map,Set,fmt:new Intl.NumberFormat('ja-JP'),escapeHtml:String,document:{querySelectorAll:()=>[]},
    state:{pokedataManifest:{sets:[{localCardIds:['test']}]}},uiDataManifest:{revision:'v1'},fetchJsonMaybe:fetch});
  vm.runInContext(code+'\nglobalThis.api={ensureOverseasGlance,overseasPriceGlance,cache:overseasGlanceCache};',c);return c;
}
(async()=>{
  for(const fetch of [async()=>null,async()=>{throw Error('network');},async()=>({version:2,cards:{}}),async()=>({version:1,cards:[]})]){
    const c=setup(fetch);await c.api.ensureOverseasGlance([card]);
    assert(c.api.overseasPriceGlance(card,'psa10',now).includes('要約読込失敗'));
  }
  let calls=0;const c=setup(async()=>{calls++;return {version:1,cards:{test:row}};});
  await c.api.ensureOverseasGlance([card]);await c.api.ensureOverseasGlance([card]);assert.equal(calls,1);
  assert(c.api.overseasPriceGlance(card,'psa10',now).includes('+20.0%'));
  assert(c.api.overseasPriceGlance(card,'psa10',now).includes('最終成約 2026-10-18'));
  assert(c.api.overseasPriceGlance({...card,identityKey:'other'},'psa10',now).includes('仕様不一致'));
  assert(!c.api.overseasPriceGlance(card,'psa10',now+50*3600000).includes('国内比'));
  c.uiDataManifest.revision='v2';await c.api.ensureOverseasGlance([card]);assert.equal(calls,2);
  const missing=setup(async()=>({version:1,cards:{}}));await missing.api.ensureOverseasGlance([card]);
  assert(missing.api.overseasPriceGlance(card,'psa10',now).includes('実成約未取得'));
  let resolveOld;const race=setup(()=>new Promise(resolve=>{resolveOld=resolve;}));
  const first=race.api.ensureOverseasGlance([card]);race.uiDataManifest.revision='v2';
  race.fetchJsonMaybe=async()=>({version:1,cards:{test:{...row,psa10:{...row.psa10,jpy:13000}}}});
  await race.api.ensureOverseasGlance([card]);resolveOld({version:1,cards:{test:row}});await first;
  assert.equal(race.api.cache.get('test').psa10.jpy,13000,'old asynchronous response cannot replace new version');
  for(const bad of [{...row,url:'javascript:bad'},{...row,psa10:{...row.psa10,jpy:null}},{...row,psa10:{...row.psa10,count:2}}]){
    const c=setup(async()=>({version:1,cards:{test:bad}}));await c.api.ensureOverseasGlance([card]);assert(c.api.overseasPriceGlance(card,'psa10',now).includes('要約読込失敗'));
  }
  console.log('PASS overseas summary null/schema/identity/stale/version/race handling; visible-only loading; no financial fallback');
})().catch(e=>{console.error(e);process.exitCode=1;});
