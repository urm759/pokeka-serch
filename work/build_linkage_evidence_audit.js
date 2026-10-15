const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {compareIdentity,extractIdentity}=require('./card_identity');
const ROOT=path.join(__dirname,'..'),hash=b=>crypto.createHash('sha256').update(String(b).replace(/\r\n/g,'\n')).digest('hex');
function build(root=ROOT,now=Date.now()) {
  const inputs={},read=(file,fallback={})=>{const p=path.join(root,file);if(!fs.existsSync(p))return fallback;const bytes=fs.readFileSync(p);inputs[file]=hash(bytes);return JSON.parse(bytes);};
  const cards=read('data/pokemon-cards.json',[]),byId=new Map(cards.map(c=>[c.id,c]));
  const byUrl=new Map();for(const c of cards)for(const field of ['cardrushUrl','hareruya2Url','yuyuteiUrl','torecacampUrl'])if(c[field]){const rows=byUrl.get(c[field])||[];rows.push(c);byUrl.set(c[field],rows);}
  const profiles=read('work/search-profile-targets.json'),priority=new Set((profiles.profiles||[]).flatMap(p=>[...(p.urlsMatched||[]),...(p.prospects||[]).map(r=>r.id)]));
  const sourceStates=read('data/update-status.json').sources || {},priceReview=new Map((read('data/state-a-price-audit.json').cards||[]).map(r=>[r.id,r]));
  for(const c of cards)if(c.setCode==='S6A' || /\[S6a /i.test(c.name))priority.add(c.id);
  const result=[],counts={},add=(card,source,row,expectedGrade='raw')=>{
    if(!card)return;
    const name=row.title || row.name || row.n || '',observedAt=row.priceObservedAt ?? row.fetchedAt ?? row.observedAt ?? row.f ?? null;
    const compared=compareIdentity({name:expectedGrade==='raw'?card.name:`${card.name} PSA10`},expectedGrade==='raw'?{name}:{name:`${name} PSA10`});
    const expected=extractIdentity({name:card.name}),observed=extractIdentity({name});
    // Missing source fields and translated POP labels are not proof of mismatch.
    const missing=['setCode','cardNumber','rarity'].filter(k=>!observed[k]);
    if(expected.variant && expected.variant!==observed.variant)missing.push('仕様表記（通常版/SA/特殊加工）');
    const at=Date.parse(observedAt),stale=!String(observedAt||'').includes('T')||!Number.isFinite(at)||at>now||now-at>48*3600000;
    const mismatch=compared.reasons.filter(r=>!/カード名違い/.test(r));
    const status=mismatch.length?'仕様不一致・要根拠確認':missing.length || !compared.nameCompatible?'根拠不足・曖昧':'仕様一致';
    counts[source] ||= {rows:0,exact:0,held:0,ambiguous:0,stale:0};const n=counts[source];n.rows++;n.exact+=status==='仕様一致';n.held+=mismatch.length>0;n.ambiguous+=status==='根拠不足・曖昧';n.stale+=stale;
    result.push({id:card.id,name:card.name,source,priority:priority.has(card.id),expected,observed,status,reasons:mismatch,missing,sourceTitle:name,url:row.detailUrl || row.url || row.sourceUrl || row.u || null,observedAt,stale,
      grade:expectedGrade,kind:source==='psaOfficial'?'Population・価格ではない':source.startsWith('buyback:')?'PSA10買取提示':'素体販売価格・実成約ではない',price:row.price ?? row.value ?? null,priceConflict:priceReview.get(card.id)?.disputed===true || priceReview.get(card.id)?.evidence==='disputed',priceEvidenceState:priceReview.get(card.id)?.evidence || null,priceQuarantined:row.priceQuarantined===true,sourceStopped:sourceStates[source]?.acquisitionStopped===true,correctionApplied:false});
  };
  for(const [source,file] of [['hareruya2','work/hareruya2_catalog.json'],['torecacamp','work/torecacamp_catalog.json'],['cardrush','work/cardrush_catalog.json'],['yuyutei','work/yuyutei_catalog.json']]) {
    const data=read(file,[]);for(const row of Array.isArray(data)?data:[]){const linked=byId.get(row.cardId || row.quarantinedCardId);if(linked)add(linked,source,row);else for(const card of byUrl.get(row.detailUrl)||[])add(card,source,row);}
  }
  const psa=read('data/psa-population-summary.json');for(const [id,row]of Object.entries(psa.cards||{}))add(byId.get(id),'psaOfficial',row,'PSA10');
  const officialRows=read('data/psa-official-populations.json').rows || [],official=new Map();
  for(const row of officialRows){const key=`${row.sourceUrl}|${row.cardName}`;if(!official.has(key))official.set(key,[]);official.get(key).push(row);}
  for(const row of result.filter(r=>r.source==='psaOfficial')){
    const adopted=psa.cards[row.id],expectedNumber=row.expected.cardNumber.split('/')[0].replace(/^0+/,''),proof=(official.get(`${adopted.u}|${adopted.n}`)||[]).filter(r=>r.setCode?.toUpperCase()===row.expected.setCode&&String(r.cardNo).replace(/^0+/,'')===expectedNumber&&r.fetchedAt===adopted.f&&r.psa10Count===adopted.ten&&r.psaTotal===adopted.total&&r.captureVersion>=2&&r.completeSnapshot===true);
    row.populationProof=proof.length===1?{setCode:proof[0].setCode,number:proof[0].cardNo,ten:proof[0].psa10Count,total:proof[0].psaTotal,fetchedAt:proof[0].fetchedAt,url:proof[0].sourceUrl,languageEvidence:/pokemon-japanese/.test(proof[0].sourceUrl),scope:'世界POP・国内流通在庫ではない',existingMatchMethod:adopted.m}:null;
  }
  for(const [source,field,dateField,grade]of [['mintorePsa10Aggregate','snkPsa10Price','psa10ObservedAt','PSA10'],['mintorePsa9Aggregate','snkPsa9Price','psa9ObservedAt','PSA9']]){
    const adopted=cards.filter(c=>Number(c[field])>0);counts[source]={rows:adopted.length,providerAggregateOnly:adopted.length,individualSales:0};
    for(const c of adopted)result.push({id:c.id,name:c.name,source,priority:priority.has(c.id),grade,kind:'みんトレ国内集計値・個別実成約ではない',price:c[field],observedAt:c[dateField] || null,soldAt:null,identityBasis:'取得元の同一カードID・グレード別フィールド。独立した成約原票による仕様検証とは別',status:'提供元集計・個別成約照合なし',sourceStopped:false});
  }
  const matches=read('work/shop_buyback_item_matches.json'),buyback=read('work/shop_buyback_catalog.json');
  for(const [shop,data]of Object.entries(buyback.shops||{}))for(const row of Array.isArray(data)?data:data.items||[])add(byId.get(row.cardId || matches[`${shop}:${row.shopItemId || row.id}`]),'buyback:'+shop,{...row,observedAt:row.observedAt || null},'PSA10');
  result.sort((a,b)=>Number(b.priority)-Number(a.priority)||a.id.localeCompare(b.id));
  const summary={version:1,generatedAt:new Date(now).toISOString(),catalogTotal:cards.length,catalogHash:inputs['data/pokemon-cards.json'],inputs,counts,rows:result.length,priorityRows:result.filter(r=>r.priority).length,
    corrections:0,note:'保存済み原票の横断監査。値段の乖離は誤紐付けの証拠としない。翻訳・省略仕様は要確認であり、PSA既存厳格照合の代わりではない。原票/長期詳細は初期読込しない。'};
  fs.writeFileSync(path.join(root,'data/linkage-evidence-audit.json'),JSON.stringify(summary));
  fs.writeFileSync(path.join(root,'data/linkage-evidence-details.json'),JSON.stringify({generatedAt:summary.generatedAt,catalogHash:summary.catalogHash,rows:result}));
  const statusPath=path.join(root,'data/update-status.json');if(fs.existsSync(statusPath)){const status=JSON.parse(fs.readFileSync(statusPath));status.linkageEvidence={...summary,inputs:undefined};fs.writeFileSync(statusPath,JSON.stringify(status));}
  return summary;
}
if(require.main===module)console.log(JSON.stringify(build()));
module.exports={build};
