const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const inbox=require('./gemrate_private_inbox'),csv=require('./gemrate_csv_import'),reviewed=require('./gemrate_reviewed_additions');
const ROOT=path.resolve(__dirname,'..'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const scope=JSON.parse(fs.readFileSync(path.join(ROOT,'work/gemrate-reviewed-sets.json'))).sets;
const registry=reviewed.entries(ROOT),catalog=JSON.parse(fs.readFileSync(path.join(ROOT,'data/pokemon-cards.json')));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gemrate-multiset-')),store=path.join(temp,'private');fs.mkdirSync(store);
try {
 for(const set of scope){
  const context={pageUrl:'https://www.gemrate.com/item-details?grader=psa&category=tcg-cards&year='+set.year+'&set_name='+encodeURIComponent(set.set),grader:'PSA',language:'Japanese',set:set.set,year:set.year,sourceUpdatedDate:'2026-10-30',retrievedAt:'2026-11-01T12:00:00Z'};
  const bytes=Buffer.from('Card #,Name,Parallel,Gems,Total\n101,Synthetic,Base,10,20');
  const proof={url:context.pageUrl,grader:'PSA',category:'tcg-cards',language:'Japanese',set:set.set,year:set.year,updated:context.sourceUpdatedDate,csvRows:1,setTotals:{psa10:10,total:20},csvSha256:hash(bytes)};
  const b=Buffer.from(JSON.stringify(proof));fs.writeFileSync(path.join(store,'proof.json'),b);context.contextProof='sha256:'+hash(b);
  const sidecar={context,proofFile:'proof.json',csvSha256:hash(bytes)};
  assert.equal(inbox.validate(sidecar,bytes,store).setCode,set.setCode);
  for(const change of [{year:set.year+1},{sourceUpdatedDate:'2026-11-01'},{language:'English'},{grader:'CGC'},{contextProof:'wrong'},{pageUrl:context.pageUrl.replace('grader=psa','grader=cgc')}])
   assert.throws(()=>inbox.validate({...sidecar,context:{...context,...change}},bytes,store));
  assert.throws(()=>inbox.validate({...sidecar,csvSha256:'wrong'},bytes,store));
 }
 for(const id of ['pk-43864','pk-41858']){
  const r=registry.find(r=>r.cardId===id);assert(r);
  assert(reviewed.sameIdentity(r,{...r,note:'Corrected evidence annotation'}));
  assert(!reviewed.sameIdentity(r,{...r,parallel:'Special Art Rare-Missing Texture'}));
  assert(!reviewed.sameIdentity(r,{...r,number:'999'}));
  const context={grader:'PSA',language:'Japanese',set:r.set,year:r.year,contextProof:'proof'};
  const row={'Card #':r.number,Name:r.sourceName,Parallel:r.parallel,Gems:'10',Total:'20'};
  assert.equal(reviewed.mappings([row],context,catalog,registry).length,1);
  for(const bad of [{...row,Parallel:'Special Art Rare-Missing Texture'},{...row,Parallel:'Super Rare'},{...row,'Card #':'999'},{...row,Name:'Metal '+r.sourceName}])
   assert.equal(reviewed.mappings([bad],context,catalog,registry).length,0);
  assert.equal(reviewed.mappings([row],{...context,language:'English'},catalog,registry).length,0);
  const map=reviewed.mappings([row],context,catalog,registry,[csv.key(row,context)]);
  assert.equal(map[0].hold,true,'review must not clear source mismatch holds');
  const imported=csv.importCsv('Card #,Name,Parallel,Gems,Total\n'+[r.number,r.sourceName,r.parallel,'10','20'].join(','),
   {...context,pageUrl:'https://www.gemrate.com/item-details?grader=psa&category=tcg-cards&year='+r.year+'&set_name='+encodeURIComponent(r.set),sourceUpdatedDate:'2026-10-30',retrievedAt:'2026-11-01T12:00:00Z'},map);
  assert.equal(imported.accepted.length,0);
 }
 console.log('PASS new reviewed Japanese sets only; original date/hash/page required; SAR vs SR/missing-texture/metal/foreign/number and persistent discrepancy holds');
} finally {
 assert(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(temp).startsWith('gemrate-multiset-'));
 fs.rmSync(temp,{recursive:true,force:true});
}
