// Offline identity resolution. No network, prices, official POP mutation or public records.
const {key}=require('./gemrate_csv_import');
const normalized=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
const ENERGY_EVIDENCE=[
  'https://asia.pokemon-card.com/my/card-search/detail/5165/',
  'https://www.pokemon-card.com/deck/result.html/deckID/XppXRp-qg9Q3U-RpyyUM'
];
function equivalentName(card,english,source){
  if(normalized(english)===normalized(source))return true;
  const p=printed(card.name);
  const scoped=require('./psa-name-aliases.json').sourceNames?.find(a=>a.evidence?.length>=2
    &&normalized(a.set)===p?.set&&a.numbers.includes(String(p?.number))&&a.denominator===p?.denominator
    &&String(card.name).normalize('NFKC').startsWith(a.japanese+' ')
    &&normalized(english)===normalized(a.to)&&normalized(source)===normalized(a.from));
  if(scoped)return true;
  // Name synonym only; set, number, rarity and parallel must still match.
  return /^基本悪エネルギー(?:\s|$)/.test(card.name)
    && normalized(english)==='basicdarknessenergy'&&normalized(source)==='darknessenergy';
}
function printed(name) {
  const m=String(name||'').match(/\[\s*([a-z0-9]+)\s+(\d+)\s*\/\s*(\d+)\s*\]/i);
  return m?{set:normalized(m[1]),number:Number(m[2]),denominator:Number(m[3])}:null;
}
function resolve(rows,context,cards,english,{setCode,denominator,contextProof,heldKeys=[],parallels=['Base','Ultra Rare']}={}) {
  if(context.grader!=='PSA'||context.language!=='Japanese'||!setCode||!denominator||!contextProof)throw Error('Explicit Japanese PSA set evidence required');
  const mappings=[],review=[],holds=new Set(heldKeys);
  // Set/number/English-print indexing is shared by all rows of this CSV. Do not
  // canonicalize the entire domestic catalog again for every exported row.
  const byNumber=new Map();
  for(const c of cards){
    const p=printed(c.name),e=english[c.id],ep=printed(e?.englishName);
    if(c.language!=='ja'||!c.identityKey||c.identityReviewRequired||!p||!ep
      ||p.set!==normalized(setCode)||ep.set!==p.set||ep.number!==p.number
      ||p.denominator!==denominator||ep.denominator!==denominator
      ||require('./card_identity').canonicalIdentity(c).variant)continue;
    const name=String(e.englishName).split('[')[0].replace(/\b(?:MUR|BWR|SSR|CSR|CHR|SAR|UR|HR|SR|RRR|RR|AR|SA|R|C|U|P)\b/gi,'').replace(/[:：]/g,'');
    const bucket=byNumber.get(p.number)||[];bucket.push({card:c,name});byNumber.set(p.number,bucket);
  }
  for(const row of rows) {
    const identity=key(row,context),number=/^\d+$/.test(row['Card #'])?Number(row['Card #']):null;
    const sourceName=String(row.Name||'').replace(/^Full Art\//i,'').replace(/-Hyper$/i,'').replace(/-Holo$/i,'');
    const candidates=(byNumber.get(number)||[]).filter(x=>equivalentName(x.card,x.name,sourceName)).map(x=>x.card);
    let reason=candidates.length!==1?(candidates.length?'ambiguous-catalog':'catalog-or-name-unresolved'):null;
    if(!parallels.includes(row.Parallel))reason='special-parallel-unresolved';
    const card=candidates[0],rarity=String(card?.name||'').match(/\b(UR|HR|SR|RRR|RR|R|C|U|P)\b/i)?.[1]?.toUpperCase();
    const exactRarity=card&&require('./card_identity').canonicalIdentity(card).rarity;
    const parallelRarity={'Art Rare':'AR','Special Art Rare':'SAR','Super Rare':'SR'};
    if(!reason&&(parallelRarity[row.Parallel]&&parallelRarity[row.Parallel]!==exactRarity
      ||row.Parallel==='Base'&&['AR','SAR','SSR'].includes(exactRarity)))reason='rarity-or-finish-mismatch';
    if(!reason && (/Hyper$/i.test(row.Name)!==(rarity==='HR') || (row.Parallel==='Ultra Rare')!==(rarity==='UR')))reason='rarity-or-finish-mismatch';
    if(reason){review.push({key:identity,number:row['Card #'],name:row.Name,parallel:row.Parallel,candidateIds:candidates.map(c=>c.id),reason});continue;}
    mappings.push({key:identity,cardId:card.id,identityKey:card.identityKey,hold:holds.has(identity),
      specEvidence:JSON.stringify({contextProof,setCode,number,denominator,parallel:row.Parallel,
        catalogName:card.name,englishName:english[card.id].englishName,englishSource:english[card.id].url,
        englishCapturedAt:english[card.id].fetchedAt,
        nameEvidence:/^基本悪エネルギー(?:\s|$)/.test(card.name)?ENERGY_EVIDENCE:undefined,
        rule:'exact-set-number-name-rarity-parallel-v2'})});
  }
  const counts=new Map();for(const m of mappings)counts.set(m.cardId,(counts.get(m.cardId)||0)+1);
  for(const m of mappings.filter(m=>counts.get(m.cardId)>1))review.push({key:m.key,candidateIds:[m.cardId],reason:'multiple-source-specifications'});
  return {mappings:mappings.filter(m=>counts.get(m.cardId)===1),review};
}
module.exports={resolve,printed};
