const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {load,specifiedUrl}=require('./audit_search_profit_consistency');
const model=require('../candidate-reduction-model');
const ROOT=path.join(__dirname,'..');
const codec=require('../ui-data-codec');
const zlib=require('node:zlib');
const {atomicWrite}=require('./acquisition_retry');
const jstDay=at=>new Date(Date.parse(at)+9*3600000).toISOString().slice(0,10);
const pack=snapshot=>({codec:'candidate-gzip-v1',data:zlib.gzipSync(Buffer.from(JSON.stringify(snapshot))).toString('base64')});
const unpack=payload=>payload?.codec==='candidate-gzip-v1'?JSON.parse(zlib.gunzipSync(Buffer.from(payload.data,'base64'))):codec.decode(payload);
const read=(file,fallback=null)=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));}catch{return fallback}};
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bindings={efficiencyMinInput:'effMin',efficiencyManualPriceInput:'effManual',efficiencySaleDaysInput:'sellDays',
  efficiencyPayoutDaysInput:'payoutDays',efficiencyBuyInput:'effBuy',efficiencyScenarioInput:'effScenario',
  efficiencyIncludeReferenceInput:'effRef',actualPurchaseMinInput:'purchaseMin',actualPurchaseMaxInput:'purchaseMax',
  purchaseHeadroomMinInput:'headroomMin',purchaseHeadroomMaxInput:'headroomMax',postingRate30MinInput:'postingRate30',
  postingShops30MinInput:'postingShops30',postingDaysMinInput:'postingDays',postingCoverageMinInput:'postingCoverage',
  purchaseBelowCurrentCapInput:'buyBelowCap',expectedProfitFilterInput:'filterExpProfit',
  observationIncludeReferenceInput:'obsRef',...Object.fromEntries([7,30,90,200].flatMap(d=>[['observation'+d+'MinInput','obs'+d+'Min'],['observation'+d+'MaxInput','obs'+d+'Max']]))};
function extraUrl(saved,baseUrl=specifiedUrl){const url=new URL(baseUrl);for(const [id,value]of Object.entries(saved?.inputs||{})){
  const param=bindings[id];if(!param||url.searchParams.has(param)||value==null)continue;
  url.searchParams.set(param,typeof value==='boolean'?value?'1':'0':value===''?'off':value);
}return url.toString();}
function withClock(at,callback){const NativeDate=global.Date;class FixedDate extends NativeDate{
  constructor(...args){super(...(args.length?args:[at]))}static now(){return NativeDate.parse(at)}}
  global.Date=FixedDate;try{return callback()}finally{global.Date=NativeDate}}
function snapshot({ref=null,source,at,url=specifiedUrl}){return withClock(at,()=>{
  const api=load(source,at,{dataRef:ref,url});
  const cards=api.prepareCalculatedCards(api.state.cards),rows={};
  for(const card of cards){const f=api.presetQualifications(card),p=api.searchProfitView(card),ratio=api.purchasePsa9Ratio(card);
    const exclusions=[...new Set(api.cardSearchExclusions(card))];
    rows[card.id]={name:card.name,selected:!exclusions.length,preset:f.combined,now:f.now,
      exclusions,holds:model.holds(card),purchaseState:card.purchasePriceStatus?.code||'unacquired',
      periodHeld:!!card.forecastPeriodMismatch,referenceBasis:p.basis,
      raw:card.price??null,psa10:card.psa10??null,store:card.currentStoreOffer?.value??null,
      storeSource:card.currentStoreOffer?.source||null,storeObservedAt:card.currentStoreOffer?.updatedAt||null,
      searchBuyPrice:p.purchasePrice??p.economics?.purchasePrice??null,
      psa9Price:ratio.psa9Price??null,psa9Ratio:ratio.ratio??null,psa9BuyKind:ratio.purchaseKind??null,
      psa9Type:ratio.measurementType??null,officialRate:card.official?.rate??null,officialTotal:card.official?.total??null,
      psa10Net:p.psa10Net??null,psa10Profit:p.psa10Profit??null,
      expectedProfit:p.economics?.expectedProfit??null,expectedRoi:p.economics?.expectedRoi??null,
      psa10Roi:p.psa10Roi??null,exit:p.exitLabel||null,limit:card.buyLimits?.clean?.finalMaxPrice??null,
      psaMissing:!Number.isFinite(card.official?.rate),specificationHeld:!!api.state.psaSpecificationHeld?.[card.id]};
  }
  return {at,rows,counts:model.counts(rows),missingHistoricalInputs:api.missingHistoricalInputs,
    modelVersion:require('../decision-model').MODEL_VERSION,settingsHash:digest(url),
    calculationHash:digest(cards.map(c=>[c.id,c.buyLimits,c.purchaseDecision]))};
})}
function build(){
  const at=new Date().toISOString(),source=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
  const current=snapshot({source,at});
  const saved=read('work/candidate-reduction-saved-extras.json');
  const savedUrl=extraUrl(saved),overlay=snapshot({source,at,url:savedUrl});
  const latestSaved=read('work/candidate-reduction-saved-extras-latest.json');
  const latestOverlay=latestSaved?snapshot({source,at,url:extraUrl(latestSaved)}):null;
  const previous=unpack(read('work/candidate-search-last.json'));
  const historical=process.argv.includes('--historical');
  const priorReport=read('data/candidate-reduction-audit.json');
  let comparisons=priorReport?.comparisons||{},incomparable=['過去の端末保存条件・実閲覧時刻を保存していない期間は比較不能。元の27件を推測で再現しない。'];
  if(historical){
    const ref='6cef235d',oldSource=execFileSync('git',['show',`${ref}:app.js`],{cwd:ROOT,encoding:'utf8',maxBuffer:10000000});
    const oldAt=read('data/refresh-render-improvement.json').after.at;
    const oldAtOldTime=snapshot({ref,source:oldSource,at:oldAt});
    assert.deepEqual(oldAtOldTime.missingHistoricalInputs,[],'Historical inputs must exist; missing inputs are not current-data fallback');
    const oldAtNow=snapshot({ref,source:oldSource,at});
    const oldCodeNewData=snapshot({source:oldSource,at});
    comparisons={timeOnly:{ref,from:oldAt,to:at,clockBasis:'保存済み監査時刻。実閲覧時刻ではない',missingInputs:oldAtOldTime.missingHistoricalInputs,...model.compare(oldAtOldTime,oldAtNow)},
      dataOnly:{ref,at,...model.compare(oldAtNow,oldCodeNewData)},
      codeOnly:{at,...model.compare(oldCodeNewData,current)}};
    assert.equal(oldCodeNewData.calculationHash,current.calculationHash,'same data/settings/time: limits and GO unchanged');
    assert.equal(comparisons.codeOnly.lostCount+comparisons.codeOnly.gainedCount,0);
  }
  const profileDiff=model.compare(current,overlay);
  const priorDays=fs.existsSync(path.join(ROOT,'work/candidate-search-history'))?fs.readdirSync(path.join(ROOT,'work/candidate-search-history')).filter(f=>f.endsWith('.json')&&f<jstDay(at)+'.json').sort():[];
  const priorDay=priorDays.length?unpack(read('work/candidate-search-history/'+priorDays.at(-1))):null;
  const baseline=priorDay||previous;
  const daily=baseline&&baseline.settingsHash===current.settingsHash&&baseline.modelVersion===current.modelVersion
    ?{from:baseline.at,to:at,basis:priorDay?'前日以前の保存記録':'同日直前の保存記録・前日比較ではない',...model.compare(baseline,current)}:{status:'前回の同URL・同モデル記録なし／比較不能'};
  const report={version:1,at,referenceUrlHash:digest(specifiedUrl),counts:current.counts,
    savedExtraConditionComparison:{capturedAt:saved?.observedAt||null,browserObservedCount:saved?.count??null,
      inputs:saved?.inputs||{},counts:overlay.counts,...profileDiff},comparisons,daily,incomparable,
    latestSavedExtraConditionComparison:latestOverlay?{capturedAt:latestSaved.observedAt,browserObservedCount:latestSaved.count,
      inputs:latestSaved.inputs,counts:latestOverlay.counts,...model.compare(current,latestOverlay),
      sinceInitialCapture:model.compare(overlay,latestOverlay)}:null,
    definitions:'URLのみと保存追加条件は別。重複理由を合算して離脱枚数にしない。価格待ち・期間保留は購入GOではない。6時間更新目標と購入価格48時間有効期限は別。',
    llmCalls:0,codexCalls:0};
  atomicWrite(path.join(ROOT,'data/candidate-reduction-audit.json'),report);
  atomicWrite(path.join(ROOT,'work/candidate-recovery-targets.json'),{at,rows:model.recoveryTargets(current.rows),
    rule:'共有URL参考探索の購入価格補完のみ。固定・重点枠と通常枠を維持。認証・仕様保留は解除しない。復帰・GOの保証ではない'});
  atomicWrite(path.join(ROOT,'work/candidate-search-last.json'),pack(current));
  const dir=path.join(ROOT,'work/candidate-search-history');fs.mkdirSync(dir,{recursive:true});
  const day=jstDay(at),file=path.join(dir,day+'.json');
  if(!fs.existsSync(file))atomicWrite(file,pack(current));
  else {const first=JSON.parse(fs.readFileSync(file,'utf8'));if(first.codec!=='candidate-gzip-v1')atomicWrite(file,pack(unpack(first)));}
  console.log(JSON.stringify({at,current:current.counts,saved:overlay.counts,comparisons:Object.fromEntries(Object.entries(comparisons).map(([k,v])=>[k,{before:v.before,after:v.after,lost:v.lostCount,gained:v.gainedCount,overlap:v.overlap}]))}));return report;
}
if(require.main===module)build();
module.exports={build,snapshot,withClock,extraUrl,bindings,pack,unpack,jstDay};
