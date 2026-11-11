const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict');
const worker=require('./run_gemrate_worker'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'gemrate-worker-')),root=path.join(temp,'repo'),store=path.join(temp,'private'),remote=path.join(temp,'remote.git');
fs.mkdirSync(root);fs.mkdirSync(store);
const git=(a,cwd=root)=>cp.execFileSync('git',a,{cwd,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const write=(f,s)=>{const p=path.join(root,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s);};
try{
 git(['init','--bare',remote],temp);git(['init','-b','main']);git(['config','user.name','fixture']);git(['config','user.email','fixture@example.invalid']);git(['remote','add','origin',remote]);
 // The receiver validates the exact export binding through this nested dependency.
 // A root-only *.js sparse checkout used to omit it despite full-checkout tests passing.
 write('work/gemrate-collector-extension/core.js',fs.readFileSync(path.join(__dirname,'gemrate-collector-extension/core.js'),'utf8'));
 write('work/run_gemrate_reference_pipeline.js',"const fs=require('fs'),p=require('path'),core=require('./gemrate-collector-extension/core');if(typeof core.bindingMatches!=='function')throw Error('export binding validator missing');if(!process.env.GEMRATE_PRIVATE_STORE)throw Error('private store missing');fs.writeFileSync(p.join(process.env.GEMRATE_PRIVATE_STORE,'fixture-worker-called.json'),JSON.stringify({cwd:process.cwd()}));fs.writeFileSync('data/gemrate-reference-summary.json','worker projection');console.log('fixture isolated pipeline called');");
 write('data/gemrate-reference-summary.json','original main');write('private-development.txt','initial');
 git(['add','.']);git(['commit','-m','fixture']);git(['push','-u','origin','main']);
 write('private-development.txt','staged personal work');git(['add','private-development.txt']);
 const before=git(['status','--porcelain']),head=git(['rev-parse','HEAD']);
 const result=worker.run(root,store);assert(result.isolatedMain);assert.equal(git(['status','--porcelain']),before);assert.equal(git(['rev-parse','HEAD']),head);
 assert.equal(fs.readFileSync(path.join(store,'worker/work/gemrate-collector-extension/core.js'),'utf8'),fs.readFileSync(path.join(root,'work/gemrate-collector-extension/core.js'),'utf8'),'released nested binding validator is present in the actual sparse worker');
 assert(fs.readFileSync(path.join(store,'worker/data/gemrate-reference-summary.json'),'utf8').includes('worker projection'));
 worker.run(root,store);assert.equal(git(['status','--porcelain']),before,'repeat worker must not touch parent staging');assert(fs.readdirSync(path.join(store,'worker-projections')).length);
 assert.equal(JSON.parse(fs.readFileSync(path.join(store,'fixture-worker-called.json'))).cwd,path.join(store,'worker'));
 console.log('PASS private sparse-main worker starts and repeats with original staging untouched, retains its old projections and routes private store explicitly');
}finally{
 const candidate=path.join(store,'worker');if(fs.existsSync(path.join(candidate,'.git')))git(['worktree','remove','--force',candidate]);
 assert(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(temp).startsWith('gemrate-worker-'));fs.rmSync(temp,{recursive:true,force:true});
}
