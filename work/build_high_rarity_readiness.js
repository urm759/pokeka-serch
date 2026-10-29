const fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..');
const {resolveRelease}=require('./catalog_semantics');
function rarity(c){
  const canonical=require('./card_identity').extractRarity(c.name,c.rarity);
  const known=new Set(['SAR','SSR','CSR','CHR','BWR','MUR','AR','SR','HR','UR','RRR','RR','MA','MHR','TR','K','ACE','C','U','R','H','S','P','PR','PROMO','SIR','IR','FUR','SUR','MAR']);
  if(known.has(canonical))return canonical;
  const label=String(c.name||'').normalize('NFKC').split('[')[0].trim();
  const explicit=label.match(/(?:^|[\s:])((?:SAR|SSR|CSR|CHR|BWR|MUR|AR|SR|HR|UR|RRR|RR|MA|MHR|TR|K|ACE|C|U|R))(?:仕様)?\s*$/i);
  if(explicit)return explicit[1].toUpperCase();
  return /(?:^|[\s:])プロモ(?:\s|$|\()/u.test(label)?'PROMO':null;
}
function summarize(source,catalog,completion,whitelist) {
  const byId=new Map(catalog.map(c=>[c.id,c]));
  function cohort(rarities) {
    const known=[],unknown=[],missing={};let listed=0,analyzable=0,unknownYear=0,unknownRarity=0;
    for(const s of source) {
      if(s.language && s.language!=='ja')continue;
      const c=byId.get(s.id),r=rarity(s),release=resolveRelease(c||s);
      if(!r&&(release.year==null||release.year>=2020) || rarities.includes(r)&&release.year==null)unknown.push({id:s.id,rarity:r,releaseYear:release.year});
      if(rarities.includes(r)&&release.year==null)unknownYear++;
      if(!r&&(release.year==null||release.year>=2020))unknownRarity++;
      if(!rarities.includes(r)||!(release.year>=2020))continue;
      known.push(s.id);
      if(!c)continue;
      listed++;
      const row=completion.cards?.[s.id];
      if(row?.s==='分析可能')analyzable++;
      for(const f of row?.m||[])missing[f]=(missing[f]||0)+1;
    }
    return {sourceTarget:known.length,listed,unlisted:known.length-listed,listingPct:known.length?100*listed/known.length:null,
      analyzable,analysisPct:listed?100*analyzable/listed:null,unknown:unknown.length,unknownYear,unknownRarity,
      conservativeAnalysisPct:listed+unknown.length?100*analyzable/(listed+unknown.length):null,
      requiredMissing:missing,unknownRows:unknown,ids:known};
  }
  const classification={srFamily:0,arChr:0,confirmedLowRarity:0,knownOther:0,unclassified:0};
  for(const s of source.filter(s=>!s.language||s.language==='ja')){
    const r=rarity(s);classification[!r?'unclassified':whitelist.includes(r)?'srFamily':['AR','CHR'].includes(r)?'arChr':['C','U','R','RR','RRR','H','S','K','ACE'].includes(r)?'confirmedLowRarity':'knownOther']++;
  }
  return {srFamily:cohort(whitelist),arChr:cohort(['AR','CHR']),classification,
    unknownYear:source.filter(s=>resolveRelease(byId.get(s.id)||s).year==null).length,
    unknownRarity:source.filter(s=>!rarity(s)).length,
    note:'2020年を含む。公式セットマスタ・個別根拠のみ、発売経過日数や系列年の推測は不使用。不明は分母から隠さず別計上。分析可能と指定条件適合・GOは別。保守率は未判定を全て対象と仮定した下限。'};
}
function feasibility(rows, listed, analyzable) {
  const automaticOnly = rows.filter(r => r.requirements.length > 0 && r.requirements.every(x => x.automatic));
  const savedReviewOnly = rows.filter(r => r.requirements.some(x => x.state === 'saved-rematch-review')
    && r.requirements.every(x => x.automatic || x.state === 'saved-rematch-review'));
  const combinations = {}, blockedCardsByReason = {};
  for (const row of rows) {
    const blockers = [...new Set(row.requirements.filter(r => !r.automatic).map(r => r.state))].sort();
    const key = blockers.join(' + ') || 'automatic-paths-only';
    combinations[key] = (combinations[key] || 0) + 1;
    for (const reason of blockers) blockedCardsByReason[reason] = (blockedCardsByReason[reason] || 0) + 1;
  }
  const target = Math.ceil(listed * .9), conditionalTotal = analyzable + automaticOnly.length;
  return { pendingCards: rows.length, automaticPathsOnly: automaticOnly.length, savedReviewOnly: savedReviewOnly.length,
    blockedCards: rows.length - automaticOnly.length, combinations, blockedCardsByReason,
    target90Cards: target, conditionalCurrentRouteTotal: conditionalTotal,
    conditionalCurrentRoutePct: listed ? 100 * conditionalTotal / listed : null,
    targetShortfallAfterConditionalCompletion: Math.max(0, target - conditionalTotal),
    note: 'カード単位・組合せは重複なし。理由別は重複あり。現行経路上限は自動経路が全て有効値を返した場合の条件付きで、取得成功/終了日を保証しない。保存原票の再照合保留を解消済み・許諾待ちへ一括変換しない。' };
}
function build(root=ROOT) {
  const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
  const source=read('work/toreca-source-inventory.json'),cards=read('data/pokemon-cards.json'),completion=read('data/card-catalog-completion.json');
  const supplementIds=new Set(read('work/domestic-catalog-supplements.json').cards.map(c=>c.id));
  const sourceIds=new Set(source.cards.map(c=>c.id));
  const supplements=cards.filter(c=>supplementIds.has(c.id)&&!sourceIds.has(c.id));
  const result=summarize([...source.cards,...supplements],cards,completion,read('work/modern-high-rarity-config.json').rarityWhitelist);
  result.targetOrigins={providerCards:source.cards.length,verifiedSupplementCards:supplements.length,
    supplementIds:supplements.map(c=>c.id),note:'取得元母数と独立照合した国内補足を区別。固定群は維持し、現在対象には追加分も含む'};
  const queue=read('work/card-completion-queue.json');
  const priceEvidence=read('data/state-a-price-evidence.json'),priceAudit=read('data/state-a-price-audit.json');
  const linkage=Object.fromEntries(read('work/psa-linkage-all.json').rows.map(r=>[r.cardId,r]));
  const psaProgress=read('work/psa-fetch-progress.json'),byId=new Map(cards.map(c=>[c.id,c]));
  result.requiredAvailability={automatic:0,pcAuthenticatedRoute:0,retryWait:0,permissionWait:0,savedRematchReview:0,identityOrUrlReview:0,confirmedNoData:0,unimplemented:0};
  const psaAccess=require('./psa_access_policy').decision(require('./psa_access_policy').read(root));
  for(const id of result.srFamily.ids)for(const field of completion.cards?.[id]?.m||[]) {
    if(field==='psaOfficial') {
      const r=require('./profile_completion_routes').prospectPlan(byId.get(id),['psaOfficial'],{linkage,psaProgress,psaAccess}).requirements[0];
      result.requiredAvailability[r.state==='saved-rematch-review'?'savedRematchReview':r.state==='permission-wait'?'permissionWait':r.automatic?'pcAuthenticatedRoute':r.nextRetryAt?'retryWait':'identityOrUrlReview']++;
    } else if(field==='domesticPrice') {
      const r=require('./profile_completion_routes').prospectPlan(byId.get(id),[field],{priceEvidence,priceAudit}).requirements[0];
      result.requiredAvailability[r.automatic?'automatic':'identityOrUrlReview']++;
    } else if(['domesticTrades','psa10Price','psa10Trades'].includes(field))result.requiredAvailability.automatic++;
    else result.requiredAvailability.identityOrUrlReview++;
  }
  result.availabilityNote='件数はカード×必須項目で重複あり。公開一括取得へ接続しても、取得元に値が存在する保証はない。未取得をデータなしへ変換しない。PC経路は認証・稼働の確認が必要。';
  const routes={};
  for(const id of result.srFamily.ids) for(const r of require('./completion_routes').routes(queue.cards?.[id]||{})) {
    const key=r.source+':'+r.mode;routes[key]=(routes[key]||0)+1;
  }
  result.routes=routes;result.sourceAt=source.updatedAt;result.generatedAt=new Date().toISOString();
  const receiptFile=path.join(root,'data/domestic-trade-source-audit.json');
  const receipt=fs.existsSync(receiptFile)?JSON.parse(fs.readFileSync(receiptFile,'utf8')):{};
  result.tradeEvidence={at:receipt.observedAt||null,missing:{},routes:{},note:'同一仕様・期間別の提供元集計。原票null/項目未提供を0や不存在へ変換しない。スニダン直接取得は再開せず既存の正規一括差分へ接続。'};
  result.requiredAvailability.sourceFieldNotProvided=0;
  for(const id of result.srFamily.ids)for(const field of (completion.cards?.[id]?.m||[]).filter(f=>['domesticTrades','psa10Trades'].includes(f))){
    const e=require('./domestic_trade_evidence').inspect(receipt,byId.get(id),field);
    if(['period-not-provided','source-card-absent'].includes(e.status)) {
      result.requiredAvailability.automatic--;
      result.requiredAvailability.sourceFieldNotProvided++;
    }
    const group=result.tradeEvidence.missing[field]||={};group[e.status]=(group[e.status]||0)+1;
    result.tradeEvidence.routes[id]||=[];result.tradeEvidence.routes[id].push({field,...e,source:'toreca',method:['period-not-provided','source-card-absent'].includes(e.status)?'現行原票にカードIDまたは期間項目なし・通常一括差分で提供開始を再確認。専用の反復取得はしない':'既存の正規一括差分・次回実取得',completed:false});
  }
  const plans = result.srFamily.ids.filter(id => completion.cards?.[id]?.m?.length).map(id => {
    const card = byId.get(id), missing = completion.cards[id].m;
    return { id, name: card?.name, missing, priority: queue.cards?.[id]?.p || 0,
      ...require('./profile_completion_routes').prospectPlan(card, missing, { linkage, psaProgress, psaAccess, tradeReceipt: receipt, priceEvidence, priceAudit }) };
  }).sort((a,b) => Number(b.allRequiredPathsAutomatic) - Number(a.allRequiredPathsAutomatic)
    || a.missing.length - b.missing.length || b.priority - a.priority || a.id.localeCompare(b.id));
  result.cardFeasibility = feasibility(plans, result.srFamily.listed, result.srFamily.analyzable);
  const routeDefinitions = Object.fromEntries(plans.flatMap(row => row.requirements.map(r => [
    `${r.source}:${r.state}`, { nextAction: r.nextAction, resumeCondition: r.resumeCondition }])));
  const compactPlans = plans.map(({ requirements, ...row }) => ({ ...row, requirements: requirements.map(r => ({
    field: r.field, source: r.source, state: r.state, automatic: r.automatic,
    networkRequired: r.networkRequired, url: r.url, routeKey: `${r.source}:${r.state}` })) }));
  fs.writeFileSync(path.join(root, 'work/high-rarity-completion-plan.json'), JSON.stringify({
    generatedAt: result.generatedAt, summary: result.cardFeasibility, routeDefinitions, rows: compactPlans, httpRequests: 0, llmCalls: 0, codexCalls: 0 }));
  const existing=read('data/modern-high-rarity-audit.json');existing.readiness2020=result;
  existing.siteTotal=cards.length;existing.sourceListedTotal=source.cards.length;existing.sourceSnapshotDeclaredTotal=source.total;
  existing.countsReconciledAt=result.generatedAt;
  existing.countBasis='取得元の保存済みID母数はsourceListedTotal、独立確認した補足はreadiness2020.targetOriginsへ別計上し現在対象にも含む。固定対象は変更しない。旧2015年範囲と2020年以降は別。';
  fs.writeFileSync(path.join(root,'data/modern-high-rarity-audit.json'),JSON.stringify(existing));
  return result;
}
if(require.main===module){const x=build();console.log(JSON.stringify({srFamily:{...x.srFamily,ids:undefined,unknownRows:undefined},arChr:{...x.arChr,ids:undefined,unknownRows:undefined},routes:x.routes}));}
module.exports={build,summarize,rarity,feasibility};
