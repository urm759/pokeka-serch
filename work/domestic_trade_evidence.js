const {identity}=require('./psa10_observation_evidence');
const fields=['tv7','tv30','p10tv7','p10tv30'];
const valid=n=>typeof n==='number'&&Number.isInteger(n)&&n>=0;
function capture(cards,sourceRows,{observedAt,sourceUrl,payloadHash,completeCardList=false}){
  const receipt={version:1,observedAt,sourceUrl,payloadHash,fields,cards:Object.fromEntries(cards.flatMap(card=>{
    const raw=sourceRows.get(String(card.sourceId||card.id));
    if(!raw)return [];
    return [[card.id,[identity(card),...fields.map(f=>valid(raw[f])?raw[f]:null),
      fields.reduce((mask,f,i)=>mask|(Object.hasOwn(raw,f)?1<<i:0),0)]]];
  }))};
  if(completeCardList)receipt.coverage={kind:'complete-card-list',unobserved:Object.fromEntries(cards
    .filter(c=>!sourceRows.has(String(c.sourceId||c.id))).map(c=>[c.id,[identity(c),String(c.sourceId||c.id)]]))};
  return receipt;
}
function inspect(receipt,card,field,now=Date.now()){
  const row=receipt?.cards?.[card.id],at=Date.parse(receipt?.observedAt),names=field==='domesticTrades'?['tv7','tv30']:['p10tv7','p10tv30'];
  if(receipt?.version!==1||!receipt.payloadHash||!receipt.sourceUrl||!Number.isFinite(at)||at>now)
    return {status:'not-observed',reason:'期間件数の原票未取得・正規一括差分で再確認',automatic:true};
  if(!row){
    const absent=receipt.coverage?.kind==='complete-card-list'&&receipt.coverage.unobserved?.[card.id];
    if(absent?.[0]===identity(card)&&absent[1]===String(card.sourceId||card.id)&&now-at<=30*3600000)
      return {status:'source-card-absent',at:receipt.observedAt,automatic:false,
        reason:'今回の一括原票に対応カードIDなし・通常差分で提供開始を確認。専用反復取得はしない'};
    return {status:'not-observed',reason:'期間件数の原票未取得・正規一括差分で再確認',automatic:true};
  }
  if(card.identityReviewRequired||row[0]!==identity(card))return {status:'identity-review',reason:'カード仕様または言語の照合保留',automatic:false};
  const values=names.map(f=>row[fields.indexOf(f)+1]);
  const present=names.every(f=>(row[5]&(1<<fields.indexOf(f)))!==0);
  const stale=now-at>30*3600000;
  const status=values.every(valid)?values.every(n=>n===0)?'confirmed-zero':'available':!present?'period-not-provided':'source-null';
  return {status,values,at:receipt.observedAt,stale,automatic:status!=='period-not-provided',
    reason:(status==='confirmed-zero'?'取得元が期間内0件を明示':status==='available'?'期間7/30日の有効値が原票に存在':status==='source-null'?'取得元の期間件数がnull・未取得（データ不存在とは未確定）':'取得元の7/30日項目未提供・対象期間は未確認')+(stale?'／原票が古い・再確認待ち':'')};
}
module.exports={capture,inspect,fields};
