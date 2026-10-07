const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const codec=require('../ui-data-codec'),search=require('../search-index-model');
const root=path.join(__dirname,'..');
const budgets=require('../data/performance-budgets.json');
function median(a){return [...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];}
function violations(result,limits=budgets){
  return Object.entries(limits.maximum).filter(([key,max])=>!Number.isFinite(result[key]) || result[key]>max).map(([key,max])=>`${key}: ${result[key]} / maximum ${max}`);
}
function measure(){
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/ui/manifest.json')));
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const files=[...app.match(/const initialFiles = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map(m=>'data/'+m[1]+'.json');
  const initialBytes=files.reduce((n,f)=>n+fs.statSync(path.join(root,manifest.aliases[f]||f)).size,0);
  const doubledPayload=require('./ui_double_fixture').fixture(root);
  const doubleInitialBytes=files.reduce((n,f)=>n+(doubledPayload.get(manifest.aliases[f]||f)?.length || fs.statSync(path.join(root,manifest.aliases[f]||f)).size),0);
  const parsePayload=double=>{
    const texts=files.map(f=>(double && doubledPayload.get(manifest.aliases[f]||f) || fs.readFileSync(path.join(root,manifest.aliases[f]||f))).toString('utf8'));
    const t=performance.now();texts.forEach(text=>JSON.parse(text));return performance.now()-t;
  };
  const jsonParseMs=median(Array.from({length:3},()=>parsePayload(false))),doubleJsonParseMs=median(Array.from({length:3},()=>parsePayload(true)));
  const index=codec.decode(JSON.parse(fs.readFileSync(path.join(root,manifest.aliases['data/card-catalog/search-index.json'])))).cards;
  const searchTimes=[];
  const doubledIndex=codec.decode(JSON.parse(doubledPayload.get(manifest.aliases['data/card-catalog/search-index.json']))).cards;
  const doubleSearchTimes=[];
  for(let repeat=0;repeat<5;repeat++){
    const t=performance.now();const found=search.search(index,'M2 110/080');searchTimes.push(performance.now()-t);
    assert(found.length && found[0].s.toUpperCase()==='M2' && found[0].no==='110/080');
    const doubleStart=performance.now();const more=search.search(doubledIndex,'M2 110/080');doubleSearchTimes.push(performance.now()-doubleStart);
    assert.deepEqual(more.filter(row=>!row.id.startsWith('scale-')).map(row=>row.id),found.map(row=>row.id));
  }
  const builder=fs.readFileSync(path.join(__dirname,'build_purchase_limit_audit.js'),'utf8');
  const prefix=builder.slice(0,builder.indexOf('const calculated = prepareCalculatedCards(state.cards);'));
  const inject="window.ReleaseYearFilter=require('../release-year-filter');window.CandidateVisibility=require('../candidate-visibility');window.PurchaseRatioModel=require('../purchase-ratio-model');";
  const suffix=`
    vm.runInContext('globalThis.guardApi={calculatedCardsForSearch,gradeRateSummary};',context);
    const api=context.guardApi, timings=[], cached=[];
    const financial=row=>JSON.stringify([row.buyLimits?.clean,row.purchaseDecision,row.psaDecision]);
    let first;
    for(let i=0;i<3;i++){
      let t=performance.now();const rows=api.calculatedCardsForSearch(state.cards,{force:true});timings.push(performance.now()-t);
      if(first)assert.deepEqual(rows.map(financial),first.map(financial));else first=rows;
      t=performance.now();assert.strictEqual(api.calculatedCardsForSearch(state.cards),rows);cached.push(performance.now()-t);
    }
    const t=performance.now();const doubled=api.calculatedCardsForSearch(state.cards.concat(state.cards),{force:true});
    const doubleCalculationMs=performance.now()-t;
    assert.deepEqual(doubled.slice(0,first.length).map(financial),first.map(financial));
    assert.deepEqual(doubled.slice(first.length).map(financial),first.map(financial));
    const detailStart=performance.now();for(const card of first.slice(0,25))api.gradeRateSummary(card);
    return {fullCalculationMs:median(timings),cacheMs:median(cached),doubleCalculationMs,detailSummary25Ms:performance.now()-detailStart,
      cardCount:state.cards.length,calculationValuesEqual:true};`;
  const modelResult=new Function('require','__dirname','process','assert','median',prefix.replace('const source = fs.readFileSync',inject+'\nconst source = fs.readFileSync')+suffix)(require,__dirname,process,assert,median);
  const result={initialBytes,doubleInitialBytes,jsonParseMs,doubleJsonParseMs,searchMs:median(searchTimes),doubleSearchMs:median(doubleSearchTimes),...modelResult};
  const errors=violations(result);
  assert(app.includes("state.openCardDetails.has(String(card.id)) ? `"),'closed details must stay lazy');
  assert(!files.some(f=>/psa-mapping-review|psa-history|performance-guard/.test(f)),'raw audit/history must not become startup payload');
  return {generatedAt:new Date().toISOString(),environment:'Node.js same production calculation/index; not browser paint or gzip transfer',
    fixedQuery:'M2 110/080',repeats:3,settings:'production audit defaults / 119 days',...result,
    limits:budgets.maximum,errors,status:errors.length?'regression':'pass',llmCalls:0,codexCalls:0};
}
if(require.main===module){const result=measure();fs.writeFileSync(path.join(root,'data/performance-guard.json'),JSON.stringify(result));console.log(JSON.stringify(result));if(result.errors.length)process.exitCode=1;}
module.exports={violations,measure};
