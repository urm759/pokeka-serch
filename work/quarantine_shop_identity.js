const fs=require('node:fs'),path=require('node:path');
const {extractLanguage}=require('./card_identity');
function reason(card,title){
  if(!String(title||'').trim())return null;
  if(/中国語箔押しエラー/.test(card.name)&&!/中国語箔押しエラー/.test(title))return '特殊加工・エラー仕様の根拠なし（通常版で代用不可）';
  if(/未開封/.test(title)&&!/未開封/.test(card.name))return '未開封仕様を通常素体へ代用不可';
  if(/複数枚|\d+枚セット|セット商品/.test(title)&&!/複数枚|\d+枚セット|セット商品/.test(card.name))return '複数枚商品を単品へ代用不可';
  const expected=['ja','en','ko','zh','id'].includes(card.language)?card.language:extractLanguage(card.name);
  if(extractLanguage(title)!==expected)return '商品原票に言語不一致の明示あり';
  if(/(?:PSA|BGS|CGC|ARS|ACE|TAG)\s*(?:10|[1-9])(?:\.5)?(?!\d)|鑑定品/i.test(title)&&!/(?:PSA|BGS|CGC|ARS|ACE|TAG)\s*(?:10|[1-9])(?:\.5)?(?!\d)|鑑定品/i.test(card.name))return '素体カードへの鑑定品紐付け';
  return null;
}
function build(root=path.join(__dirname,'..')){
  const read=(f,d={})=>{try{return JSON.parse(fs.readFileSync(path.join(root,f)));}catch{return d;}},cards=read('data/pokemon-cards.json',[]),byId=new Map(cards.map(c=>[c.id,c])),rows=[];
  const byUrl=new Map();for(const c of cards)for(const field of ['cardrushUrl','hareruya2Url','yuyuteiUrl','torecacampUrl'])if(c[field]){if(byUrl.has(c[field]))byUrl.set(c[field],null);else byUrl.set(c[field],c);}
  for(const source of ['cardrush','hareruya2','yuyutei','torecacamp']){
    const catFile=`work/${source}_catalog.json`,cat=read(catFile,[]),summaryFile=`data/${source}-stock-summary.json`,summary=read(summaryFile),field=`${source}Url`;let changed=false;
    for(const r of Array.isArray(cat)?cat:[]){const c=byId.get(r.cardId || r.quarantinedCardId) || byUrl.get(r.detailUrl);if(!c)continue;const title=r.title || r.name || '',why=reason(c,title);if(!why)continue;
      rows.push({id:c.id,name:c.name,source,title,url:r.detailUrl || null,price:r.price,observedAt:r.observedAt || null,reason:why});
      Object.assign(r,{identityVerified:false,cardMismatchSuspected:true,matchStatus:'mismatch',identityHoldReason:why,...(!r.cardId?{quarantinedCardId:c.id}:{})});
      const s=summary.cards?.[c.id];if(s&&(!s.detailUrl||s.detailUrl===r.detailUrl)){Object.assign(s,{identityVerified:false,cardMismatchSuspected:true,matchStatus:'mismatch',identityHoldReason:why});changed=true;}
      // Detach only the exact rejected URL, never a newer independently verified link.
      if(c[field]===r.detailUrl)c[field]=null;
    }
    if(Array.isArray(cat)&&cat.length)fs.writeFileSync(path.join(root,catFile),JSON.stringify(cat));
    if(changed)fs.writeFileSync(path.join(root,summaryFile),JSON.stringify(summary));
  }
  fs.writeFileSync(path.join(root,'data/pokemon-cards.json'),JSON.stringify(cards));
  const history=read('work/shop-identity-quarantine-history.json',{rows:[]}),byKey=new Map((history.rows||[]).map(r=>[`${r.source}|${r.url}|${r.observedAt}`,r]));
  for(const r of rows){const key=`${r.source}|${r.url}|${r.observedAt}`,old=byKey.get(key);byKey.set(key,{...r,firstDetectedAt:old?.firstDetectedAt || new Date().toISOString()});}
  fs.writeFileSync(path.join(root,'work/shop-identity-quarantine-history.json'),JSON.stringify({version:1,rows:[...byKey.values()]}));
  const audit={version:1,generatedAt:new Date().toISOString(),rows,count:rows.length,action:'明示言語/素体鑑定品違いのみ隔離。価格/在庫/元の観測日時を保持、誤URLだけ探索へ戻す。金額の差を根拠にしない'};
  fs.writeFileSync(path.join(root,'data/shop-identity-quarantine.json'),JSON.stringify(audit));return audit;
}
const identityUsable=row=>Boolean(row)&&!row.cardMismatchSuspected&&row.matchStatus!=='mismatch';
if(require.main===module)console.log(JSON.stringify({count:build().count}));module.exports={build,reason,identityUsable};
