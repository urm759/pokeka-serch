const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=(f,d={})=>{try{return JSON.parse(fs.readFileSync(path.join(root,f),'utf8'))}catch{return d}};
const write=(f,x)=>fs.writeFileSync(path.join(root,f),JSON.stringify(x));
function build() {
  const h=read('work/market_stability_history.json'),date=h.dates?.at(-1);
  if(!date)throw new Error('No dated domestic history: preserve previous reference data');
  const horizon=require('../return-horizon-model.js').calibrate(h,date);
  const reference=require('../price-reference-model.js').build(h,read('work/fixed-price-reference.json'),read('data/market-stability-summary.json').cards,date);
  write('data/return-horizon-calibration.json',horizon);
  write('work/fixed-price-reference.json',reference);
  const model=require('../price-reference-model.js'),dir=path.join(root,'data/fixed-price-reference');
  fs.mkdirSync(dir,{recursive:true});
  const buckets={};for(const [id,row]of Object.entries(reference.cards)){const key=model.bucket(id);(buckets[key]||={})[id]=row;}
  for(const [key,cards]of Object.entries(buckets))write(`data/fixed-price-reference/${key}.json`,{asOfDate:date,cards});
  write('data/fixed-price-reference-index.json',{...reference,cards:undefined,baselinePrices:undefined,cohort:undefined,cohortCount:reference.cohort.length,chunkCount:Object.keys(buckets).length});
  console.log(JSON.stringify({date,baseline:reference.baselineDate,cohort:reference.cohort.length,supportWarnings:Object.values(reference.cards).filter(r=>r.breakdownUnresolved).length,horizons:Object.fromEntries(Object.entries(horizon.horizons).map(([d,x])=>[d,x.all]))}));
  return {horizon,reference};
}
if(require.main===module)build();
module.exports={build};
