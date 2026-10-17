const fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..'),{shard}=require('./build_psa10_period_statistics');
function project(record,card) {
  const p=record.pokedata||{},norm=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const identity=require('./card_identity');
  if(!record.localCardName||identity.extractVariant(record.localCardName)!==identity.extractVariant(card.name)
    ||identity.extractRarity(record.localCardName)!==identity.extractRarity(card.name,card.rarity)
    ||identity.canonicalIdentity({name:record.localCardName}).key!==identity.canonicalIdentity(card).key)return null;
  const number=require('./card_identity').parseSetAndNumber(card.name,card.model).cardNumber;
  if(record.linkStatus!=='auto-confirmed'||p.language!=='JAPANESE'||record.localCardId!==card.id
    ||!/^https:\/\/(?:www\.)?pokedata\.io\//.test(record.sourceUrl||'')
    ||norm(p.setCode)!==norm(card.setCode)||norm(p.printedNumber)!==norm(number)||card.identityReviewRequired)return null;
  const result={url:record.sourceUrl,at:record.capturedAt,fx:record.fx,identity:card.identityKey};
  for(const [key,market] of [['raw','ebayRaw'],['psa10','ebayPsa10']]) {
    const m=record.markets?.[market];
    if(m?.priceSource!=='actual-sale'||m.grade!==(key==='raw'?'Raw':'PSA10')||!m.usableIndividualMedian||!(m.medianJpy>0)||!(m.adoptedCount>=3))continue;
    result[key]={jpy:m.medianJpy,usd:m.medianUsd,count:m.adoptedCount,lastSale:m.lastSaleDate,period:m.targetPeriod,
      source:'PokeDATA / eBay 実成約',grade:m.grade,condition:key==='raw'?'状態混在・美品相場ではない':'PSA10',
      note:'全取得期間の中央値・現在売価ではない。Estimate/集計出品価格は不採用'};
  }
  return result.raw||result.psa10?result:null;
}
function build(root=ROOT) {
  const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
  const cards=new Map(read('data/pokemon-cards.json').map(c=>[c.id,c]));
  const chunks=Array.from({length:16},()=>({version:1,cards:{}}));
  for(const set of read('data/pokedata/manifest.json').sets||[])for(const [id,row]of Object.entries(read(set.file).cards||{})) {
    if(!cards.has(id))continue;
    const value=project(row,cards.get(id));if(value)chunks[shard(id)].cards[id]=value;
  }
  fs.mkdirSync(path.join(root,'data/overseas-glance'),{recursive:true});
  for(let i=0;i<16;i++) {
    const f=path.join(root,'data/overseas-glance',i+'.json'),text=JSON.stringify(chunks[i]);
    if(!fs.existsSync(f)||fs.readFileSync(f,'utf8')!==text)fs.writeFileSync(f,text);
  }
  return {cards:chunks.reduce((n,c)=>n+Object.keys(c.cards).length,0),bytes:chunks.reduce((n,c)=>n+Buffer.byteLength(JSON.stringify(c)),0)};
}
if(require.main===module)console.log(JSON.stringify(build()));
module.exports={build,project};
