const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),ref=process.env.REFERENCE_BASE_COMMIT || '4437445';
const read=(file,baseline=false)=>{try{return JSON.parse(baseline?execFileSync('git',['show',`${ref}:${file}`],{cwd:root,encoding:'utf8',maxBuffer:100*1024*1024}):fs.readFileSync(path.join(root,file),'utf8'));}catch{return null}};
function evaluate(oldCode,baseline){
 const app=oldCode?execFileSync('git',['show',`${ref}:app.js`],{cwd:root,encoding:'utf8',maxBuffer:3000000}):fs.readFileSync(path.join(root,'app.js'),'utf8');
 const window={POKEMON_CARDS_META:read('data/pokemon-cards-meta.json',baseline),PurchaseDecisionModel:require('../decision-model.js'),PriceIntegrity:require('../price-integrity.js'),MarketAnalysisModel:require('../market-analysis.js'),
   ReturnHorizonModel:require('../return-horizon-model.js'),PriceReferenceModel:require('../price-reference-model.js'),PurchaseMemoModel:require('../purchase-memo-model.js'),BacktestModel:require('../backtest-model.js'),CardSearchIndexModel:require('../search-index-model.js'),SnkrRawFlipModel:require('../snkr-raw-flip-model.js')};
 const ctx=vm.createContext({window,document:{getElementById:()=>null,querySelectorAll:()=>[]},console,URL,URLSearchParams,setTimeout,clearTimeout});
 vm.runInContext(app.split('// Browser event bindings start here;')[0]+`\nglobalThis.api={state,prepareCalculatedCards,presetQualifications${oldCode?'':',buildReturnPeriodTrial'}}`,ctx);
 const s=ctx.api.state;s.cards=read('data/pokemon-cards.json',baseline);s.fee=12980;s.lockDays=119;s.gradingReserve=129800;
 for(const [key,file]of Object.entries({catalogCompletion:'card-catalog-completion',priceEvidence:'state-a-price-evidence',marketResearch:'market-research-summary',marketStabilityMeta:'market-stability-summary',regulationPolicy:'regulation-policy',evaluationModel:'evaluation-model',evaluationGovernance:'evaluation-governance',psaServices:'psa-japan-services',operationalLimitHistory:'operational-limit-history'}))s[key]=read(`data/${file}.json`,baseline);
 for(const [key,file]of Object.entries({cardrushStock:'cardrush-stock-summary',hareruya2Stock:'hareruya2-stock-summary',yuyuteiStock:'yuyutei-stock-summary',torecacampStock:'torecacamp-stock-summary',shopBuybacks:'shop-buyback-summary',marketStability:'market-stability-summary',snkrListingSummary:'snkr-listing-summary',snkrRawFlipSummary:'snkr-raw-flip-summary',psaPopulation:'psa-population-summary'}))s[key]=read(`data/${file}.json`,baseline)?.cards||{};
 const b=read('data/shop-buyback-summary.json',baseline);s.buybackShops=b.shops;s.buybackDates=b.dates;s.buybackUpdatedAt=b.updatedAt;
 s.sourceUpdates=Object.fromEntries(['toreca','cardrush','hareruya2','yuyutei','torecacamp'].map(id=>[id,id==='toreca'?window.POKEMON_CARDS_META.updatedAt:read(`data/${id}-stock-summary.json`,baseline)?.updatedAt]));
 s.returnCalibration=read('data/return-horizon-calibration.json');s.fixedPriceReference=read('data/fixed-price-reference-index.json');
 const cards=ctx.api.prepareCalculatedCards(s.cards),rows=Object.fromEntries(cards.filter(c=>c.buyLimits?.clean).map(c=>[c.id,{name:c.name,limit:c.buyLimits.clean.finalMaxPrice,verdict:c.purchaseDecision?.verdict,
   centralProfit:c.psaDecision?.expectedProfit??null,offer:c.currentStoreOffer?.value??null,now:Boolean(ctx.api.presetQualifications(c).now)}]));
 const representatives=oldCode?[]:cards.filter(c=>/メガリザードンXex SAR|スターミーV CSR|グレイシアV SR|リーリエのピッピex SAR|ミュウVMAX.*SA/.test(c.name)&&c.buyLimits?.clean).slice(0,12).map(c=>({id:c.id,name:c.name,currentRaw:c.price,currentPsa10:c.psa10,stableLimit:c.buyLimits.clean.finalMaxPrice,verdict:c.purchaseDecision?.verdict,
   periods:[42,91,119,147].map(days=>{const p=ctx.api.buildReturnPeriodTrial(c,days);return{days,status:p.status,referenceOnly:p.referenceOnly,central:p.centralPrice??null,stress:p.stressPrice??null,centralProfit:p.centralProfit,stressProfit:p.stressProfit,referenceNormalLimit:p.normalLimit??null,referenceStressLimit:p.stressLimit??null,origins:p.evidence?.originDates??0};})}));
 const candidates=cards.filter(c=>ctx.api.presetQualifications(c).combined);
 const immediateReasons={candidateCount:candidates.length,now:candidates.filter(c=>ctx.api.presetQualifications(c).now).length,
   missingOffer:candidates.filter(c=>!c.currentStoreOffer).length,
   aboveStableLimit:candidates.filter(c=>c.currentStoreOffer?.value>c.buyLimits?.clean?.finalMaxPrice).length,
   periodUnverified:candidates.filter(c=>c.forecastPeriodMismatch).length,
   nonPositiveCentralProfit:candidates.filter(c=>c.psaDecision?.expectedProfit<=0).length,
   note:'同一119日設定のおまかせ候補。理由は重複あり、合算しない。価格が不変でも期間未対応・購入先未取得・採算で今すぐにならない。'};
 return {rows,representatives,immediateReasons};
}
function diff(a,b){const rows=[];for(const [id,x]of Object.entries(a.rows)){const y=b.rows[id];if(y&&(x.limit!==y.limit||x.verdict!==y.verdict||x.offer!==y.offer))rows.push({id,before:x,after:y});}return{sameCohort:Object.keys(a.rows).length,changedLimits:rows.filter(r=>r.before.limit!==r.after.limit).length,changedVerdicts:rows.filter(r=>r.before.verdict!==r.after.verdict).length,changedOffers:rows.filter(r=>r.before.offer!==r.after.offer).length,rows};}
const old=evaluate(true,true),newFrozen=evaluate(false,true),current=evaluate(false,false);
const baseCatalog=read('data/card-catalog-completion.json',true),currentCatalog=read('data/card-catalog-completion.json');
const addedYears=Object.entries(currentCatalog.cards).filter(([id,r])=>!baseCatalog.cards[id]?.ry && r.ry).map(([id,r])=>({id,name:read('data/pokemon-cards.json').find(c=>c.id===id)?.name,year:r.ry,date:r.rd,source:r.rs,url:r.ru}));
const lostYears=Object.entries(baseCatalog.cards).filter(([id,r])=>r.ry&&!currentCatalog.cards[id]?.ry).map(([id,r])=>({id,previousYear:r.ry,reason:'公式根拠のないシリーズ番号推測を撤回'}));
const out={at:new Date().toISOString(),baselineCommit:ref,productionModelVersion:require('../decision-model.js').MODEL_VERSION,referenceModelVersion:require('../return-horizon-model.js').VERSION,
  modelOnly:diff(old,newFrozen),realInputsOnly:diff(newFrozen,current),representatives:current.representatives,immediateReasons:current.immediateReasons,
  release:{beforeKnown:baseCatalog.summary.releaseDateKnown+baseCatalog.summary.releaseYearOnly,afterKnown:currentCatalog.summary.releaseDateKnown+currentCatalog.summary.releaseYearOnly,officialAdded:addedYears.length,newlyVisible2020:addedYears.filter(r=>r.year>=2020).length,unverifiedWithdrawn:lostYears.length,addedYears,lostYears},
  warning:'期間試算と固定指数は参考表示・本判定へ未適用。モデル差は同一入力、データ差は同一新コードで比較。実取得4商品の価格・在庫と公式発売年補完は後者。全データ完了とは扱わない'};
if(out.modelOnly.changedLimits||out.modelOnly.changedVerdicts)throw new Error('Reference-only change unexpectedly changed production decision/caps');
fs.writeFileSync(path.join(root,'data/return-reference-audit.json'),JSON.stringify(out));
console.log(JSON.stringify({...out,representatives:out.representatives.slice(0,2),release:{...out.release,addedYears:undefined,lostYears:undefined}}));
