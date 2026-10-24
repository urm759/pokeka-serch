// Offline identity resolution. No network, prices, official POP mutation or public records.
const {key}=require('./gemrate_csv_import');
const normalized=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
const ENERGY_EVIDENCE=[
  'https://asia.pokemon-card.com/my/card-search/detail/5165/',
  'https://www.pokemon-card.com/deck/result.html/deckID/XppXRp-qg9Q3U-RpyyUM'
];
function equivalentName(card,english,source){
  if(normalized(english)===normalized(source))return true;
  // Name synonym only; set, number, rarity and parallel must still match.
  return /^基本悪エネルギー(?:\s|$)/.test(card.name)
    && normalized(english)==='basicdarknessenergy'&&normalized(source)==='darknessenergy';
}
function printed(name) {
  const m=String(name||'').match(/\[\s*([a-z0-9]+)\s+(\d+)\s*\/\s*(\d+)\s*\]/i);
  return m?{set:normalized(m[1]),number:Number(m[2]),denominator:Number(m[3])}:null;
}
function resolve(rows,context,cards,english,{setCode,denominator,contextProof,heldKeys=[]}={}) {
  if(context.grader!=='PSA'||context.language!=='Japanese'||!setCode||!denominator||!contextProof)throw Error('Explicit Japanese PSA set evidence required');
  const mappings=[],review=[],holds=new Set(heldKeys);
  for(const row of rows) {
    const identity=key(row,context),number=/^\d+$/.test(row['Card #'])?Number(row['Card #']):null;
    const sourceName=String(row.Name||'').replace(/^Full Art\//i,'').replace(/-Hyper$/i,'').replace(/-Holo$/i,'');
    const candidates=cards.filter(c=>{
      const p=printed(c.name),e=english[c.id],ep=printed(e?.englishName);
      if(c.language!=='ja'||!c.identityKey||c.identityReviewRequired||!p||!ep
        ||p.set!==normalized(setCode)||ep.set!==p.set||p.number!==number||ep.number!==number
        ||p.denominator!==denominator||ep.denominator!==denominator)return false;
      const n=String(e.englishName).split('[')[0].replace(/\b(?:MUR|BWR|SSR|CSR|CHR|SAR|UR|HR|SR|RRR|RR|AR|SA|R|C|U|P)\b/gi,'').replace(/[:：]/g,'');
      return equivalentName(c,n,sourceName);
    });
    let reason=candidates.length!==1?(candidates.length?'ambiguous-catalog':'catalog-or-name-unresolved'):null;
    if(!['Base','Ultra Rare'].includes(row.Parallel))reason='special-parallel-unresolved';
    const card=candidates[0],rarity=String(card?.name||'').match(/\b(UR|HR|SR|RRR|RR|R|C|U|P)\b/i)?.[1]?.toUpperCase();
    if(!reason && (/Hyper$/i.test(row.Name)!==(rarity==='HR') || (row.Parallel==='Ultra Rare')!==(rarity==='UR')))reason='rarity-or-finish-mismatch';
    if(reason){review.push({key:identity,number:row['Card #'],name:row.Name,parallel:row.Parallel,candidateIds:candidates.map(c=>c.id),reason});continue;}
    mappings.push({key:identity,cardId:card.id,identityKey:card.identityKey,hold:holds.has(identity),
      specEvidence:JSON.stringify({contextProof,setCode,number,denominator,parallel:row.Parallel,
        catalogName:card.name,englishName:english[card.id].englishName,englishSource:english[card.id].url,
        englishCapturedAt:english[card.id].fetchedAt,
        nameEvidence:/^基本悪エネルギー(?:\s|$)/.test(card.name)?ENERGY_EVIDENCE:undefined,
        rule:'exact-set-number-name-rarity-parallel-v2'})});
  }
  const ids=new Set();
  for(const m of mappings){if(ids.has(m.cardId))throw Error('Multiple source specifications map to one catalog card');ids.add(m.cardId);}
  return {mappings,review};
}
module.exports={resolve,printed};
