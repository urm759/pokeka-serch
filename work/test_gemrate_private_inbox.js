const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {validate}=require('./gemrate_private_inbox'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const {pendingFiles}=require('./gemrate_private_inbox');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gemrate-inbox-')),store=path.join(root,'gemrate');fs.mkdirSync(store);
const proof={grader:'PSA',set:'Japanese set',year:2021,updated:'2026-10-23',identityReview:[{set:'S6a'}]};
const bytes=Buffer.from('synthetic'),text=Buffer.from(JSON.stringify(proof));fs.writeFileSync(path.join(root,'page.json'),text);fs.writeFileSync(path.join(root,'gemrate-public-review-20261023.json'),text);
const context={grader:'PSA',language:'Japanese',set:proof.set,year:2021,sourceUpdatedDate:proof.updated,contextProof:'sha256:'+sha(text)};
const sidecar={context,csvSha256:sha(bytes),proofFile:'../page.json'};
assert.equal(validate(sidecar,bytes,store).setCode,'S6a');
for(const value of [{...sidecar,csvSha256:'bad'},{...sidecar,context:{...context,sourceUpdatedDate:'2026-10-24'}},{...sidecar,context:{...context,language:'English'}},{...sidecar,context:{...context,contextProof:'bad'}}])assert.throws(()=>validate(value,bytes,store));
const incoming=path.join(store,'incoming');fs.mkdirSync(incoming);
fs.writeFileSync(path.join(store,'manifest.json'),JSON.stringify({files:[
 {status:'prepared',originalPath:path.join(incoming,'export.csv'),storedPath:path.join(store,'retained.csv')},
 {status:'prepared',originalPath:path.join(root,'export (1).csv')},
 {status:'review',kind:'list',originalPath:path.join(incoming,'export (2).csv')}
]}));
assert.deepEqual(pendingFiles(store).map(r=>r.name),['export.csv'],'resume a moved original from its prepared receipt, never scan general Downloads');
const manifestFile=path.join(store,'manifest.json');
fs.writeFileSync(path.join(incoming,'export (2).csv.context.json'),'{}');
assert(pendingFiles(store,'new-reviewed-registry').some(r=>r.name==='export (2).csv'),'new reviewed identity can reprocess a retained receipt without new HTTP');
const manifest=JSON.parse(fs.readFileSync(manifestFile));manifest.files[2].reviewRevision='new-reviewed-registry';fs.writeFileSync(manifestFile,JSON.stringify(manifest));
assert(!pendingFiles(store,'new-reviewed-registry').some(r=>r.name==='export (2).csv'),'unchanged registry must not repeatedly reprocess completed receipts');
assert(!pendingFiles(store,context=>'new-reviewed-registry').some(r=>r.name==='export (2).csv'),'a review of an unrelated set must not reprocess this set');
// 4-J GemRate range: a set reviewed for collection only (no reference data yet, e.g. SV3) passes the
// set-identity step like gemrate_browser_receipts.scopes(); the CSV/page checks after it still apply.
const scoped=fs.mkdtempSync(path.join(os.tmpdir(),'gemrate-scope-'));fs.mkdirSync(path.join(scoped,'work'));
const sv3={setCode:'SV3',set:'Pokemon Japanese SV3-Ruler of the Black Flame',year:2023,language:'Japanese',grader:'PSA',denominator:108,officialSetUrl:'https://www.pokemon-card.com/ex/sv3/',reviewedAt:'2026-11-21'};
const sv3Proof={grader:'PSA',set:sv3.set,year:2023,updated:'2026-11-22',url:'https://www.gemrate.com/item-details?category=tcg-cards&grader=psa&set_name=x&year=2023',category:'tcg-cards',language:'Japanese',csvRows:1,setTotals:{psa10:1,total:1}};
const sv3Text=Buffer.from(JSON.stringify(sv3Proof));fs.writeFileSync(path.join(root,'sv3-page.json'),sv3Text);
const sv3Context={grader:'PSA',language:'Japanese',set:sv3.set,year:2023,sourceUpdatedDate:'2026-11-22',pageUrl:sv3Proof.url,contextProof:'sha256:'+sha(sv3Text)};
const sv3Sidecar={context:sv3Context,csvSha256:sha(bytes),proofFile:'../sv3-page.json'};
fs.writeFileSync(path.join(scoped,'work/gemrate-reviewed-sets.json'),JSON.stringify({version:1,sets:[]}));
assert.throws(()=>validate(sv3Sidecar,bytes,store,scoped),/Set identity has not been reviewed/,'without any registry entry the set is still refused');
fs.writeFileSync(path.join(scoped,'work/gemrate-collection-sets.json'),JSON.stringify({version:1,sets:[sv3]}));
assert.throws(()=>validate(sv3Sidecar,bytes,store,scoped),e=>!/Set identity has not been reviewed/.test(e.message),'a collection-reviewed set passes the set step and meets the later CSV/page checks');
fs.writeFileSync(path.join(scoped,'work/gemrate-collection-sets.json'),JSON.stringify({version:1,sets:[{...sv3,officialSetUrl:'https://example.com/'}]}));
assert.throws(()=>validate(sv3Sidecar,bytes,store,scoped),/Set identity has not been reviewed/,'the same required fields apply to collection sets');
fs.writeFileSync(path.join(scoped,'work/gemrate-reviewed-sets.json'),JSON.stringify({version:1,sets:[sv3]}));fs.writeFileSync(path.join(scoped,'work/gemrate-collection-sets.json'),JSON.stringify({version:1,sets:[sv3]}));
assert.throws(()=>validate(sv3Sidecar,bytes,store,scoped),/Set identity has not been reviewed/,'a set listed twice is ambiguous and refused');
fs.rmSync(scoped,{recursive:true,force:true});
console.log('PASS private inbox requires CSV hash and source-page date/grader/language/set proof; collection-reviewed sets (SV3) pass the set step; no filesystem-date inference');
