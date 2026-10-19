const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=fs.readFileSync('app.js','utf8');
const fetchCode=app.slice(app.indexOf('async function fetchJsonMaybe('),app.indexOf('async function fetchJsonMaybe(')+app.slice(app.indexOf('async function fetchJsonMaybe(')).indexOf('\nasync function ',20));
const glance=app.slice(app.indexOf('const psaPopGlanceCache='),app.indexOf('// Presentation only:'));
const official={ten:100,n:'Test SR',u:'https://www.psacard.com/pop/test/1',f:'2026-10-19T00:00:00Z',sh:'00'},card={id:'test',official};
function setup(fetch){
  const ctx=vm.createContext({Date,Map,Set,Error,TextEncoder,URL,console:{error(){}},crypto:require('node:crypto').webcrypto,
    fmt:new Intl.NumberFormat('ja-JP'),escapeHtml:String,state:{psaSpecificationHeld:{}},document:{querySelectorAll:()=>[]},
    window:{},uiDataManifest:{revision:'v1',hashes:{}},uiFetchCache:new Map(),uiLoadMetrics:[],loadedDataRevision:0,uiDataInvalid:false,
    els:{catalogCoverageSummary:{}},performance:{now:()=>0,getEntriesByName:()=>[]},fetch});
  vm.runInContext(fetchCode+'\n'+glance+'\nglobalThis.api={ensurePsaPopGlance,psaPopGlance,sourceKey:psaPopSourceKey,cache:psaPopGlanceCache};',ctx);return ctx;
}
const response=(value,ok=true)=>({ok,status:ok?200:404,url:'https://test.local/data.json',text:async()=>typeof value==='string'?value:JSON.stringify(value)});
(async()=>{
  for(const fetch of [async()=>response(null,false),async()=>{throw Error('network');},async()=>response('{bad'),async()=>response({version:1,cards:{}})]){
    const c=setup(fetch);await c.api.ensurePsaPopGlance([card]);const text=c.api.psaPopGlance(card);
    assert(text.includes('要約読込失敗'));assert(!text.includes('比較履歴不足'),'null/error is not missing history');
  }
  let c=setup(async()=>response({version:2,cards:{}}));await c.api.ensurePsaPopGlance([card]);assert(c.api.psaPopGlance(card).includes('要約読込失敗'));
  c=setup(async()=>response({version:2,cards:{}}));c.uiDataManifest.hashes['data/psa-pop-glance/00.json']='wrong';
  await c.api.ensurePsaPopGlance([card]);assert(c.uiDataInvalid);assert(c.api.psaPopGlance(card).includes('要約読込失敗'));
  let requests=0;
  c=setup(async()=>{requests++;return response({version:2,cards:{test:[Date.parse(official.f),100,require('./build_psa_pop_glance').sourceKey(official),1]}});});
  await c.api.ensurePsaPopGlance([card]);assert(c.api.psaPopGlance(card).includes('実測1点のみ'));
  await c.api.ensurePsaPopGlance([card]);assert.equal(requests,1,'same published shard is fetched once');
  assert(c.api.psaPopGlance({...card,official:{...official,ten:101}}).includes('公開要約と最新POPが不一致'));
  assert(c.api.psaPopGlance({...card,official:{...official,u:official.u+'/other'}}).includes('不一致'));
  c.uiDataManifest.revision='v2';await c.api.ensurePsaPopGlance([card]);assert.equal(requests,2,'new version cannot reuse stale display/cache promises');
  assert.equal(c.loadedDataRevision,0,'display summary does not invalidate finance');
  await c.api.ensurePsaPopGlance([{...card,id:'newly-visible'}]);assert(c.api.psaPopGlance({...card,id:'newly-visible'}).includes('要約読込失敗'),'missing later-visible records cannot remain loading or become history shortage');
  const b=require('./build_psa_history');let rows=[];
  const selected={url:official.u,ten:100,total:120,fetchedAt:'2026-10-17T00:00:00Z',captureVersion:2,completeSnapshot:true};
  rows=b.appendObservation(rows,selected,'spec');rows=b.appendObservation(rows,{...selected,fetchedAt:'2026-10-18T00:00:00Z'},'spec');
  assert.equal(rows.length,2,'unchanged POP on a real later day is a new observation');
  rows=b.appendObservation(rows,{...selected,fetchedAt:'2026-10-18T01:00:00Z'},'spec');assert.equal(rows.length,2,'same day remains one day');
  assert.strictEqual(b.appendObservation(rows,{...selected,fetchedAt:null},'spec'),rows,'failed/skipped fetch cannot create an observation');
  const {certify}=require('./recover_psa_pop_evidence'),fixture={id:'fixture',name:'Test SR [S4 100/100]'};
  const raw={set:'S4',no:'100',name:'Test SR',url:'https://www.psacard.com/pop/tcg-cards/test/1',ten:100,total:120,captureVersion:2,completeSnapshot:true,fetchedAt:'2026-10-18T00:00:00Z'};
  const target={n:raw.name,e:'Test SR',u:raw.url,f:official.f},store={identities:{},sources:{}};
  b.reconcileHistory(store,fixture.id,[],raw,b.cardIdentity(fixture));
  const cert=certify(raw,fixture,target,store.identities.fixture,Date.parse(official.f));
  assert.equal(cert.point[3].observedAt,raw.fetchedAt,'recovery retains original acquisition time');
  for(const bad of [{...raw,captureVersion:null},{...raw,fetchedAt:null},{...raw,url:raw.url+'/other'}, {...raw,total:0},{...raw,name:'Test SR Reverse Holo'}])
    assert(!certify(bad,fixture,target,store.identities.fixture,Date.parse(official.f)).point,'uncertain recovery is never made comparable');
  const merge=require('./resolve_generated_merge');
  const merged=merge.mergeReceipts({pipelines:{priority:{runId:'new',recordedAt:'2026-10-19T02:00:00Z'}}},
    {pipelines:{priority:{runId:'old',recordedAt:'2026-10-19T01:00:00Z'},pokedata:{runId:'pd',recordedAt:'2026-10-19T01:30:00Z'}}});
  assert.equal(merged.pipelines.priority.runId,'new');assert.equal(merged.pipelines.pokedata.runId,'pd','independent source receipt survives publication races');
  assert.throws(()=>merge.mergeReceipts({},{}),/schema/);
  assert(!require('./build_one_item_completion_audit').classify({m:['psa10Trades'],i:{psa10Trades:['定期再確認']}}).includes('現在掲載なし'),'unprovided periods are not confirmed absent trades');
  const displayContext=vm.createContext({Date,Object,Number,Set});
  vm.runInContext(app.slice(app.indexOf('function mergePsaDisplayHistory('),app.indexOf('async function renderPsaHistory('))+'\nglobalThis.merge=mergePsaDisplayHistory;',displayContext);
  const p0=['20261017',90,110,{observedAt:'2026-10-17T00:00:00Z',sourceUrl:raw.url,specificationIdentity:store.identities.fixture}];
  const actual={cards:{fixture:[cert.point]},identities:{fixture:store.identities.fixture},sources:{fixture:raw.url}};
  const recovered={cards:{fixture:{identity:store.identities.fixture,sourceUrl:raw.url,points:[p0]}}};
  assert.equal(displayContext.merge(actual,recovered).fixture.length,2,'recovered dated evidence reaches the existing lazy chart too');
  assert.equal(displayContext.merge(actual,{cards:{fixture:{...recovered.cards.fixture,identity:'other'}}}).fixture.length,1,'other specification never reaches the chart');
  const {completeDays}=require('./build_psa_pop_glance');
  const observed=new Set(['20261019','20261018','20261017','20261016','20261015','20261014','20261013','20261012']);
  assert(completeDays(observed,Date.parse('2026-10-19T00:00:00Z'),7));
  observed.delete('20261017');observed.add('20261011');
  assert(!completeDays(observed,Date.parse('2026-10-19T00:00:00Z'),7),'enough points elsewhere do not fill an unobserved day');
  console.log('PASS actual fetch-null/errors/version/cache vs history, unchanged daily observations, no invented day');
})().catch(e=>{console.error(e);process.exitCode=1;});
