// Local build proof only. Never a freshness receipt and never shipped to clients.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function codeHash(root){
 const visited=new Set(),rows=[];
 function visit(relative){if(visited.has(relative))return;visited.add(relative);const file=path.join(root,relative),text=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');rows.push([relative,hash(text)]);
  for(const m of text.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)){let child=path.resolve(path.dirname(file),m[1]);if(!path.extname(child))child+='.js';if(!child.startsWith(path.resolve(root)+path.sep))throw Error('UI dependency outside repository');if(child.endsWith('.js'))visit(path.relative(root,child).replace(/\\/g,'/'));}
 }
 visit('work/build_ui_data.js');return hash(JSON.stringify(rows.sort((a,b)=>a[0].localeCompare(b[0]))));
}
function files(root){const rows=[];function scan(dir){for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const name=dir+'/'+e.name;if(e.isDirectory())scan(name);else if(name.endsWith('.json')&&name!=='data/ui/manifest.json')rows.push(name);}}scan('data');return rows.sort();}
function remember(root){const dir=path.join(root,'.private');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'ui-projection-build-proof.json'),JSON.stringify({version:1,code:codeHash(root),manifest:hash(fs.readFileSync(path.join(root,'data/ui/manifest.json'),'utf8').replace(/\r\n/g,'\n'))}));}
function current(root){try{
 const proof=JSON.parse(fs.readFileSync(path.join(root,'.private/ui-projection-build-proof.json'))),text=fs.readFileSync(path.join(root,'data/ui/manifest.json'),'utf8').replace(/\r\n/g,'\n');
 if(proof.version!==1||proof.code!==codeHash(root)||proof.manifest!==hash(text))return false;
 const manifest=JSON.parse(text),names=files(root);if(JSON.stringify(names)!==JSON.stringify(Object.keys(manifest.hashes).sort()))return false;
 return names.every(file=>hash(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n'))===manifest.hashes[file]);
 }catch{return false;}}
module.exports={codeHash,remember,current};
