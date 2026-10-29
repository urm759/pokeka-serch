const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {receive}=require('./gemrate_private_store'),csv=require('./gemrate_csv_import'),{build,refreshIfAvailable}=require('./build_gemrate_public_reference');
const additions=require('./gemrate_reviewed_additions'),registry=additions.entries(path.join(__dirname,'..'));
const reviewed=registry[0],canonical=require('./card_identity').canonicalIdentity;
const reviewedCard={id:reviewed.cardId,name:reviewed.catalogName,language:'ja',rarity:reviewed.rarity,finish:reviewed.finish,
  identityKey:canonical({name:reviewed.catalogName,model:'100/069',language:'ja',rarity:reviewed.rarity}).key};
const reviewedContext={language:reviewed.language,set:reviewed.set,year:reviewed.year,grader:'PSA',contextProof:'verified'};
const reviewedSource={'Card #':reviewed.number,Name:reviewed.sourceName,Parallel:reviewed.parallel};
assert.equal(additions.mappings([reviewedSource],reviewedContext,[reviewedCard],registry).length,1);
assert.equal(additions.mappings([{...reviewedSource,Parallel:'Reverse Holo'}],reviewedContext,[reviewedCard],registry).length,0);
assert.equal(additions.mappings([reviewedSource],{...reviewedContext,grader:'CGC'},[reviewedCard],registry).length,0);
assert.throws(()=>additions.mappings([reviewedSource],reviewedContext,[{...reviewedCard,identityKey:'wrong'}],registry),/changed/);
assert(additions.mappings([reviewedSource],reviewedContext,[reviewedCard],registry,[csv.key(reviewedSource,reviewedContext)])[0].hold,'discrepancy holds cannot be removed by review');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gemrate-refresh-')),root=path.join(temp,'public'),store=path.join(temp,'private'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
fs.mkdirSync(path.join(root,'data'),{recursive:true});fs.mkdirSync(path.join(store,'incoming'),{recursive:true});fs.writeFileSync(path.join(store,'.gitignore'),'*\n');
const cards=Array.from({length:51},(_,i)=>({id:'card-'+i,identityKey:'ja|S6a|'+i}));fs.writeFileSync(path.join(root,'data/pokemon-cards.json'),JSON.stringify(cards));
const official='{"old":"official-date-retained"}';fs.writeFileSync(path.join(root,'data/psa-official-populations.json'),official);
const set='Japanese Synthetic Set',page='https://www.gemrate.com/item-details?grader=psa&category=tcg-cards&year=2021&set_name='+encodeURIComponent(set);
const review={grader:'PSA',set,year:2021,updated:'2026-10-23',identityReview:[{set:'S6a'}]};fs.writeFileSync(path.join(temp,'gemrate-public-review-20261023.json'),JSON.stringify(review));
function received(name,date,n,ten){
 const proof=Buffer.from(JSON.stringify({...review,updated:date})),proofFile=path.join(store,'page-'+date+'.json');fs.writeFileSync(proofFile,proof);
 const context={grader:'PSA',language:'Japanese',set,year:2021,sourceUpdatedDate:date,retrievedAt:'2026-10-28T00:00:00Z',contextProof:'sha256:'+hash(proof),pageUrl:page};
 const rows=cards.slice(0,n).map((c,i)=>({'Card #':String(i+1).padStart(3,'0'),Name:'Synthetic '+i,Parallel:'Base',Gems:String(ten),Total:'20'}));
 const bytes=Buffer.from('Card #,Name,Parallel,Gems,Total\n'+rows.map(r=>[r['Card #'],r.Name,r.Parallel,r.Gems,r.Total].join(',')).join('\n'));
 const file=path.join(store,'incoming',name);fs.writeFileSync(file,bytes);fs.writeFileSync(file+'.context.json',JSON.stringify({csvSha256:hash(bytes),proofFile:path.basename(proofFile),context}));
 const mappings=rows.map((r,i)=>({key:csv.key(r,context),cardId:cards[i].id,identityKey:cards[i].identityKey,specEvidence:'synthetic exact Japanese/number/finish'}));
 return receive({store,publicRoot:root,files:[{path:file,kind:'list',context,mappings}]}).files[0];
}
try{
 const old=received('export (1).csv','2026-10-23',50,10);
 fs.writeFileSync(path.join(store,'expanded-verification-report.json'),JSON.stringify({acceptedCards:50,discrepancyHeldCards:1,outputs:[{path:old.parsedPath,sha256:old.sha256,accepted:50}]}));
 assert.equal(build(root,store).publishedReferences,50);
 const next=received('export (2).csv','2026-10-27',51,12),changed=build(root,store);assert.equal(changed.updatedReferences,50);
 const out=JSON.parse(fs.readFileSync(path.join(root,'data/gemrate-reference-summary.json')));assert.equal(Object.keys(out.cards).length,50);assert(!out.cards['card-50'],'unreviewed ID remains private');
 assert.equal(out.cards['card-0'][1],12);assert.equal(out.cards['card-0'][3],'2026-10-27');assert.equal(build(root,store).updatedReferences,0);
 const retained=fs.readFileSync(path.join(root,'data/gemrate-reference-summary.json'),'utf8');fs.appendFileSync(next.storedPath,'corruption');
 assert.throws(()=>build(root,store),/mismatch/);assert.equal(refreshIfAvailable(root,store).status,'held');assert.equal(fs.readFileSync(path.join(root,'data/gemrate-reference-summary.json'),'utf8'),retained);
 assert.equal(fs.readFileSync(path.join(root,'data/psa-official-populations.json'),'utf8'),official,'no official dates or POP deltas overwritten');
 assert(!retained.includes('csvSha256')&&!retained.includes(temp),'no raw metadata/private paths exported');
 console.log('PASS reviewed-scope inbox refresh: hash/page/date/identity, original backup, 50-only publication, no duplicates, bad receipt retains prior data and does not block domestic sources, official rates unchanged');
}finally{assert(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep)&&/^gemrate-refresh-/.test(path.basename(temp)));fs.rmSync(temp,{recursive:true,force:true});}
