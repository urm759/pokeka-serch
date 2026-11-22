const HOUR = 3600000;
const REFRESH_HOURS = 24;
const adoptionHours = {referenceMedian:48, shopStateA:48, inventory:48, psa10Price:30, psa9Evidence:720, buybackExitEvidence:168};
const { observationTime } = require('../decision-model');
const { sourceForUrl, requestForSource, medianCompletionIds } = require('./profile_completion_routes');

function deadline(at, field, now) {
  const time = observationTime(at);
  return Number.isFinite(time) && time <= now ? time + adoptionHours[field] * HOUR : null;
}

function latestDistinct(rows, key) {
  const distinct = new Map();
  for (const row of rows) {
    if (!row[key] || row.at == null) continue;
    if (!distinct.has(row[key]) || row.at > distinct.get(row[key]).at) distinct.set(row[key],row);
  }
  return [...distinct.values()].sort((a,b)=>b.at-a.at);
}

function evidenceDeadlines(facts, now) {
  const components = [];
  const median = latestDistinct((facts.medianEvidence?.rows || []).filter(row=>row.fresh).map(row=>({
    origin:row.origin, source:sourceForUrl(row.url), url:row.url, at:deadline(row.observedAt,'referenceMedian',now),
  })), 'origin');
  // Two sources remain usable until the second-newest observation expires.
  if (median.length >= 2) components.push({...median[1],field:'referenceMedian'});
  const purchase = facts.purchase;
  if (purchase?.fresh && purchase.available) {
    components.push({field:'shopStateA',source:sourceForUrl(purchase.url),url:purchase.url,
      at:deadline(purchase.priceObservedAt,'shopStateA',now)});
    components.push({field:'inventory',source:sourceForUrl(purchase.url),url:purchase.url,
      at:deadline(purchase.inventoryObservedAt,'inventory',now)});
  }
  components.push({field:'psa10Price',source:'toreca',scope:facts.psa10ClockScope,at:deadline(facts.psa10ObservedAt,'psa10Price',now)});
  if(facts.psa9?.eligibility==='eligible')components.push({field:'psa9Evidence',source:'toreca',at:deadline(facts.psa9.updatedAt,'psa9Evidence',now)});
  const exit = latestDistinct((facts.buyback || []).filter(row=>row.adoptable === true).map(row=>({
    shopId:row.shopId, at:deadline(row.observedAt || row.priceDate,'buybackExitEvidence',now),
  })), 'shopId');
  if (exit.length>=2) components.push({...exit[1],field:'buybackExitEvidence',source:'shopBuyback'});
  return components.filter(row=>row.at!=null).map(row=>{
    const observedAt=row.at-adoptionHours[row.field]*HOUR;
    return {...row,observedAt,refreshAt:observedAt+REFRESH_HOURS*HOUR,ageHours:(now-observedAt)/HOUR};
  }).sort((a,b)=>a.at-b.at);
}

function build(targets, profileIds, now = Date.now()) {
  const allowed = new Set(profileIds);
  const cards = new Map();
  for (const profile of targets.profiles || []) {
    if (!allowed.has(profile.id)) continue;
    for (const id of profile.urlsMatched || []) {
      const facts = profile.qualifiedFacts?.[id];
      if (!facts || facts.specificationHeld || facts.priceReview?.conflicted || facts.priceReview?.integrityDisputed) continue;
      const card = cards.get(id) || {id,profiles:[],dependencies:[]};
      card.profiles.push(profile.id);
      card.dependencies.push(...evidenceDeadlines(facts,now));
      cards.set(id,card);
    }
  }
  return {formal:[...cards.values()].map(row=>{
    const unique = new Map(row.dependencies.map(d=>[[d.field,d.source,d.url,d.at].join('|'),d]));
    const dependencies = [...unique.values()].sort((a,b)=>a.at-b.at);
    return {...row,dependencies,earliestDeadlineAt:dependencies[0]?.at ?? null};
  }),departures:(targets.freshnessRecovery || []).filter(row=>allowed.has(row.profile))};
}

function forSource(targets, profileIds, source, now = Date.now()) {
  const scope=[...profileIds];
  if(!scope.length)return {};
  const {formal,departures}=build(targets,scope,now);
  const rows={};
  for (const card of formal) {
    const dependency=card.dependencies.find(row=>row.source===source);
    if (dependency) rows[card.id]={deadlineAt:dependency.at,observedAt:dependency.observedAt,refreshAt:dependency.refreshAt,
      url:dependency.url,formalCandidate:true,field:dependency.field};
  }
  for (const row of departures.filter(row=>requestForSource(row,source))) {
    const target=row.sourceTargets?.find(t=>t.source===source);
    if (target?.url) rows[row.id]={deadlineAt:now,url:target.url,previousQualified:true,field:'referenceMedian'};
  }
  for (const id of medianCompletionIds(targets,source,scope)) {
    if (!rows[id]) rows[id]={deadlineAt:now,completion:true,field:'referenceMedian'};
  }
  return rows;
}

function plannedDeadline(priorities, row) {
  const request=priorities[row.cardId || row.card?.id];
  const url=row.detailUrl || row.url;
  const observed=Date.parse(row.observedAt || '');
  // Bulk acquisition can satisfy the request before an individual URL is ranked.
  if (!Number.isFinite(request?.deadlineAt) || request.url && request.url!==url || Number.isFinite(observed) && observed>=request.deadlineAt) return Infinity;
  return request.deadlineAt;
}

function formalPriority(priorities, row, start, leadMs) {
  const request=priorities[row.cardId];
  if (!request?.formalCandidate || request.url!==row.detailUrl || Date.parse(row.observedAt)>request.observedAt) {
    return {band:0,deadlineAt:Infinity};
  }
  const horizon=start+leadMs;
  return {band:request.deadlineAt<=horizon?2:Number(request.refreshAt<=horizon),deadlineAt:request.deadlineAt};
}

function pageMissFor(priorities, misses, row) {
  const request=priorities[row.cardId],miss=misses[row.cardId];
  const at=Date.parse(miss?.at);
  return Boolean(request?.formalCandidate && miss?.url && request.url===row.detailUrl && miss.url===row.detailUrl
    && Number.isFinite(at) && !(Date.parse(row.observedAt)>=at));
}

function sharedClockWarnings(formal, now) {
  const counts=new Map();
  for (const card of formal) {
    const clock=card.dependencies.find(d=>d.field==='psa10Price' && d.scope==='model-source-fallback');
    if (!clock || now<=clock.refreshAt) continue;
    const group=counts.get(clock.at)||{dependent:0,first:0};
    group.dependent++;
    if (card.earliestDeadlineAt===clock.at) group.first++;
    counts.set(clock.at,group);
  }
  return [...counts].map(([deadline,{first,dependent}])=>({
    key:'formal-psa10:shared-clock:'+new Date(deadline).toISOString(),
    reason:`PSA10相場の共有時計が24時間超（鮮度注意）。正式候補${first||dependent}枚の同時期限は ${new Date(deadline).toISOString()}`
      +(first && first!==dependent?`（最初の期限が同時。同じ時計を使う候補は計${dependent}枚）`:''),
    url:'./data/formal-freshness-deadlines.json'
  }));
}

module.exports={build,forSource,evidenceDeadlines,plannedDeadline,formalPriority,pageMissFor,sharedClockWarnings};
