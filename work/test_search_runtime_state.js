const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app.js','utf8'),html=fs.readFileSync('index.html','utf8');
const section=source.slice(source.indexOf('const searchRuntime ='),source.indexOf('function psaChangeBadge('));
const status={dataset:{},innerHTML:'',setAttribute(k,v){this[k]=v;}},count={textContent:'0'},progress={textContent:''},grid={replaceChildren(){this.cleared=true;}};
const context=vm.createContext({window:{location:{href:'https://example.test/?effBuy=auto'}},
 document:{getElementById:id=>id==='searchResultState'?status:null},
 els:{countStat:count,resultProgress:progress,grid},fmt:new Intl.NumberFormat('ja-JP'),URL,
 uiDataManifest:{revision:'same-version'},searchConditionOrigins:new Map(),escapeHtml:s=>String(s),state:{}});
vm.runInContext(section+';globalThis.api={searchRuntime,searchResultStatus,failSearch,urlOnlySearch};',context);
context.api.searchResultStatus('loading');assert.equal(count.textContent,'—');assert.match(status.innerHTML,/読込・計算中/);
context.api.searchRuntime.count=0;context.api.searchResultStatus('ready');assert.match(status.innerHTML,/検索完了：0件/);assert.equal(status.role,'status');
context.api.failSearch(Error('hash mismatch'));assert.equal(count.textContent,'—');assert.equal(status.role,'alert');assert(grid.cleared);assert(!status.innerHTML.includes('検索完了：0件'));
context.window.location.href+='&savedFilters=ignore';assert(context.api.urlOnlySearch());
context.api.searchRuntime.count=17;context.api.searchResultStatus('ready');assert.match(status.innerHTML,/URLのみ.*保存保持/);
assert.match(html,/id="countStat">—/);assert.match(html,/id="searchResultState"[^>]*data-phase="loading"/);
for(const name of ['restoreQuickFilters','persistExplicitSearchSettings','saveQuickFilters'])assert(source.includes('function '+name+'() {\n  if (urlOnlySearch()) return;'),'URL-only never mutates saved filters: '+name);
const probe=require('./search_runtime_probe');
const fake=count=>()=>({state:{cards:[{id:'a'}]},prepareCalculatedCards:c=>c,cardSearchExclusions:()=>count?[]:['test']});
const zero=probe.evaluate('2026-11-04T15:00:00Z',{load:fake(false)});assert(zero.profiles.every(r=>r.status==='zero'&&r.count===0));
const failed=probe.evaluate('2026-11-04T14:59:59Z',{load:()=>{throw Error('missing input')}});assert(failed.profiles.every(r=>r.status==='error'&&r.count===null));
const start=source.indexOf('async function ensureVerifiedListingReferences('),end=source.indexOf('\n}',start)+2;
async function deferredCase(valid){
 let release,rendered=0,failed=0;const request=new Promise(resolve=>release=resolve);
 const ctx=vm.createContext({verifiedListingFields:['listingCurrentMin'],verifiedListingRevision:null,verifiedListingRequest:null,
   state:{listingCurrentMin:1},uiDataManifest:{revision:'r',hashes:{'data/pokemon-cards.json':'catalog'}},
   document:{querySelector:()=>null,querySelectorAll:()=>[]},fetchJsonMaybe:()=>request,
   render:()=>rendered++,failSearch:()=>failed++});
 vm.runInContext(source.slice(start,end)+';globalThis.run=ensureVerifiedListingReferences;',ctx);
 const pending=ctx.run([]);assert.equal(ctx.state.verifiedListingStatus,'loading');assert.equal(rendered,0,'no ready/zero render before the selected data arrives');
 release({version:1,source:'MINTORE',scope:'provider-listed-psa10-and-clean-v1',catalogHash:valid?'catalog':'wrong-version',cards:{}});
 await pending;assert.equal(ctx.state.verifiedListingStatus,valid?'ready':'failed');assert.equal(failed,valid?0:1);
}
async function sharedChunk(){
 let release,calls=0;const request=new Promise(r=>release=r),chunkStart=source.indexOf('const catalogChunkRequests ='),chunkEnd=source.indexOf('\nfunction catalogIndexMatches(',chunkStart);
 const ctx=vm.createContext({Map,state:{catalogLoadedChunks:new Set(),catalogLoadingChunks:new Set(),catalogManifest:{files:[{file:'data/card-catalog/0.json'}]}},uiDataManifest:{revision:'r'},
 fetchJsonMaybe:()=>{calls++;return request;},mergeCatalogCards:rows=>ctx.rows=rows});
 vm.runInContext(source.slice(chunkStart,chunkEnd)+';globalThis.run=loadCatalogChunk;',ctx);
 const a=ctx.run(0),b=ctx.run(0);let secondDone=false;b.then(()=>secondDone=true);await Promise.resolve();assert(!secondDone,'later query joins the in-flight shard rather than returning an empty result');assert.equal(calls,1);
 release([{id:'same'}]);assert(await a);assert(await b);assert.equal(ctx.rows[0].id,'same');assert.equal(ctx.state.catalogLoadingChunks.size,0);
}
async function originalFailure(){
 const start=source.indexOf('async function fetchJsonMaybe('),end=source.indexOf('\nasync function loadDeferredAudits(',start);
 let displayed;const ctx=vm.createContext({uiDataManifest:{revision:'r',hashes:{'data/a.json':'a','data/b.json':'b'}},uiFetchCache:new Map(),uiDataInvalid:false,uiDataError:null,
   failSearch:e=>displayed=e.message,els:{},console:{error(){}},performance:{now:()=>0},fetch:async url=>({ok:false,status:url.includes('a.json')?503:502})});
 vm.runInContext(source.slice(start,end)+';globalThis.run=fetchJsonMaybe;',ctx);
 await ctx.run('./data/a.json');await ctx.run('./data/b.json');assert(ctx.uiDataInvalid);assert.match(displayed,/a.json HTTP 503/,'later load failures and generic version guards retain the first concrete cause');assert.equal(ctx.uiDataError.message,displayed);
}
(async()=>{await deferredCase(true);await deferredCase(false);await sharedChunk();await originalFailure();console.log('PASS loading/zero/error separation, exact-version deferred listing search, shared concurrent shard completion, first HTTP cause retention, read-only URL comparison and live-monitor unknown/error distinction');})().catch(e=>{console.error(e);process.exitCode=1});
