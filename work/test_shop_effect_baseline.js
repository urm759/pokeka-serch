const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {resolve}=require('./shop_effect_baseline'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'pokeka-shop-effect-'));
const git=(args,cwd=dir)=>cp.execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
try{
 git(['init','-b','main']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.invalid']);git(['config','commit.gpgsign','false']);
 fs.mkdirSync(path.join(dir,'data'));const file=path.join(dir,'data/psa-population-summary.json');
 fs.writeFileSync(file,JSON.stringify({cards:{fixture:{rate:70}}}));git(['add','.']);git(['commit','-m','event baseline']);const event=git(['rev-parse','HEAD']);
 fs.writeFileSync(file,JSON.stringify({cards:{fixture:{rate:80}}}));git(['commit','-am','actual main while queued']);const checkout=git(['rev-parse','HEAD']);
 const shallow=path.join(dir,'shallow');git(['clone','--quiet','--depth=1',require('node:url').pathToFileURL(dir).href,shallow]);
 assert.throws(()=>git(['show',event+':data/psa-population-summary.json'],shallow),'reproduces queued-event SHA missing from shallow checkout');
 const result=resolve(shallow,'checkout',event);assert.equal(result.referenceCommit,checkout);assert.equal(result.triggerCommit,event);assert.equal(result.checkoutCommit,checkout);
 assert.equal(JSON.parse(git(['show',result.referenceCommit+':data/psa-population-summary.json'],shallow)).cards.fixture.rate,80);
 assert.throws(()=>resolve(shallow,event,event),/baseline unavailable/,'explicit historical comparison never silently changes reference');
 assert.throws(()=>resolve(shallow,'main'),/full reference/);
 console.log('PASS real shallow clone: pending event vs actual main checkout, exact baseline inputs, explicit old references retained and missing history fails honestly');
}finally{const target=path.resolve(dir);assert.equal(path.dirname(target),path.resolve(os.tmpdir()));assert(path.basename(target).startsWith('pokeka-shop-effect-'));fs.rmSync(target,{recursive:true,force:true});}
