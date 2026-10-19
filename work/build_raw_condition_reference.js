const fs=require('node:fs'),path=require('node:path');
const reference=require('./raw_condition_reference'),{atomicWrite}=require('./acquisition_retry');
function shard(id){let n=0;for(const c of String(id))n=(n*31+c.charCodeAt(0))>>>0;return n%16;}
function build(root=path.join(__dirname,'..'),now=Date.now()) {
  const read=(f,d={})=>{try{return JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));}catch{return d;}};
  const cards=read('data/pokemon-cards.json',[]),byId=new Map(cards.map(c=>[c.id,c])),rows=new Map();
  const add=(source,row)=>{const c=byId.get(row.cardId || row.quarantinedCardId);if(!c)return;
    const title=row.title || row.name || '',kind=reference.condition(title,row.state || (row.conditionAccepted===true?'A':''));
    const same=row.identityVerified===true&&!row.cardMismatchSuspected&&(kind!=='sealed-single'||reference.sameIssue(c,title));
    const acceptable=kind==='sealed-single'||row.conditionAccepted!==false;
    if(!['mint','sealed-single'].includes(kind))return;
    const at=Date.parse(row.observedAt),fresh=String(row.observedAt||'').includes('T')&&Number.isFinite(at)&&at<=now&&now-at<=48*3600000;
    const value={source,url:row.detailUrl || null,condition:kind,title,price:Number.isFinite(row.price)?row.price:null,
      stock:Number.isInteger(row.stock)?row.stock:null,available:row.available===true,observedAt:row.observedAt || null,
      adopted:same&&acceptable&&fresh&&row.available===true&&row.price>0&&!row.priceQuarantined,
      reason:!same?'同一仕様の根拠不足':!acceptable?'美品状態の確認不足':!fresh?'古値・日時不明':row.available!==true?'在庫なし/不明':row.priceQuarantined?'価格確認待ち':!(row.price>0)?'価格未取得':'参考採用・購入GO/美品中央値とは別'};
    const list=rows.get(c.id)||[];list.push(value);rows.set(c.id,list);
  };
  for(const source of ['cardrush','hareruya2','yuyutei','torecacamp'])for(const row of read(`work/${source}_catalog.json`,[]))add(source,row);
  for(const row of read('work/single-sealed-reference-quotes.json',[]))add(row.source,row);
  const input=read('work/domestic-raw-sale-evidence.json',{individual:[],aggregates:[]});
  const permitted=input.permission==='confirmed'&&typeof input.permissionEvidence==='string'&&input.permissionEvidence.trim()&&input.marketScope==='domestic';
  if(permitted)for(const r of [...(input.individual||[]),...(input.aggregates||[])])if(byId.has(r.cardId)&&!rows.has(r.cardId))rows.set(r.cardId,[]);
  const supplied=permitted&&Number.isFinite(Date.parse(input.period?.start))&&Date.parse(input.period.start)<Date.parse(input.period.end)&&Date.parse(input.period.end)<=now;
  const end=supplied?input.period.end:new Date(now).toISOString(),start=supplied?input.period.start:new Date(now-30*86400000).toISOString(),shards=Array.from({length:16},()=>({version:1,cards:{}}));
  const counts={cards:0,saleMeans:0,aggregateMeans:0,storeMeans:0,singleSealedRows:0};
  for(const [id,list]of rows){
    const c=byId.get(id),unique=new Map();
    for(const r of list){const key=r.source+'|'+r.url,old=unique.get(key);if(!old||(Date.parse(r.observedAt)||-Infinity)>(Date.parse(old.observedAt)||-Infinity))unique.set(key,r);}
    const evidence=[...unique.values()],adopted=evidence.filter(r=>r.adopted),stores=new Map();
    for(const r of adopted){const prices=stores.get(r.source)||[];prices.push(r.price);stores.set(r.source,prices);}
    const median=a=>{const s=[...a].sort((a,b)=>a-b),i=Math.floor(s.length/2);return s.length%2?s[i]:(s[i-1]+s[i])/2;};
    const storeValues=[...stores.values()].map(median);
    const verified=records=>(records||[]).filter(r=>r.cardId===id&&reference.sameIssue(c,r.title)).map(r=>({...r,identityVerified:true}));
    const actual=reference.sales(verified(permitted?input.individual:[]),{start,end}),aggregate=reference.aggregates(verified(permitted?input.aggregates:[]),{start,end});
    const record={period:{start,end,days:(Date.parse(end)-Date.parse(start))/86400000},sales:actual,aggregate,
      stores:{kind:'store-offer',mean:storeValues.length?storeValues.reduce((a,b)=>a+b,0)/storeValues.length:null,independent:stores.size,
        mint:adopted.filter(r=>r.condition==='mint').length,sealed:adopted.filter(r=>r.condition==='sealed-single').length,
        method:'重複URLを除き、店舗内中央値の店舗間単純平均。販売提示であり実成約平均/成約件数/既存中央値ではない'},evidence,
      decisionImpact:false,note:'単品未開封を美品と参考比較するが区分保持。PSA10確約ではなく、既存の仕入れ式/美品中央値/GOに代用しない'};
    shards[shard(id)].cards[id]=record;counts.cards++;counts.saleMeans+=actual.mean!=null;counts.aggregateMeans+=aggregate.mean!=null;counts.storeMeans+=record.stores.mean!=null;counts.singleSealedRows+=evidence.filter(r=>r.condition==='sealed-single').length;
  }
  const dir=path.join(root,'data/raw-condition-reference');fs.mkdirSync(dir,{recursive:true});
  shards.forEach((data,i)=>atomicWrite(path.join(dir,i+'.json'),data,0));
  const summary={version:1,generatedAt:new Date(now).toISOString(),counts,individualSalesSource:'国内の許諾/記録根拠付き個別成約のみ。海外・出品・店舗在庫を成約へ代用しない',initialLoad:false};
  atomicWrite(path.join(root,'data/raw-condition-reference-summary.json'),summary,0);return summary;
}
if(require.main===module)console.log(JSON.stringify(build()));module.exports={build,shard};
