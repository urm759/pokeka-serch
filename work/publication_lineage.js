const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const SOURCES=['pokemon-cards','psa-official-populations','psa-population-summary','shop-buyback-summary',
  'cardrush-stock-summary','hareruya2-stock-summary','yuyutei-stock-summary','torecacamp-stock-summary',
  'state-a-price-evidence','state-a-price-audit'].map(n=>'data/'+n+'.json');
const DERIVED=['data/card-catalog-completion.json','data/completion-outcomes.json','data/modern-high-rarity-audit.json'];
const FILE='data/publication-lineage.json';
const digest=x=>crypto.createHash('sha256').update(x.replace(/\r\n/g,'\n')).digest('hex');
function reader(root,staged=false){return file=>{
  if(!staged)return fs.existsSync(path.join(root,file))?fs.readFileSync(path.join(root,file),'utf8'):null;
  const r=spawnSync('git',['show',':'+file],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});
  if(r.error)throw r.error;
  return r.status===0?r.stdout:null;
};}
function hashes(read,files){return Object.fromEntries(files.map(f=>{const t=read(f);return [f,t===null?null:digest(t)];}));}
function same(a,b,reason){if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Publication version mismatch: '+reason);}
function coherent(read){
  const parse=f=>{const t=read(f);return t===null?null:JSON.parse(t);};
  const completion=parse(DERIVED[0]),outcomes=parse(DERIVED[1]),status=parse('data/update-status.json');
  if(!completion&&!outcomes&&!status)return false;
  if(!completion||!outcomes||!status?.unifiedMonitor?.outcomes)throw Error('Publication version mismatch: completion/monitor data missing');
  same(status.unifiedMonitor.outcomes,outcomes,'monitor and downloadable outcomes');
  same([completion.summary.total,completion.summary.analyzable],
    [outcomes.counts.listed,outcomes.counts.analyzable],'catalog and outcome counts');
  return true;
}
function snapshot(root){return hashes(reader(root),SOURCES);}
function seal(root,expected){
  const read=reader(root);coherent(read);
  same(snapshot(root),expected,'sources changed during finalization');
  const result={version:1,sources:expected,derived:hashes(read,DERIVED)};
  const target=path.join(root,FILE);fs.writeFileSync(target+'.tmp',JSON.stringify(result));fs.renameSync(target+'.tmp',target);
  return result;
}
function verify(root,{staged=false}={}){
  const read=reader(root,staged),present=coherent(read);
  if(!present)return null; // Tiny publication fixtures without catalog data have no lineage to validate.
  const t=read(FILE);if(t===null)throw Error('Publication version mismatch: finalization lineage missing');
  const record=JSON.parse(t);if(record.version!==1)throw Error('Publication lineage schema unsupported');
  same(hashes(read,SOURCES),record.sources,'source revision changed after finalization');
  same(hashes(read,DERIVED),record.derived,'summary revision changed after finalization');
  return record;
}
module.exports={SOURCES,DERIVED,FILE,snapshot,seal,verify,coherent};
