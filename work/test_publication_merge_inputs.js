const assert=require('node:assert/strict'),fs=require('fs');
const m=require('./publication_merge_inputs'),{capture}=require('./capture_unpublished_data');
const base={updatedAt:'2026-11-13T00:00:00Z',cards:{a:{checkedAt:'2026-11-13T00:00:00Z',status:'unknown'}}};
const a={...base,updatedAt:'2026-11-13T01:00:00Z',cards:{...base.cards,b:{checkedAt:'2026-11-13T01:00:00Z',status:'backed',price:100}}};
const b={...base,updatedAt:'2026-11-13T02:00:00Z',cards:{a:{checkedAt:'2026-11-13T02:00:00Z',status:'unbacked'},c:{checkedAt:'2026-11-13T02:00:00Z',status:'backed',price:200}}};
const merged=m.evidence(base,a,b);assert.deepEqual(Object.keys(merged.cards).sort(),['a','b','c']);assert.equal(merged.cards.a.status,'unbacked');
assert.throws(()=>m.evidence(base,a,{...a,cards:{...a.cards,b:{...a.cards.b,price:150}}}),/distinct timestamps/,'equal-time contradictory source proof stays held');
const op=(at,rows)=>({updatedAt:at,settings:{fee:6980},modelVersion:'v',cards:{a:{clean:rows}}});
const ob=op('2026-11-13T00:00:00Z',[{date:'2026-11-11',operational:10}]);
const oa=op('2026-11-13T01:00:00Z',[...ob.cards.a.clean,{date:'2026-11-12',operational:20}]);
const oc=op('2026-11-13T02:00:00Z',[...ob.cards.a.clean,{date:'2026-11-13',operational:30}]);
assert.deepEqual(m.operational(ob,oa,oc).cards.a.clean.map(r=>r.operational),[10,20,30]);
assert.throws(()=>m.operational(ob,oa,{...oc,settings:{fee:12980}}),/settings conflict/);
assert(!m.TYPES.has('data/pokemon-cards.json'));assert(!require('./resolve_generated_merge').DERIVED.has('data/state-a-price-evidence.json'));
const path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'pokeka-compact-provenance-'));
try{
 const files=['data/psa10-observation-receipt.json','data/domestic-trade-source-audit.json','data/state-a-price-evidence.json'];
 fs.mkdirSync(path.join(temporary,'data'));for(const file of files)fs.writeFileSync(path.join(temporary,file),JSON.stringify({fixture:file,observedAt:'2026-11-13T00:00:00Z'}));
 const result=capture({cwd:temporary,source:'monitor-prevalidation'}),manifest=JSON.parse(fs.readFileSync(path.join(result.directory,'recovery-manifest.json')));
 for(const file of files){const row=manifest.files.find(r=>r.file===file);assert(row,'captured source proof '+file);const original=fs.readFileSync(path.join(temporary,file)),saved=fs.readFileSync(path.join(result.directory,file));assert.deepEqual(original,saved);assert.equal(row.sha256,crypto.createHash('sha256').update(original).digest('hex'));}
}finally{const resolved=path.resolve(temporary);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert(path.basename(resolved).startsWith('pokeka-compact-provenance-'));fs.rmSync(resolved,{recursive:true,force:true});}
const history={days:[{date:'2026-11-12',settings:{fee:1},modelVersion:'v',candidates:1}]};
assert.throws(()=>m.candidates(history,{days:[{...history.days[0],candidates:2}]},{days:[{...history.days[0],candidates:3}]},{leftAudit:{generatedAt:oa.updatedAt},rightAudit:{generatedAt:oa.updatedAt}}),/distinct timestamps/);
console.log('PASS source evidence union, equal-time contradiction hold, operational history preservation/settings guard, candidate snapshot time proof and compact provenance capture');
