const fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..'),identity=require('./card_identity');
const read=f=>JSON.parse(fs.readFileSync(path.join(ROOT,f),'utf8'));
const serial=s=>{const m=String(s||'').normalize('NFKC').match(/(\d{1,4})\s*\/\s*(\d{1,4}|(?:SV|SM|XY|BW|S|M)-P)/i);return m?`${Number(m[1])}/${/^\d+$/.test(m[2])?Number(m[2]):m[2].toUpperCase()}`:null;};
const set=s=>String(s||'').match(/\[\s*((?:SV|SM|XY|BW|S|M|CP)[A-Z0-9+-]*)\b/i)?.[1]?.toUpperCase()||null;
const rarity=s=>String(s||'').match(/\b(SAR|MUR|BWR|SSR|CSR|CHR|SR|UR|HR|AR|RRR|RR|PROMO|R|U|C)\b/i)?.[1]?.toUpperCase()||null;
const name=s=>String(s||'').normalize('NFKC').split('[')[0].replace(/\([^)]*\)/g,'').replace(/\d{1,4}\s*\/\s*[A-Z0-9-]+/ig,'')
  .replace(/\b(?:PSA\s*10|SAR|MUR|BWR|SSR|CSR|CHR|SR|UR|HR|AR|RRR|RR|PROMO|SA|1ED|R|U|C)\b/ig,'')
  .replace(/マスターボールミラー|モンスターボールミラー|マスターボール|モンスターボール|ミラー|プロモ/g,'').replace(/[^\p{L}\p{N}]/gu,'').toUpperCase();
const spec=s=>identity.extractVariant(s)||(/\bSA\b/i.test(s)?'special-art':'');
function inspect(item,card){
  const reasons=[],n=serial(item.number||item.name),cn=serial(card.model||card.name),sourceSet=set(item.name),cardSet=String(card.setCode||set(card.name)||'').toUpperCase();
  if(!n||n!==cn)reasons.push('番号不一致・未確認');
  if(!sourceSet)reasons.push('取得元のセット未明示');else if(sourceSet!==cardSet)reasons.push('セット不一致');
  if(name(item.name)!==name(card.name))reasons.push('名称不一致');
  const r=rarity(item.name),cr=rarity(card.name);
  if(!r)reasons.push('取得元のレアリティ未明示');else if(r!==cr)reasons.push('レアリティ不一致');
  if(spec(item.name)!==spec(card.name))reasons.push('仕様・初版不一致');
  if(identity.extractLanguage(item.name)!=='ja'||card.language!=='ja')reasons.push('日本語版未確認');
  if(card.identityReviewRequired)reasons.push('国内基礎仕様保留');
  if(/未開封|\d+枚|セット販売|BOX|BGS|CGC|TAG|ACE/i.test(item.name))reasons.push('単品PSA10対象外');
  if(item.strictIdentity&&!item.verifiedCardId)reasons.push(item.mismatchReason||'取得元の厳格照合が未確定');
  return {reasons,complete:reasons.length===0};
}
function build(){
  const cards=read('data/pokemon-cards.json'),targets=read('work/search-profile-targets.json'),unmatched=read('work/shop_buyback_unmatched.json');
  const cardById=new Map(cards.map(c=>[c.id,c])),groups=Object.fromEntries(targets.profiles.map(p=>[p.id,new Set([...p.urlsMatched,...p.prospects.map(r=>r.id)])]));
  const targetIds=new Set(Object.values(groups).flatMap(s=>[...s])),byNumber=new Map();
  for(const id of targetIds){const c=cardById.get(id),n=serial(c?.model||c?.name);if(!c||!n)continue;(byNumber.get(n)||byNumber.set(n,[]).get(n)).push(c);}
  const hits=[],allCounts={},accepted=[];
  for(const[shop,rows]of Object.entries(unmatched.shops||{})){
    allCounts[shop]=rows.length;
    for(const item of rows){
      const near=(byNumber.get(serial(item.number||item.name))||[]).filter(c=>name(item.name)===name(c.name));
      if(!near.length)continue;
      const checks=near.map(c=>({id:c.id,name:c.name,profiles:Object.entries(groups).filter(([,s])=>s.has(c.id)).map(([p])=>p),...inspect(item,c)}));
      const exact=checks.filter(r=>r.complete);
      const globalExact=exact.length===1?cards.filter(c=>serial(c.model||c.name)===serial(item.number||item.name)&&inspect(item,c).complete):[];
      const adoptable=globalExact.length===1&&exact.length===1;
      const hit={shop,shopItemId:item.shopItemId,name:item.name,price:item.price??null,active:item.active,observedAt:item.observedAt||null,
        url:item.itemUrl||null,status:adoptable?'再取得・照合対象':'仕様根拠確認待ち',checks,
        nextAction:adoptable?'保存原票の一意照合根拠あり。通常の当該店実取得で確認してから保存・公開':'不足するセット/仕様/初版/言語の正規根拠確認。未照合を未掲載と断定しない'};
      hits.push(hit);if(adoptable)accepted.push({sourceKey:`${shop}:${item.shopItemId}`,cardId:exact[0].id,proof:hit});
    }
  }
  const report={version:1,at:new Date().toISOString(),sourceDate:unmatched.updatedAt,unmatchedByStore:allCounts,
    targetCards:targetIds.size,hits,uniquelyVerified:accepted,
    note:'取得済みの未照合原票を重点照合。番号だけで採用せず、全カタログの一意性も検査。監査/URL発見は実価格取得や候補増加ではない。曖昧一致は手動待ち。',llmCalls:0,codexCalls:0};
  fs.writeFileSync(path.join(ROOT,'data/profile-buyback-unmatched-audit.json'),JSON.stringify(report));
  console.log(JSON.stringify({targets:report.targetCards,unmatched:allCounts,hits:hits.map(h=>({shop:h.shop,name:h.name,status:h.status,checks:h.checks})),verified:accepted.length}));
  return report;
}
if(require.main===module)build();
module.exports={inspect,serial,build};
