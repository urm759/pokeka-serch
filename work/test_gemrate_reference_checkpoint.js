const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict'),checkpoint=require('./gemrate_reference_checkpoint');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gemrate-checkpoint-')),root=path.join(temp,'repo'),remote=path.join(temp,'remote.git'),store=path.join(temp,'private');
for(const d of [root,store])fs.mkdirSync(d);
const git=(args,cwd=root)=>cp.execFileSync('git',args,{cwd,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const write=(f,x)=>{fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true});fs.writeFileSync(path.join(root,f),typeof x==='string'?x:JSON.stringify(x));};
try{
 git(['init','--bare',remote],temp);git(['init','-b','main']);git(['config','user.name','test']);git(['config','user.email','test@example.invalid']);git(['remote','add','origin',remote]);
 const cards=Array.from({length:50},(_,i)=>({id:'test-'+i,identityKey:'identity-'+i}));
 const legacy=cards.map(c=>c.id),registration={version:1,rule:'exact-reviewed-set-v1',legacyIds:legacy,automatic:{}};
 const reference={version:2,source:'GemRate',grader:'PSA',scope:'reviewed-csv-reference',fields:['identityKey','psa10','total','sourceDate','sourceUrl'],cards:Object.fromEntries(cards.map(c=>[c.id,[c.identityKey,8,10,'2026-10-30','https://www.gemrate.com/item-details?grader=psa']]))};
 write('data/pokemon-cards.json',cards);write(checkpoint.FILES[0],reference);write(checkpoint.FILES[1],registration);write('work/gemrate-legacy-reference-ids.json',{version:1,ids:legacy});write('private.csv','do-not-publish');
 git(['add','.']);git(['commit','-m','fixture']);git(['push','-u','origin','main']);
 write('unrelated-code.js','staged user code');git(['add','unrelated-code.js']);write('private.csv','uncommitted private CSV');
 const indexBefore=git(['diff','--cached','--name-only']),head=git(['rev-parse','HEAD']),status=git(['status','--porcelain']);
 reference.cards['test-0'][1]=9;reference.cards['test-0'][3]='2026-10-31';write(checkpoint.FILES[0],reference);
 const first=checkpoint.push(root,store);assert.equal(first.queued,true);assert.deepEqual(first.changed,[checkpoint.FILES[0]]);
 assert.equal(git(['rev-parse','HEAD']),head);assert.equal(git(['diff','--cached','--name-only']),indexBefore,'user staging untouched');
 assert.equal(git(['show',first.commit+':private.csv']),'do-not-publish');assert.throws(()=>git(['show',first.commit+':unrelated-code.js']));
 assert.equal(checkpoint.push(root,store).status,'already-queued','unchanged CSV must not create repeated checkpoints');
 const before=structuredClone(reference);assert.throws(()=>checkpoint.validateTransition(before,{cards:{}}));
 const old=structuredClone(reference);old.cards['test-0'][3]='2026-10-29';assert.throws(()=>checkpoint.validateTransition(before,old));
 const conflict=structuredClone(reference);conflict.cards['test-0'][1]=7;assert.throws(()=>checkpoint.validateTransition(before,conflict));
 const badRegistry={...registration,legacyIds:[...legacy.slice(1),'unknown']};assert.throws(()=>require('./gemrate_confirmed_links').validatePublic(root,reference,badRegistry));
 assert.throws(()=>checkpoint.enqueue(root,root),'private outbox cannot be in public repository');
 console.log('PASS isolated two-file checkpoint, normal push, dirty user index/worktree safety, no-op dedup, legacy allowlist and monotonic observations');
}finally{assert(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(temp).startsWith('gemrate-checkpoint-'));fs.rmSync(temp,{recursive:true,force:true});}
