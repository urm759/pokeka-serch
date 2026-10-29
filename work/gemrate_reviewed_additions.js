// Reviewed identities only. This registry grants neither acquisition rights nor calculation adoption.
const fs=require('node:fs'),path=require('node:path');
const {canonicalIdentity}=require('./card_identity');
function entries(root) {
  const file=path.join(root,'work/gemrate-reviewed-additions.json');
  if(!fs.existsSync(file))return [];
  const registry=JSON.parse(fs.readFileSync(file));
  if(registry.version!==1||!Array.isArray(registry.cards))throw Error('Invalid reviewed additions registry');
  const seen=new Set();
  for(const r of registry.cards){
    if(seen.has(r.cardId)||r.language!=='Japanese'||!r.cardId||!r.catalogName||!r.reviewedAt
      ||!['Base','Ultra Rare'].includes(r.parallel)||!r.set||!r.number||!r.setCode||!(r.denominator>0))throw Error('Invalid reviewed identity');
    seen.add(r.cardId);
    const domestic=r.evidence?.filter(e=>e.role==='domestic-identity')||[];
    const hosts=new Set(domestic.map(e=>new URL(e.url).hostname.replace(/^www\./,'')));
    if(hosts.size<2||!r.evidence.some(e=>e.role==='official-set'&&e.url.startsWith('https://www.pokemon-card.com/'))
      ||!r.evidence.some(e=>e.role==='english-name'&&e.url.startsWith('https://www.pokemon.com/')))throw Error('Reviewed addition evidence incomplete');
  }
  return registry.cards;
}
function mappings(rows,context,catalog,registry,heldKeys=[]) {
  const key=require('./gemrate_csv_import').key,out=[];
  for(const r of registry){
    if(context.language!==r.language||context.set!==r.set||context.year!==r.year||context.grader!=='PSA')continue;
    const matches=rows.filter(s=>s['Card #']===r.number&&s.Name===r.sourceName&&s.Parallel===r.parallel);
    const card=catalog.find(c=>c.id===r.cardId);
    if(!matches.length)continue;
    const expected=canonicalIdentity({name:r.catalogName,model:r.number+'/'+String(r.denominator).padStart(3,'0'),language:'ja',rarity:r.rarity});
    if(matches.length!==1||!card||card.name!==r.catalogName||card.identityKey!==expected.key||card.language!=='ja'
      ||card.identityReviewRequired||card.rarity!==r.rarity||card.finish!==r.finish)throw Error('Reviewed catalog/source identity changed');
    const identity=key(matches[0],context);
    out.push({key:identity,cardId:r.cardId,identityKey:card.identityKey,hold:heldKeys.includes(identity),
      specEvidence:JSON.stringify({rule:'reviewed-exact-identity-v1',review:r,contextProof:context.contextProof})});
  }
  return out;
}
module.exports={entries,mappings};
