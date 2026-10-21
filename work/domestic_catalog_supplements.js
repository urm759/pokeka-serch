const fs=require('node:fs'),path=require('node:path');
const {canonicalIdentity}=require('./card_identity');
const key=c=>[String(c.setCode||'').replace(/[^a-z0-9]/gi,'').toUpperCase(),String(c.model||c.name||'').match(/(\d{3})\/\d{3}/)?.[1]||String(c.model||'').match(/(\d{3})$/)?.[1],c.language].join('|');
function apply(cards,entries,previous=[],at=new Date().toISOString()) {
  const added=[];
  for(const entry of entries) {
    if(!entry.officialSource?.startsWith('https://www.pokemon-card.com/') || entry.language!=='ja' || !entry.identityEvidence)throw Error('Unverified official supplement');
    const collision=cards.find(c=>c.id===entry.id);
    if(collision && key(collision)!==key(entry))throw Error('Supplement ID identity conflict: '+entry.id);
    if(cards.some(c=>c.id===entry.id || key(c)===key(entry)))continue;
    const old=previous.find(c=>c.id===entry.id);
    const identity=canonicalIdentity(entry);
    if(identity.reviewRequired)throw Error('Supplement identity incomplete: '+entry.id);
    const card={price:null,snkPsa10Price:null,snkPsa9Price:null,priceObservedAt:null,psa9ObservedAt:null,tv7:null,tv30:null,p10tv7:null,p10tv30:null,img:null,snkUrl:null,
      ...old,...entry,identityKey:identity.key,cardNumber:identity.cardNumber,identityReviewRequired:false,firstSeenAt:old?.firstSeenAt||at,isNew:!old};
    cards.push(card);added.push(card.id);
  }
  return added;
}
function build(root=path.join(__dirname,'..')) {
  const file=path.join(root,'data/pokemon-cards.json'),cards=JSON.parse(fs.readFileSync(file)),entries=JSON.parse(fs.readFileSync(path.join(root,'work/domestic-catalog-supplements.json'))).cards;
  const added=apply(cards,entries);
  if(added.length) {fs.writeFileSync(file,JSON.stringify(cards));const metaFile=path.join(root,'data/pokemon-cards-meta.json'),meta=JSON.parse(fs.readFileSync(metaFile));meta.totalCards=cards.length;meta.generatedAt=new Date().toISOString();fs.writeFileSync(metaFile,JSON.stringify(meta,null,2));}
  return {added,priceAcquired:0,newlyAnalyzable:0};
}
if(require.main===module)console.log(JSON.stringify(build()));
module.exports={apply,build,key};
