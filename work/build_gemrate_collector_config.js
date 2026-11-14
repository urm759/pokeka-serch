// Small extension-only configuration; never an observation or an initial UI input.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),core=require('./gemrate-collector-extension/core');
function build(root=path.join(__dirname,'..')){
 const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),optional=(f,fallback)=>fs.existsSync(path.join(root,f))?read(f):fallback;
 const focus=new Set((optional('work/pop-focus-targets.json',{rows:[]}).rows||[]).map(r=>r.setCode));
 const targets=core.groups(read('work/gemrate-reviewed-sets.json'),read('data/gemrate-reference-summary.json'),optional('work/gemrate-collection-sets.json',{version:1,sets:[]}))
   .map(s=>({...s,priority:focus.has(s.setCode)?1:0})).sort((a,b)=>a.setCode.localeCompare(b.setCode));
 const result={schema:1,version:crypto.createHash('sha256').update(JSON.stringify(targets)).digest('hex'),targets};
 const file=path.join(root,'data/gemrate-collector-config.json'),text=JSON.stringify(result);if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==text)fs.writeFileSync(file,text);
 return result;
}
module.exports={build};if(require.main===module){const r=build();console.log(JSON.stringify({version:r.version,targets:r.targets.length,cards:r.targets.reduce((n,s)=>n+s.cards,0)}));}
