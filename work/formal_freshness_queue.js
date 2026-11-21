const HOUR = 3600000;
const { observationTime } = require('../decision-model');
const { sourceForUrl, requestForSource, medianCompletionIds } = require('./profile_completion_routes');

function deadline(at, hours, now) {
  const time = observationTime(at);
  return Number.isFinite(time) && time <= now ? time + hours * HOUR : null;
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
    origin:row.origin, source:sourceForUrl(row.url), url:row.url, at:deadline(row.observedAt,48,now),
  })), 'origin');
  // Two sources remain usable until the second-newest observation expires.
  if (median.length >= 2) components.push({...median[1],field:'referenceMedian'});
  const purchase = facts.purchase;
  if (purchase?.fresh && purchase.available) {
    components.push({field:'shopStateA',source:sourceForUrl(purchase.url),url:purchase.url,
      at:deadline(purchase.priceObservedAt,48,now)});
    components.push({field:'inventory',source:sourceForUrl(purchase.url),url:purchase.url,
      at:deadline(purchase.inventoryObservedAt,48,now)});
  }
  components.push({field:'psa10Price',source:'toreca',scope:facts.psa10ClockScope,at:deadline(facts.psa10ObservedAt,30,now)});
  if(facts.psa9?.eligibility==='eligible')components.push({field:'psa9Evidence',source:'toreca',at:deadline(facts.psa9.updatedAt,720,now)});
  const exit = latestDistinct((facts.buyback || []).filter(row=>row.adoptable === true).map(row=>({
    shopId:row.shopId, at:deadline(row.observedAt || row.priceDate,168,now),
  })), 'shopId');
  if (exit.length>=2) components.push({...exit[1],field:'buybackExitEvidence',source:'shopBuyback'});
  return components.filter(row=>row.at!=null).sort((a,b)=>a.at-b.at);
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
    if (dependency) rows[card.id]={deadlineAt:dependency.at,url:dependency.url,formalCandidate:true,field:dependency.field};
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

module.exports={build,forSource,evidenceDeadlines,plannedDeadline};
