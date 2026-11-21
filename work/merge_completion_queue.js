// The queue contains retry/hold state as well as projections. Never discard it
// as a generated JSON file, or resolve conflicting attempts by generation time.
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const SCHEMA=['status','lastAttemptAt','lastSuccessAt','retryCount','failureReason','nextRetryAt'];
const STATES=new Set(['取得済み','取得待ち','巡回中','取得失敗','再試行待ち','再照合待ち','定期再確認','取得元にデータなし','取得不能','許諾待ち','中止','推定値']);
const ROOT_KEYS=['version','generatedAt','itemSchema','evidenceSourceTimes','overseasPolicyExplanation','evidenceSchema','sourceByItem','summary','itemTotals','dataTypeTotals','cards','queue'];
const CARD_KEYS=['c','s','n','rr','rl','rd','ry','rs','ru','rc','p','r','m','x','a','l','pk','p9','e','i'];
function object(v){return v&&typeof v==='object'&&!Array.isArray(v);}
function validate(q){
  if(q?.version!==3||!same(q.itemSchema,SCHEMA)||!object(q.cards)||!object(q.sourceByItem)||!Array.isArray(q.queue)
    ||Object.keys(q).some(k=>!ROOT_KEYS.includes(k))||!Number.isFinite(Date.parse(q.generatedAt)))throw Error('Completion queue schema changed; review required');
  if(new Set(q.queue).size!==q.queue.length||q.queue.some(id=>!Object.hasOwn(q.cards,id)))throw Error('Completion queue identity/order invalid');
  for(const [id,row] of Object.entries(q.cards)){
    if(!object(row)||!object(row.i)||Object.keys(row).some(k=>!CARD_KEYS.includes(k)))throw Error('Completion queue card schema changed: '+id);
    for(const [key,v] of Object.entries(row.i)){
      if(!Object.hasOwn(q.sourceByItem,key)||!Array.isArray(v)||v.length!==6||!STATES.has(v[0])
        ||![v[1],v[2],v[5]].every(t=>t===null||typeof t==='string'&&Number.isFinite(Date.parse(t)))
        ||!Number.isSafeInteger(v[3])||v[3]<0||!(v[4]===null||typeof v[4]==='string'))throw Error('Completion queue item schema changed: '+id+'/'+key);
    }
  }
}
function mergeCompletionQueue(base,a,b){
  for(const q of [base,a,b])validate(q);
  for(const key of ['itemSchema','sourceByItem','overseasPolicyExplanation','evidenceSchema'])
    if(!same(base[key],a[key])||!same(base[key],b[key]))throw Error('Completion queue policy/schema conflict: '+key);
  const selected=Date.parse(a.generatedAt)>=Date.parse(b.generatedAt)?a:b,cards={};
  for(const id of new Set([...Object.keys(base.cards),...Object.keys(a.cards),...Object.keys(b.cards)])){
    const old=base.cards[id],x=a.cards[id],y=b.cards[id];
    if(old&&(!x||!y))throw Error('Completion queue card removal requires review: '+id);
    const items={};
    for(const key of new Set([...Object.keys(old?.i||{}),...Object.keys(x?.i||{}),...Object.keys(y?.i||{})])){
      const prior=old?.i[key],left=x?.i[key],right=y?.i[key];
      if(prior&&(!left||!right))throw Error('Completion queue item removal requires review: '+id+'/'+key);
      // Atomic six-field attempts: a retry count/reason/time must travel together.
      // Even distinct generation times cannot settle concurrent item changes.
      let chosen;
      if(same(left,right)||same(prior,right))chosen=left;
      else if(same(prior,left))chosen=right;
      else throw Error('Concurrent completion queue item conflict requires review: '+id+'/'+key);
      if(chosen!==undefined)items[key]=chosen;
    }
    cards[id]={...(selected.cards[id]||x||y),i:items};
  }
  // All remaining fields are seeds only; resolve_generated_merge immediately
  // regenerates catalog/completion projections from reconciled authoritative inputs.
  return {...selected,cards,queue:[...new Set([...selected.queue,...a.queue,...b.queue])]};
}
function carryRetryState(entry,previous){
  if(entry.status!=='取得済み'&&previous&&['取得失敗','再試行待ち'].includes(previous.status)){
    for(const key of SCHEMA)if(Object.hasOwn(previous,key))entry[key]=previous[key];
  }
  return entry;
}
module.exports={mergeCompletionQueue,carryRetryState};
