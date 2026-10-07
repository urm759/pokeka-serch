const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const builder = fs.readFileSync(path.join(__dirname, 'build_purchase_limit_audit.js'), 'utf8');
const prefix = builder.slice(0, builder.indexOf('const calculated = prepareCalculatedCards(state.cards);'));
const inject = "window.ReleaseYearFilter=require('../release-year-filter.js');window.CandidateVisibility=require('../candidate-visibility.js');window.PurchaseRatioModel=require('../purchase-ratio-model.js');";
const body = `
const {project,SUMMARY}=require('./build_ui_data.js');
const codec=require('../ui-data-codec.js');
const hash=v=>require('node:crypto').createHash('sha256').update(JSON.stringify(v)).digest('hex');
const cases=[];
for(const scale of [1,2]) {
  const baseCards=read('data/pokemon-cards.json');
  const full={catalogCompletion:read('data/card-catalog-completion.json'),operationalLimitHistory:read('data/operational-limit-history.json'),marketStabilityMeta:read('data/market-stability-summary.json'),marketResearch:read('data/market-research-summary.json')};
  const compact={catalogCompletion:project(SUMMARY[0],full.catalogCompletion),operationalLimitHistory:project(SUMMARY[1],full.operationalLimitHistory),marketStabilityMeta:project(SUMMARY[2],full.marketStabilityMeta),marketResearch:project(SUMMARY[3],full.marketResearch)};
  if(scale===2) for(const data of [...Object.values(full),...Object.values(compact)]) for(const key of ['cards','comparisons']) if(data[key]) for(const [id,row] of Object.entries({...data[key]})) data[key]['scale-'+id]=structuredClone(row);
  state.cards=scale===1?baseCards:[...baseCards,...baseCards.map(c=>({...c,id:'scale-'+c.id}))];
  for(const key of ['cardrushStock','hareruya2Stock','yuyuteiStock','torecacampStock','shopBuybacks','psaPopulation','snkrListingSummary','snkrRawFlipSummary']) if(scale===2) for(const [id,row] of Object.entries({...state[key]})) state[key]['scale-'+id]=structuredClone(row);
  const fullText=JSON.stringify(full), slimText=JSON.stringify(codec.encode(compact));
  const parse={full:[],compact:[],decode:[]},calc={full:[],compact:[]},search=[];
  let reference=null,candidateIds=null;
  for(let i=0;i<3;i++) {
    let start=performance.now();JSON.parse(fullText);parse.full.push(performance.now()-start);
    start=performance.now();const packed=JSON.parse(slimText);parse.compact.push(performance.now()-start);
    start=performance.now();codec.decode(packed);parse.decode.push(performance.now()-start);
    for(const [label,data] of Object.entries({full,compact})) {
      Object.assign(state,data);state.marketStability=data.marketStabilityMeta.cards;
      start=performance.now();const calculated=prepareCalculatedCards(state.cards);calc[label].push(performance.now()-start);
      const values=hash(calculated.map(c=>[c.id,c.buyLimits,c.purchaseDecision,c.psaDecision,c.futurePriceForecast,presetQualifications(c)]));
      const ids=calculated.filter(c=>presetQualifications(c).combined).map(c=>c.id);
      if(label==='full') {reference=values;candidateIds=ids;} else {assert.equal(values,reference);assert.deepEqual(ids,candidateIds);}
    }
    const index=read('data/card-catalog/search-index.json').cards;
    const doubled=scale===1?index:[...index,...index.map(c=>({...c,id:'scale-'+c.id}))];
    start=performance.now();doubled.filter(c=>String(c.n).includes('ピカチュウ')||String(c.no).includes('110/080'));search.push(performance.now()-start);
  }
  cases.push({scale,cards:state.cards.length,fullBytes:Buffer.byteLength(fullText),summaryBytes:Buffer.byteLength(slimText),parseMs:parse,calculationMs:calc,indexSearchMs:search,financialAndCandidateEquality:true,candidateCount:candidateIds.length,financialHash:reference});
}
const result={generatedAt:new Date().toISOString(),environment:'Node v24 production model / 3 repetitions; browser network/paint measured separately',syntheticDouble:true,cases};
write('data/ui-performance-audit.json',result);console.log(JSON.stringify(result));
`;
new Function('require','__dirname','process','assert', prefix.replace('const source = fs.readFileSync',inject+'\nconst source = fs.readFileSync') + body)(require,__dirname,process,assert);
