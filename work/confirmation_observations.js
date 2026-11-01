const crypto=require('node:crypto');
const SOURCES=['cardrush','hareruya2','yuyutei','torecacamp'];
const digest=text=>crypto.createHash('sha256').update(String(text).replace(/\r\n/g,'\n')).digest('hex');
const time=v=>typeof v==='string'&&v.includes('T')&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
function merge(a=[],b=[]){return [...new Map([...a,...b].map(r=>[r.id+'|'+r.at,r])).values()];}
function collect(summaries,{from,to,primaryCards=null}={}){
 const start=time(from),end=time(to),observations={},sources={};
 for(const source of [...SOURCES,...(primaryCards?['toreca','psa10Market']:[])]){
  const summary=summaries[source],rows=source==='toreca'||source==='psa10Market'?primaryCards:Object.entries(summary?.cards||{}).map(([id,r])=>({id,...r}));
  if(start==null||end==null||end<start||((!summary?.cards||Object.keys(summary.cards).length===0)&&!['toreca','psa10Market'].includes(source))){sources[source]={status:'unmeasured',confirmed:null,reason:'取得期間または公開原票なし'};continue;}
  const accepted=[];const excluded={};
  for(const r of rows){const at=source==='toreca'?r.priceObservedAt:source==='psa10Market'?r.psa10ObservedAt:r.priceObservedAt||r.observedAt;
   const t=time(at),value=source==='toreca'?r.price:source==='psa10Market'?r.snkPsa10Price:r[source+'Price']??r.price;
   let why=t==null?'個別確認日時なし':t<start||t>end?'実行期間外':!Number.isFinite(value)||value<=0?'有効価格なし':r.identityVerified===false||r.cardMismatchSuspected||r.priceQuarantined?'照合・価格保留':null;
   if(why){excluded[why]=(excluded[why]||0)+1;continue;}accepted.push({id:r.id,at});
  }
  observations[source]=merge([],accepted);sources[source]={status:'measured-saved-observation-lower-bound',confirmed:observations[source].length,excluded};
 }
 return {observations,scope:{version:2,from:from||null,to:to||null,sources,note:'公開原票の個別確認日時が実行期間内の記録。反復時刻が要約に残らない分は未計測。HTTP数/購入可能枚数/実成約数とは別。未計測を0へ置換しない。'}};
}
function recoverVerified(history,receipt,proof,texts){
 if(!proof?.confirmed||String(proof.runId)!==String(receipt?.runId))throw Error('Scheduled publication proof/receipt mismatch');
 const run=history.runs?.find(r=>String(r.runId)===String(proof.runId));if(!run)throw Error('Verified cadence run missing');
 const failed=new Set(receipt.sourceIsolation?.sources?.filter(r=>r.status==='failed').map(r=>r.source)||[]),summaries={};
 for(const source of SOURCES){const f='data/'+source+'-stock-summary.json';if(failed.has(source)||texts[f]==null)continue;if(digest(texts[f])!==receipt.hashes?.[f])throw Error('Published source hash mismatch: '+source);summaries[source]=JSON.parse(texts[f]);}
 const recovered=collect(summaries,{from:proof.startedAt,to:receipt.recordedAt});const counts={};run.observations||={};run.sourceCoverage||={};
 for(const [source,rows]of Object.entries(recovered.observations)){const previous=run.observations[source]||[],next=merge(previous,rows);counts[source]=next.length-previous.length;run.observations[source]=next;run.sourceCoverage[source]={...recovered.scope.sources[source],recoveredFromPublicHash:receipt.hashes['data/'+source+'-stock-summary.json'],from:proof.startedAt,to:receipt.recordedAt};}
 return {runId:proof.runId,added:counts,newRequests:0,newObservationDates:0};
}
module.exports={collect,merge,recoverVerified,digest};
