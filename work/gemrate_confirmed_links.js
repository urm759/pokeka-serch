const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const csv=require('./gemrate_csv_import'),matcher=require('./gemrate_identity_match');
const RULE='exact-reviewed-set-v1',FILE='confirmed-identities.json';
const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function fingerprint(card,english){return hash([card.id,card.identityKey,card.name,card.language,card.rarity??null,card.finish??null,Boolean(card.identityReviewRequired),english?.englishName||null]);}
function scope(root,context){const file=path.join(root,'work/gemrate-reviewed-sets.json');if(!fs.existsSync(file))return null;
 return JSON.parse(fs.readFileSync(file)).sets?.find(s=>s.set===context.set&&s.year===context.year&&s.language===context.language&&s.grader===context.grader)||null;}
function enabled(s){return s?.automaticReference?.rule===RULE&&Array.isArray(s.automaticReference.parallels);}
function load(store){const file=path.join(store,FILE);const r=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{version:1,rule:RULE,links:{}};
 if(r.version!==1||r.rule!==RULE||!r.links||Array.isArray(r.links))throw Error('Confirmed link registry schema invalid');return r;}
function revision(s,cards,english,manual){
 const selected=cards.filter(c=>matcher.printed(c.name)?.set===String(s?.setCode||'').toLowerCase());
 return hash([RULE,s,manual,selected.map(c=>[c.id,fingerprint(c,english[c.id])]).sort(([a],[b])=>a.localeCompare(b))]);
}
function resolve(source,context,cards,english,options,registry,manual=[]){
 const byId=new Map(cards.map(c=>[c.id,c])),reused=[],pending=[],review=[],held=new Set(options.heldKeys||[]);
 for(const row of new Map(source.map(r=>[csv.key(r,context),r])).values()){const key=csv.key(row,context),old=registry.links[key];
   if(!old){pending.push(row);continue;}
   const card=byId.get(old.cardId);
   if(!card||old.identityKey!==card.identityKey||old.fingerprint!==fingerprint(card,english[card.id])){review.push({key,reason:'confirmed-identity-changed',candidateIds:[old.cardId]});continue;}
   reused.push({key,cardId:card.id,identityKey:card.identityKey,hold:held.has(key),specEvidence:old.specEvidence});
 }
 const fresh=matcher.resolve(pending,context,cards,english,options);
 const mappings=[...reused,...fresh.mappings];
 for(const m of manual){if(review.some(r=>r.key===m.key))continue;const old=mappings.find(r=>r.key===m.key||r.cardId===m.cardId);
   if(old&&(old.key!==m.key||old.cardId!==m.cardId))throw Error('Confirmed/manual mapping conflict');if(old)Object.assign(old,m);else mappings.push(m);}
 const counts=new Map();for(const m of mappings)counts.set(m.cardId,(counts.get(m.cardId)||0)+1);
 const accepted=mappings.filter(m=>counts.get(m.cardId)===1);
 for(const m of mappings.filter(m=>counts.get(m.cardId)>1))review.push({key:m.key,reason:'multiple-source-specifications',candidateIds:[m.cardId]});
 let added=0;
 for(const m of accepted){if(m.hold)continue;const c=byId.get(m.cardId);if(!registry.links[m.key]){registry.links[m.key]={cardId:m.cardId,identityKey:m.identityKey,fingerprint:fingerprint(c,english[c.id]),specEvidence:m.specEvidence};added++;}}
 return {mappings:accepted,review:[...review,...fresh.review],added,reused:reused.length};
}
function authorized(row,card,s,registry,english){
 if(!enabled(s)||!card||card.identityReviewRequired||card.language!=='ja'||require('./card_identity').canonicalIdentity(card).variant)return false;
 const key=row.identity,link=registry.links[key];if(!link||link.cardId!==card.id||link.identityKey!==card.identityKey||link.fingerprint!==fingerprint(card,english[card.id]))return false;
 const id=JSON.parse(key);return id[0]==='Japanese'&&id[1]===s.set&&id[2]===s.year&&s.automaticReference.parallels.includes(id[5]);
}
function publicEntry(row,card,s,english){const id=JSON.parse(row.identity);return [card.identityKey,s.setCode,id[3],id[5],fingerprint(card,english[card.id])];}
function validatePublic(root,summary,registered){
 const legacyFile=path.join(root,'work/gemrate-legacy-reference-ids.json');
 if(fs.existsSync(legacyFile)&&JSON.stringify([...JSON.parse(fs.readFileSync(legacyFile)).ids].sort())!==JSON.stringify([...(registered.legacyIds||[])].sort()))throw Error('Legacy reviewed identities changed');
 if(summary.version!==2||summary.source!=='GemRate'||summary.grader!=='PSA'||summary.scope!=='reviewed-csv-reference'||JSON.stringify(summary.fields)!==JSON.stringify(['identityKey','psa10','total','sourceDate','sourceUrl'])||Object.keys(summary).sort().join(',')!==(summary.population?'cards,fields,grader,population,scope,source,version':'cards,fields,grader,scope,source,version'))throw Error('Public factual schema invalid');
 if(summary.population){const p=summary.population;if(p.version!==1||p.rule!=='same-source-exact-print-dated-v1'||Object.keys(p).sort().join(',')!=='cards,rule,version'||!p.cards||JSON.stringify(Object.keys(p.cards).sort())!==JSON.stringify(Object.keys(summary.cards).sort())||Object.entries(p.cards).some(([id,r])=>!require('../gemrate-pop-model').valid(summary.cards[id],r)))throw Error('Public GemRate observation summary invalid');}
 if(registered.version!==1||registered.rule!==RULE||!Array.isArray(registered.legacyIds)||registered.legacyIds.length!==50||new Set(registered.legacyIds).size!==50)throw Error('Public reference registry invalid');
 const cards=new Map(JSON.parse(fs.readFileSync(path.join(root,'data/pokemon-cards.json'))).map(c=>[c.id,c]));
 const englishFile=path.join(root,'work/snkr_english_names.json'),english=fs.existsSync(englishFile)?JSON.parse(fs.readFileSync(englishFile)).cards:{};
 const setsFile=path.join(root,'work/gemrate-reviewed-sets.json'),sets=fs.existsSync(setsFile)?JSON.parse(fs.readFileSync(setsFile)).sets:[];
 const allow=new Set([...registered.legacyIds,...require('./gemrate_reviewed_additions').entries(root).map(r=>r.cardId)]);
 for(const [id,r]of Object.entries(registered.automatic||{})){const card=cards.get(id),s=sets.find(s=>s.setCode===r[1]);const printed=card&&matcher.printed(card.name);
   if(!Array.isArray(r)||r.length!==5||!card||!enabled(s)||card.language!=='ja'||card.identityReviewRequired||require('./card_identity').canonicalIdentity(card).variant||r[0]!==card.identityKey||r[4]!==fingerprint(card,english[id])||!s.automaticReference.parallels.includes(r[3])||printed?.number!==Number(r[2])||printed?.denominator!==s.denominator||printed?.set!==s.setCode.toLowerCase())throw Error('Unproven automatic public identity '+id);
   allow.add(id);
 }
 for(const [id,row]of Object.entries(summary.cards||{})){
   const card=cards.get(id);if(!allow.has(id)||!card||row[0]!==card.identityKey||row.length!==5||!Number.isSafeInteger(row[1])||!Number.isSafeInteger(row[2])||row[2]<=0||row[1]<0||row[1]>row[2]||!validDay(row[3])||row[3]>new Date().toISOString().slice(0,10))throw Error('Invalid public reference '+id);
   const url=new URL(row[4]);if(url.protocol!=='https:'||!['gemrate.com','www.gemrate.com'].includes(url.hostname)||url.pathname!=='/item-details'||url.searchParams.get('grader')!=='psa')throw Error('Invalid public source');
   if(registered.automatic[id]){const s=sets.find(s=>s.setCode===registered.automatic[id][1]);if(url.searchParams.get('set_name')!==s.set||url.searchParams.get('year')!==String(s.year)||url.searchParams.get('category')!=='tcg-cards')throw Error('Wrong public set scope');}
 }
 return true;
}
module.exports={RULE,FILE,scope,enabled,load,revision,resolve,authorized,publicEntry,validatePublic,fingerprint};
