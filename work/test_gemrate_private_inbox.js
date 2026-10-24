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
 {status:'review',originalPath:path.join(incoming,'export (2).csv')}
]}));
assert.deepEqual(pendingFiles(store).map(r=>r.name),['export.csv'],'resume a moved original from its prepared receipt, never scan general Downloads');
console.log('PASS private inbox requires CSV hash and source-page date/grader/language/set proof; no filesystem-date inference');
