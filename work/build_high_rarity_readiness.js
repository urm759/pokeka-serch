const fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..');
const {resolveRelease}=require('./catalog_semantics');
const rarity=c=>require('./card_identity').extractRarity(c.name,c.rarity)||null;
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
  return {srFamily:cohort(whitelist),arChr:cohort(['AR','CHR']),
    unknownYear:source.filter(s=>resolveRelease(byId.get(s.id)||s).year==null).length,
    unknownRarity:source.filter(s=>!rarity(s)).length,
    note:'2020年を含む。公式セットマスタ・個別根拠のみ、発売経過日数や系列年の推測は不使用。不明は分母から隠さず別計上。分析可能と指定条件適合・GOは別。保守率は未判定を全て対象と仮定した下限。'};
}
function build(root=ROOT) {
  const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
  const source=read('work/toreca-source-inventory.json'),cards=read('data/pokemon-cards.json'),completion=read('data/card-catalog-completion.json');
  const result=summarize(source.cards,cards,completion,read('work/modern-high-rarity-config.json').rarityWhitelist);
  const queue=read('work/card-completion-queue.json');
  const linkage=Object.fromEntries(read('work/psa-linkage-all.json').rows.map(r=>[r.cardId,r]));
  const psaProgress=read('work/psa-fetch-progress.json'),byId=new Map(cards.map(c=>[c.id,c]));
  result.requiredAvailability={automatic:0,pcAuthenticatedRoute:0,retryWait:0,identityOrUrlReview:0,confirmedNoData:0,unimplemented:0};
  for(const id of result.srFamily.ids)for(const field of completion.cards?.[id]?.m||[]) {
    if(field==='psaOfficial') {
      const r=require('./profile_completion_routes').prospectPlan(byId.get(id),['psaOfficial'],{linkage,psaProgress}).requirements[0];
      result.requiredAvailability[r.automatic?'pcAuthenticatedRoute':r.nextRetryAt?'retryWait':'identityOrUrlReview']++;
    } else if(['domesticPrice','domesticTrades','psa10Price','psa10Trades'].includes(field))result.requiredAvailability.automatic++;
    else result.requiredAvailability.identityOrUrlReview++;
  }
  result.availabilityNote='件数はカード×必須項目で重複あり。公開一括取得へ接続しても、取得元に値が存在する保証はない。未取得をデータなしへ変換しない。PC経路は認証・稼働の確認が必要。';
  const routes={};
  for(const id of result.srFamily.ids) for(const r of require('./completion_routes').routes(queue.cards?.[id]||{})) {
    const key=r.source+':'+r.mode;routes[key]=(routes[key]||0)+1;
  }
  result.routes=routes;result.sourceAt=source.updatedAt;result.generatedAt=new Date().toISOString();
  const existing=read('data/modern-high-rarity-audit.json');existing.readiness2020=result;
  fs.writeFileSync(path.join(root,'data/modern-high-rarity-audit.json'),JSON.stringify(existing));
  return result;
}
if(require.main===module){const x=build();console.log(JSON.stringify({srFamily:{...x.srFamily,ids:undefined,unknownRows:undefined},arChr:{...x.arChr,ids:undefined,unknownRows:undefined},routes:x.routes}));}
module.exports={build,summarize};
