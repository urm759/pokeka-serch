const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8'),html=fs.readFileSync('index.html','utf8'),model=require('../psa10-listing-counts'),controls=require('../search-controls');
const fields=['listingCurrentMin','listingCurrentMax','listingMeanMin','listingMeanMax','rawListingCurrentMin','rawListingCurrentMax','rawListingMeanMin','rawListingMeanMax'];
for(const name of fields){assert.equal((html.match(new RegExp('id="'+name+'Input"','g'))||[]).length,1);assert(controls.active({id:name+'Input',type:'number',value:'0'}));assert(controls.removable(name+'Input'));}
const {load}=require('./audit_search_profit_consistency'),at='2026-11-04T08:00:00Z';
const api=load(source,at,{url:'https://urm759.github.io/pokeka-serch/?listingCurrentMin=0&listingCurrentMax=99&listingMeanMin=2.5&listingMeanMax=50&bbRatio75Min=1.02&bbRatioRef=1&bb7=3'});
for(const [name,value]of fields.map((key,i)=>[key,[0,99,2.5,50,null,null,null,null][i]])){assert.equal(api.state[name],value);if(value!==null)assert.equal(api.buildShareUrl().searchParams.get(name),String(value));}
for(const name of fields.slice(4)){api.state[name]=0;assert.equal(api.buildShareUrl().searchParams.get(name),'0');}
assert.equal(api.state.buyback75RatioMin,1.02);assert.equal(api.buildShareUrl().searchParams.get('bbRatio75Min'),'1.02');assert.equal(api.state.minBuyback7,3,'legacy URL retains its meaning');
const key=api.computationKey();for(const name of fields)api.state[name]=null;assert.equal(api.computationKey(),key,'display filters do not invalidate financial calculation');
for(const name of fields)assert(!api.buildShareUrl().searchParams.has(name));
assert(html.indexOf('id="buybackRatioSearch"')<html.indexOf('id="currentMarketControls"'),'75-day search is near the top');
const legacy=html.match(/<details id="legacyBuybackPostingDays" hidden>([\s\S]*?)<\/details>/)?.[1];assert(legacy);
for(const id of ['buyback7MinInput','buyback7MaxInput','buyback30MinInput','buyback30MaxInput','buyback90MinInput','buyback90MaxInput','postingDaysMinInput']){assert(legacy.includes('id="'+id+'"'));assert.equal(html.split('id="'+id+'"').length,2);}
assert(source.includes('...verifiedListingCsvFields(card)'));assert(source.includes("...Object.fromEntries(explorationFields.map"),'URL/save/CSV use existing declarative numeric bindings');
const context=vm.createContext({state:{verifiedListingStatus:'ready',verifiedListingReferences:{version:1,source:'MINTORE',scope:'provider-listed-psa10-and-clean-v1',catalogHash:'exact-version',receipts:[['2026-11-04T07:00:00Z',null,'hash','url']],cards:{test:[[12,0,0],[4,0,1]]}}},uiDataManifest:{hashes:{'data/pokemon-cards.json':'exact-version'}},explorationMetrics:{listingCounts:model},Date:class extends Date{static now(){return Date.parse(at);}},Number});
vm.runInContext(source.slice(source.indexOf('const verifiedListingFields='),source.indexOf('async function ensureVerifiedListingReferences'))+'globalThis.api={verifiedListingView,verifiedListingExclusions,verifiedListingCsvFields};',context);
const card={id:'test',identityKey:'exact'},v=context.api.verifiedListingView(card);assert.equal(v.current.lower,12);assert.equal(v.mean30.days,1);assert.equal(context.api.verifiedListingCsvFields(card)[0],12);assert.equal(context.api.verifiedListingCsvFields(card)[6],false);assert.equal(context.api.verifiedListingCsvFields(card)[10],4);
assert.equal(context.api.verifiedListingView({...card,id:'different'}).current,null,'never transfer another card');
assert.deepEqual(Array.from(context.api.verifiedListingExclusions(card)),[]);context.state.listingCurrentMax=20;assert(context.api.verifiedListingExclusions(card).some(r=>r.includes('判定不可')),'a visible lower bound cannot establish an upper bound');
context.state.listingCurrentMax=null;context.state.rawListingCurrentMin=5;assert(context.api.verifiedListingExclusions(card).some(r=>r.includes('美品')&&r.includes('下限未達')));
console.log('PASS listing search URL/save bindings/CSV, default-off ranges, identity-bound common model, financial cache unchanged, and visible75-day/legacy active posting-day separation');
