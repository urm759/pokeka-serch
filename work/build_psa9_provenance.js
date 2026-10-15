const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sales=require('./psa9_sale_statistics'),ROOT=path.join(__dirname,'..');
const hash=b=>crypto.createHash('sha256').update(String(b).replace(/\r\n/g,'\n')).digest('hex');
function build(root=ROOT,now=Date.now()) {
  const inputs={},read=(file,fallback={})=>{const p=path.join(root,file);if(!fs.existsSync(p)){inputs[file]=null;return fallback;}const b=fs.readFileSync(p);inputs[file]=hash(b);return JSON.parse(b);};
  const cards=read('data/pokemon-cards.json',[]),input=read('work/domestic-psa9-authorized-sales.json');
  read('data/snkr-raw-flip-summary.json');read('data/state-a-price-audit.json');
  const counts={catalog:cards.length,mintoreAggregate:0,aggregateDateKnown:0,aggregateDateUnknown:0,domesticIndividual:0,savedExplicitEstimates:0},details={};
  for(const c of cards){const aggregate=Number.isFinite(c.snkPsa9Price)&&c.snkPsa9Price>0,individual=sales.summarize(c,{...input,trades:(input.trades||[]).filter(r=>r.cardId===c.id)},now);
    const dateKnown=String(c.psa9ObservedAt||'').includes('T')&&Number.isFinite(Date.parse(c.psa9ObservedAt))&&Date.parse(c.psa9ObservedAt)<=now;
    if(aggregate){counts.mintoreAggregate++;counts[dateKnown?'aggregateDateKnown':'aggregateDateUnknown']++;}
    if(individual.validRows)counts.domesticIndividual++;
    if(Number(c.psa9EstimatedPrice)>0)counts.savedExplicitEstimates++;
    if(aggregate||individual.validRows)details[c.id]={aggregate:{value:aggregate?c.snkPsa9Price:null,source:'みんトレ提供の国内PSA9集計',fetchedAt:c.psa9ObservedAt || null,saleAt:null,individualSale:false},individual};
  }
  const gap=require('./audit_raw_psa9_gap').build(root);
  gap.counts.domesticPsa9IndividualSales=counts.domesticIndividual;
  gap.version=2;gap.catalogHash=inputs['data/pokemon-cards.json'];gap.inputs=inputs;gap.checkedAt=new Date(now).toISOString();
  const result={version:1,generatedAt:gap.checkedAt,catalogHash:gap.catalogHash,inputs,counts,
    overseas:{separate:true,source:'PokeDATA',domesticCountContribution:0,independentDetailsUrl:'./data/pokedata/manifest.json'},
    estimateDefinition:'素体からの仮置きや推定モデルは個別実成約へ加算しない。既存推定の算出ロジックは不変更',
    collectorStatus:input.permission==='confirmed'?'許諾済み保存分の集計のみ・定期取得接続は別確認':'取得未実装・許諾/正規提供待ち',
    note:'取得日時と成約日時は別。国内個別成約は許諾済み同一仕様/通貨/グレード/成約IDだけ。未取得の期間総件数はnull、同日同額は別IDなら別取引。',detailsUrl:'./data/domestic-psa9-provenance-details.json'};
  fs.writeFileSync(path.join(root,'data/raw-psa9-gap-audit.json'),JSON.stringify(gap));
  fs.writeFileSync(path.join(root,'data/psa9-provenance-audit.json'),JSON.stringify(result));
  fs.writeFileSync(path.join(root,'data/domestic-psa9-provenance-details.json'),JSON.stringify({generatedAt:result.generatedAt,catalogHash:result.catalogHash,cards:details}));
  const route=read('data/domestic-psa9-route-audit.json');
  delete inputs['data/domestic-psa9-route-audit.json'];
  if(route.version){route.catalogSnapshot={generatedAt:result.generatedAt,catalogHash:result.catalogHash,counts};fs.writeFileSync(path.join(root,'data/domestic-psa9-route-audit.json'),JSON.stringify(route));}
  const statusPath=path.join(root,'data/update-status.json');
  if(fs.existsSync(statusPath)){const status=JSON.parse(fs.readFileSync(statusPath));status.psa9Provenance={...result,inputs:undefined};fs.writeFileSync(statusPath,JSON.stringify(status));}
  return result;
}
function verify(root=ROOT){const r=JSON.parse(fs.readFileSync(path.join(root,'data/psa9-provenance-audit.json')));for(const [file,digest]of Object.entries(r.inputs||{})){const p=path.join(root,file);if(digest===null&&!fs.existsSync(p))continue;if(digest===null||!fs.existsSync(p)||hash(fs.readFileSync(p))!==digest)throw Error('PSA9 audit input version mismatch: '+file);}for(const file of ['data/raw-psa9-gap-audit.json','data/domestic-psa9-provenance-details.json']){const d=JSON.parse(fs.readFileSync(path.join(root,file)));if(d.catalogHash!==r.catalogHash||(d.generatedAt || d.checkedAt)!==r.generatedAt)throw Error('PSA9 summary/detail version mismatch: '+file);}const statusPath=path.join(root,'data/update-status.json');if(fs.existsSync(statusPath)){const copy=JSON.parse(fs.readFileSync(statusPath)).psa9Provenance;if(!copy||copy.catalogHash!==r.catalogHash||copy.generatedAt!==r.generatedAt||JSON.stringify(copy.counts)!==JSON.stringify(r.counts))throw Error('PSA9 update-status copy version mismatch');}return true;}
if(require.main===module)console.log(JSON.stringify(process.argv.includes('--verify')?verify():build()));
module.exports={build,verify};
