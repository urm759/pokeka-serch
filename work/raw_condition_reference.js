const identity = require('./card_identity');
const clean = text => String(text || '').normalize('NFKC').replace(/【(?:未開封|状態[A-Z][+-]?)】|[（(]未開封[）)]/g,' ').replace(/未開封/g,' ').trim();
function condition(title, state='') {
  if (/BOX|ボックス|パック|複数枚|\d+\s*枚(?:組|セット)|セット商品|デッキ|未開封セット/i.test(title)) return 'excluded-product';
  if (/未開封/.test(title)) return 'sealed-single';
  return /^(?:A|mint)$/.test(state) || /美品|【状態A】/.test(title) ? 'mint' : 'unconfirmed';
}
function sameIssue(card, title) {
  const expected=identity.canonicalIdentity(card), text=clean(title), target=clean(card.name);
  if(condition(title)==='excluded-product' || /PSA|BGS|CGC|ARS|TAG|ACE\s*\d|鑑定品/i.test(text))return false;
  if(identity.extractLanguage(title)!==(card.language || identity.extractLanguage(card.name)))return false;
  const promo=text.match(/(\d+)\s*\/\s*((?:SM|SV|S|XY|BW)-P)\b/i);
  const number=promo ? promo[1] : text.match(/\b\d{1,4}\s*\/\s*\d{1,4}\b/)?.[0];
  const normalizeNumber=n=>String(n||'').split('/').map(s=>String(Number(s.trim()))).join('/');
  const wanted=identity.parseSetAndNumber(card.name,card.model);
  const expectedNumber=String(card.cardNumber || wanted.cardNumber);
  const bracket=String(card.name).match(/\[\s*[^\s\]]+\s+(\d+(?:\/\d+)?)\s*\]/)?.[1];
  if(!number || normalizeNumber(number)!==normalizeNumber(bracket || expectedNumber))return false;
  const set=promo?.[2] || [...text.matchAll(/(?:^|[\s\[【])([A-Za-z]+\d+[A-Za-z0-9+-]*)(?=$|[\s\]】])/g)].map(m=>m[1]).find(s=>identity.normalizeToken(s)===expected.setCode);
  if(identity.normalizeToken(set)!==expected.setCode)return false;
  const base=target.split('[')[0].split(/[:：]/)[0].replace(/\s+(?:MUR|BWR|SSR|CSR|CHR|SAR|UR|HR|SR|RRR|RR|AR|PROMO|P)\b.*$/i,'').trim();
  const sourceBase=text.split(/\s+(?:PROMO|MUR|BWR|SSR|CSR|CHR|SAR|UR|HR|SR|RRR|RR|AR|P)\b|\s+\d+\s*\//i)[0].replace(/\([^)]*\)/g,'').trim();
  if(identity.normalizeToken(base)!==identity.normalizeToken(sourceBase))return false;
  const a=identity.extractIdentity(target), b=identity.extractIdentity(text);
  if(a.variant!==b.variant || identity.extractVariant(target)!==identity.extractVariant(text))return false;
  const rarity=identity.extractRarity(card.name,card.rarity || ''), observed=identity.extractRarity(' '+text.replace(/PROMO/g,'P')+' ');
  return !rarity || rarity===observed;
}
function sales(records, {start,end,complete=false}={}) {
  const valid=[], excluded=[],byId=new Map();
  for(const r of records || []) {
    const at=Date.parse(r.soldAt), key=r.marketplace && r.transactionId ? `${r.marketplace}:${r.transactionId}` : null;
    const kind=condition(r.title || '',r.condition);
    if(r.kind!=='completed-sale' || r.marketScope!=='domestic' || r.language!=='ja' || r.currency!=='JPY' || r.grade!=='raw' || r.unitCount!==1
      || /(?:PSA|BGS|CGC|ARS|TAG|ACE)\s*\d|鑑定品/i.test(r.title||'') || r.identityVerified!==true || !key || !r.evidenceUrl
      || !['mint','sealed-single'].includes(kind) || !Number.isFinite(at) || at<Date.parse(start) || at>Date.parse(end)
      || !Number.isFinite(r.price)||r.price<=0){excluded.push({...r,reason:'成約/仕様/条件/期間/取引IDの根拠不足'});continue;}
    if(byId.has(key)){
      const old=byId.get(key);
      if(old.price!==r.price || old.soldAt!==r.soldAt || old.condition!==kind){old.conflicted=true;excluded.push({...r,reason:'同一取引IDの値が対立'});}
      continue;
    }
    byId.set(key,{...r,condition:kind});
  }
  valid.push(...[...byId.values()].filter(r=>!r.conflicted));
  const count=valid.length || (complete&&!excluded.length?0:null),mean=valid.length?valid.reduce((n,r)=>n+r.price,0)/valid.length:null;
  return {kind:'completed-sale',mean,count,breakdown:Object.fromEntries(['mint','sealed-single'].map(k=>[k,count==null?null:valid.filter(r=>r.condition===k).length])),excluded:excluded.length,rows:valid};
}
function aggregates(records,{start,end}={}) {
  const seen=new Map(),valid=[];
  for(const r of records || []) {
    if(seen.has(r.aggregateId)){const old=seen.get(r.aggregateId);if(JSON.stringify(old)!==JSON.stringify(r))old.conflicted=true;continue;}
    const record={...r};seen.set(r.aggregateId,record);
    if(r.kind!=='completed-sale-aggregate'||r.marketScope!=='domestic'||r.identityVerified!==true||r.language!=='ja'||r.currency!=='JPY'||r.grade!=='raw'||r.unitCount!==1||!r.aggregateId||!r.evidenceUrl
      ||Date.parse(r.start)!==Date.parse(start)||Date.parse(r.end)!==Date.parse(end)||!r.overlapVerified||!r.partitionAuthority||!r.disjointGroup
      ||!['mint','sealed-single'].includes(r.condition)||!Number.isInteger(r.count)||r.count<0
      ||!(r.count===0?r.mean==null:Number.isFinite(r.mean)&&r.mean>0))continue;
    valid.push(record);
  }
  if(valid.some(r=>r.conflicted))return {kind:'completed-sale-aggregate',mean:null,count:null,reason:'同一集計IDの根拠が対立'};
  const keys=valid.map(r=>r.partitionAuthority+':'+r.disjointGroup);
  const compatible=valid.length && new Set(valid.map(r=>r.partitionAuthority)).size===1 && new Set(keys).size===keys.length;
  if(!compatible)return {kind:'completed-sale-aggregate',mean:null,count:null,reason:'母数・期間・重複範囲の根拠不足'};
  const count=valid.reduce((n,r)=>n+r.count,0);
  return {kind:'completed-sale-aggregate',mean:count?valid.reduce((n,r)=>n+r.mean*r.count,0)/count:null,count,rows:valid};
}
module.exports={condition,sameIssue,sales,aggregates};
