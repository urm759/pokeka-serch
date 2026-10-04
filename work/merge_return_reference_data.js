const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),local='a9c5e7d',remote='159f3fc',base='4437445';
const read=(ref,f)=>JSON.parse(execFileSync('git',['show',`${ref}:${f}`],{cwd:root,maxBuffer:100e6}));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),log=[];
const stamp=x=>Math.max(0,...['observedAt','priceFetchedAt','lastAttemptAt','startedAt','checkedAt','updatedAt','generatedAt','at'].map(k=>Date.parse(x?.[k])||0));
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
function merge(b,a,c,p){
 if(equal(a,c))return a;if(equal(a,b))return c;if(equal(c,b))return a;
 if(object(a)&&object(c)){
   const out={};for(const k of new Set([...Object.keys(b||{}),...Object.keys(a),...Object.keys(c)])){
    const v=merge(b?.[k],a[k],c[k],`${p}.${k}`);if(v!==undefined)out[k]=v;
   }return out;
 }
 if(Array.isArray(a)&&Array.isArray(c)){
  if(a.every(x=>typeof x==='string')&&c.every(x=>typeof x==='string'))return [...new Set([...c,...a])];
  const key=x=>x?.cardId||x?.id||x?.startedAt||x?.generatedAt||x?.date;
  if([...a,...c].every(x=>key(x))){const bm=new Map((b||[]).map(x=>[key(x),x])),am=new Map(a.map(x=>[key(x),x])),cm=new Map(c.map(x=>[key(x),x]));
   return [...new Set([...cm.keys(),...am.keys()])].map(k=>merge(bm.get(k),am.get(k),cm.get(k),`${p}[${k}]`));
  }
  if(a.length===c.length&&a.every(x=>x==null||typeof x==='number')&&c.every(x=>x==null||typeof x==='number'))return a.map((x,i)=>merge(b?.[i],x,c[i],`${p}[${i}]`));
  throw new Error(`Unclassified array conflict ${p}`);
 }
 if(a==null&&c!=null)return c;if(c==null&&a!=null)return a;
 log.push(p);return c;
}
const conflicts=execFileSync('git',['diff','--name-only','--diff-filter=U'],{cwd:root,encoding:'utf8'}).trim().split('\n');
for(const f of conflicts){
 const a=read(local,f),c=read(remote,f),b=read(base,f);
 // Public summaries are rebuilt below; current main remains their provisional input.
 let value=(f.startsWith('data/')&&f!=='data/hareruya2-stock-summary.json')||f==='work/card-completion-queue.json'?c:merge(b,a,c,f);
 if(f==='data/hareruya2-stock-summary.json')value.updatedAt=[a.updatedAt,c.updatedAt].filter(Boolean).sort().at(-1);
 if(f==='work/source-update-runs.json')for(const id of Object.keys(value.sources))value.sources[id]=stamp(a.sources?.[id])>stamp(c.sources?.[id])?a.sources[id]:c.sources[id];
 if(f==='work/candidate-shop-refresh.json')for(const id of Object.keys(value.sources))value.sources[id]=stamp(a.sources?.[id])>stamp(c.sources?.[id])?a.sources[id]:c.sources[id];
 fs.writeFileSync(path.join(root,f),JSON.stringify(value));
}
fs.mkdirSync(path.join(root,'work/logs'),{recursive:true});
fs.writeFileSync(path.join(root,'work/logs/return-reference-merge.json'),JSON.stringify({base,local,remote,conflicts,fallbackFields:log}));
console.log(JSON.stringify({conflicts:conflicts.length,fieldConflicts:log.length,examples:log.slice(0,20)}));
