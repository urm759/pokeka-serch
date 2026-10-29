function due(receipt,now=Date.now(),options={}){
  const at=Date.parse(receipt?.observedAt);
  const proved=receipt?.version===1&&typeof receipt.payloadHash==='string'&&receipt.payloadHash.length>0
    &&receipt.cards&&Object.keys(receipt.cards).length>0&&Number.isFinite(at)&&at<=now;
  // A cached HTML shell does not confirm the separate price payload. Keep the
  // six-hour goal, checking ahead by one configured two-hour scheduled interval.
  const day=require('./psa10_observation_evidence').calendarDay;
  const pairing=options.requiredDay===day(new Date(now).toISOString())&&day(receipt?.observedAt)!==options.requiredDay;
  return !proved||now-at>=4*3600000||pairing&&now-at>=2*3600000;
}
module.exports={due};
