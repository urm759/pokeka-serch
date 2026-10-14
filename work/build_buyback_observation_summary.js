const fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..'),periods=[7,30,90,200];
const day=at=>Number.isFinite(Date.parse(at))?new Date(Date.parse(at)+9*3600000).toISOString().slice(0,10):null;
function capture(saved,catalog,source,cards) {
  const next=structuredClone(saved || {version:1,shops:{}}),byId=new Map(cards.map(c=>[c.id,c]));
  next.shops ||= {}; const audit={accepted:0,rejected:0,reasons:{}};
  const reject=r=>{audit.rejected++;audit.reasons[r]=(audit.reasons[r]||0)+1;};
  for(const [shop,items] of Object.entries(catalog.shops||{})) {
    const meta=source.shops?.[shop];
    if(!meta?.refreshed || meta.lastAttempt!==meta.lastSuccess || day(meta.lastSuccess)!==catalog.updatedAt) continue;
    for(const item of items) {
      const c=byId.get(item.cardId),quote=source.cards?.[item.cardId]?.shops?.[shop];
      if(!c || c.language!=='ja' || c.identityReviewRequired || !c.identityKey) {reject('仕様未確定');continue;}
      if(!item.active || quote?.quarantined || quote?.listingActive!==true || quote.matchConfidence!=='high' || item.price!==quote.price || quote.priceDate!==day(meta.lastSuccess)) {reject('価格・照合・個別日付不一致');continue;}
      const cleanName=String(item.name).replace(/\s+\d{1,3}\s*\/\s*(?:\d{1,3}|(?:XY|SM|SV|BW|S)-P)\b/ig,'');
      const result=require('./cardshop151').resolve({type:'PSA10',genre:'ポケモンカード',name:cleanName,listNo:item.number||item.name},cards);
      const explicit=String(item.name).match(/\[((?:SV|SM|XY|BW|S|M)[a-z0-9+-]*)\s/i)?.[1];
      const identity=require('./card_identity'),rarity=identity.extractRarity(item.name),cardRarity=identity.extractRarity(c.name,c.rarity);
      const variant=identity.extractVariant(c.name),sourceVariant=identity.extractVariant(item.name);
      if(result.cardId!==c.id || /mirror/.test(variant) && variant!==sourceVariant || item.language && item.language!=='ja' || item.currency && String(item.currency).toUpperCase()!=='JPY' || item.gradingCompany && String(item.gradingCompany).toUpperCase()!=='PSA' || item.grade!=null && !['10','PSA10'].includes(String(item.grade)) || rarity && rarity!==cardRarity || explicit && explicit.toUpperCase()!==String(c.setCode).toUpperCase()) {reject('番号・名称・仕様・日本語の一意照合不可');continue;}
      const observedAt=item.observedAt||meta.lastSuccess, date=day(observedAt);
      if(date!==quote.priceDate || Date.parse(observedAt)>Date.parse(meta.lastSuccess)+60000) {reject('取得日時の証拠不一致');continue;}
      const rows=((next.shops[shop]||={})[c.id]||={});
      const value={price:item.price,observedAt,identity:c.identityKey,url:item.itemUrl||meta.url,method:result.method,timestampBasis:item.observedAt?'individual-fetch':'matching-successful-source-record',grade:'PSA10',currency:'JPY',identityAuditVersion:3,title:item.name,
        campaign:item.campaign===true,quantityLimited:item.quantityLimited===true,conditionsConfirmed:item.conditionsConfirmed!==false};
      if(!rows[date] || Date.parse(rows[date].observedAt)<=Date.parse(observedAt)) rows[date]=value;
      audit.accepted++;
    }
  }
  return {saved:next,audit};
}
function aggregate(saved,source,cards,now=Date.now()) {
  const asOf=day(new Date(now).toISOString()),start=Date.parse(asOf)-364*86400000,byId=new Map(cards.map(c=>[c.id,c]));
  const result={version:1,asOf,periods,staleHours:48,shops:{},cards:{},rule:'確認済み同一日本語PSA10・店舗・同日1記録。店舗別観測平均の中央値を保守出口に使用。欠測補完なし。非10は現在国内PSA9のフリマ仮置き。探索のみ'};
  for(const [shop,entries] of Object.entries(saved.shops||{})) {
    result.shops[shop]={name:source.shops?.[shop]?.name||shop,fulfilment:source.shops?.[shop]?.fulfilment||'mail'};
    for(const [id,dates] of Object.entries(entries)) {
      const c=byId.get(id);if(!c)continue;
      for(const date of Object.keys(dates)) if(Date.parse(date)<start) delete dates[date];
      const records=Object.entries(dates).filter(([date,r])=>r.identityAuditVersion===3 && r.grade==='PSA10' && r.currency==='JPY' && date<=asOf && day(r.observedAt)===date && Date.parse(r.observedAt)<=now && r.identity===c.identityKey && Number.isFinite(r.price) && r.price>0);
      const row={identity:c.identityKey,periods:{}};
      for(const n of periods) {
        const earliest=Date.parse(asOf)-(n-1)*86400000,rows=records.filter(([d])=>Date.parse(d)>=earliest).sort((a,b)=>a[0].localeCompare(b[0]));
        if(rows.length)row.periods[n]=[rows.reduce((s,[,r])=>s+r.price,0)/rows.length,rows.length,rows.at(-1)[1].observedAt];
      }
      if(Object.keys(row.periods).length)(result.cards[id]||={})[shop]=row;
    }
  }
  return result;
}
function build(root=ROOT) {
  const read=(f,fallback)=>fs.existsSync(path.join(root,f))?JSON.parse(fs.readFileSync(path.join(root,f),'utf8')):fallback;
  const source=read('data/shop-buyback-summary.json',{}),cards=read('data/pokemon-cards.json',[]);
  const {saved,audit}=capture(read('work/buyback-price-observations.json',{version:1,shops:{}}),read('work/shop_buyback_catalog.json',{}),source,cards);
  const summary=aggregate(saved,source,cards);summary.captureAudit=audit;
  for(const [f,x] of [['work/buyback-price-observations.json',saved],['data/buyback-observation-summary.json',summary]]) {
    const file=path.join(root,f),text=JSON.stringify(x);if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')===text)continue;
    fs.writeFileSync(file+'.tmp',text);fs.renameSync(file+'.tmp',file);
  }
  return {cards:Object.keys(summary.cards).length,...audit};
}
function recover(refs,root=ROOT) {
  const cp=require('node:child_process'),file=path.join(root,'work/buyback-price-observations.json');
  let saved=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{version:1,shops:{}};const audit=[];
  for(const ref of refs) {
    if(!/^[a-f0-9]{7,40}$/.test(ref))throw Error('Explicit commit hash required for proof recovery');
    const read=f=>JSON.parse(cp.execFileSync('git',['show',ref+':'+f],{cwd:root,maxBuffer:96e6}));
    const result=capture(saved,read('work/shop_buyback_catalog.json'),read('data/shop-buyback-summary.json'),read('data/pokemon-cards.json'));
    saved=result.saved;audit.push({ref,...result.audit});
  }
  fs.writeFileSync(file+'.tmp',JSON.stringify(saved));fs.renameSync(file+'.tmp',file);return audit;
}
if(require.main===module) {
  if(process.argv.includes('--recover-proof'))console.log(JSON.stringify(recover(['6fd5331c','66712a2a'])));
  console.log(JSON.stringify(build()));
}
module.exports={build,capture,aggregate};
