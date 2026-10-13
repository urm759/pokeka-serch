const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {atomicWrite}=require('./acquisition_retry');
const root=path.join(__dirname,'..'),git=args=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:128e6});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const stamp=r=>Math.max(0,...['observedAt','fetchedAt','lastAttemptAt','confirmedAt','checkedAt','startedAt','endedAt','generatedAt','updatedAt','at'].map(k=>Date.parse(r?.[k])||0));
function latest(a,b,base){
  if(!a)return b;if(!b)return a;if(same(a,b))return a;
  if(base!==undefined){if(same(base,a))return b;if(same(base,b))return a;}
  const x=stamp(a),y=stamp(b);if(!x||!y||x===y)throw Error('Conflicting source observations without distinct timestamps');
  return x>y?a:b;
}
function byKey(a,b,key,base=[]){const original=new Map(base.map(r=>[key(r),r]));const rows=new Map(a.map(r=>[key(r),r]));for(const r of b){const k=key(r);rows.set(k,latest(rows.get(k),r,original.get(k)));}return [...rows.values()];}
function historyUnion(a,b){const m=new Map();for(const r of [...b,...a]){
  const key=r&&typeof r==='object'&&!Array.isArray(r)?r.startedAt||r.at||r.recordedAt||r.date||r.runId:null;
  const k=key==null?JSON.stringify(r):String(key),old=m.get(k);
  if(!old||stamp(r)>stamp(old)||stamp(r)===stamp(old))m.set(k,r);
}return [...m.values()];}
function seedMerge(base,a,b){
  if(same(a,b)||same(base,b))return a;if(same(base,a))return b;
  if(Array.isArray(a)&&Array.isArray(b))return historyUnion(a,b);
  if(a&&b&&typeof a==='object'&&typeof b==='object')return Object.fromEntries([...new Set([...Object.keys(a),...Object.keys(b)])].map(k=>[k,seedMerge(base?.[k],a[k],b[k])]));
  return a;
}
function run(){
  const files=git(['diff','--name-only','--diff-filter=U']).trim().split('\n').filter(Boolean);
  if(files.some(f=>!/^((data|work)\/[a-zA-Z0-9_./-]+\.json)$/.test(f)||f.includes('..')))throw Error('Unknown merge target');
  const snapshots=Object.fromEntries(files.map(f=>[f,[1,2,3].map(n=>JSON.parse(git(['show',`:${n}:${f}`])))]));
  const backup=path.join(root,'work/current-guide-merge-stages');fs.mkdirSync(backup,{recursive:true});
  for(const [f,rows]of Object.entries(snapshots)){
    fs.mkdirSync(path.dirname(path.join(backup,f)),{recursive:true});
    atomicWrite(path.join(backup,f),{base:rows[0],local:rows[1],scheduled:rows[2]},0);
  }
  const out=[],metrics=[];
  const shopSummary=snapshots['data/shop-buyback-summary.json'];
  for(const [file,[base,a,b]]of Object.entries(snapshots)){
    let merged;
    if(file==='work/hareruya2_catalog.json')merged=byKey(a,b,r=>r.detailUrl||r.productId||r.cardId,base);
    else if(file==='data/hareruya2-stock-summary.json'){
      merged={...a,cards:{...a.cards}};for(const [id,row]of Object.entries(b.cards||{}))merged.cards[id]=latest(merged.cards[id],row,base.cards?.[id]);
      merged.updatedAt=[a.updatedAt,b.updatedAt].sort().at(-1);
    }else if(file==='work/hareruya2_stock_history.json'){
      const dates=[...new Set([...a.dates,...b.dates])].sort(),stocks={};
      const newer=stamp(snapshots['work/candidate-shop-refresh.json'][1].sources.hareruya2)>stamp(snapshots['work/candidate-shop-refresh.json'][2].sources.hareruya2)?a:b;
      for(const id of new Set([...Object.keys(a.stocks),...Object.keys(b.stocks)]))stocks[id]=dates.map(day=>{
        const x=a.stocks[id]?.[a.dates.indexOf(day)],y=b.stocks[id]?.[b.dates.indexOf(day)];
        return x==null?y??null:y==null?x:newer===a?x:y;
      });merged={dates,stocks};
    }else if(file==='work/source-update-runs.json'){
      merged={...a,sources:{...a.sources}};for(const [id,row]of Object.entries(b.sources||{}))merged.sources[id]=latest(merged.sources[id],row,base.sources?.[id]);
    }else if(file==='work/priority-price-http-cache.json'){
      merged={...a};for(const [url,row]of Object.entries(b))merged[url]=latest(merged[url],row,base[url]);
    }else if(file==='work/priority-price-checkpoint.json'){
      merged=seedMerge(base,a,b);for(const source of Object.keys(merged.sources))for(const id of Object.keys(merged.sources[source].jobs||{}))
        merged.sources[source].jobs[id]=latest(a.sources?.[source]?.jobs?.[id],b.sources?.[source]?.jobs?.[id],base.sources?.[source]?.jobs?.[id]);
    }else if(file==='work/candidate-shop-refresh.json'){
      merged=seedMerge(base,a,b);for(const source of Object.keys(merged.sources)){
        merged.sources[source]=latest(a.sources[source],b.sources[source],base.sources?.[source]);
        const newer=merged.sources[source]===a.sources[source]?a:b;
        merged.checkpoints[source]={...newer.checkpoints[source],completedIds:[...new Set([...(a.checkpoints[source]?.completedIds||[]),...(b.checkpoints[source]?.completedIds||[])])]};
      }
    }else if(['data/shop-buyback-summary.json','work/shop_buyback_catalog.json','work/shop_buyback_unmatched.json'].includes(file)){
      merged=seedMerge(base,a,b);
      const shops=new Set([...Object.keys(shopSummary[1].shops),...Object.keys(shopSummary[2].shops)]);
      for(const shop of shops){const x=shopSummary[1].shops[shop],y=shopSummary[2].shops[shop];
        const selected=!x?b:!y?a:Date.parse(x.lastSuccess||x.fullListingConfirmedAt||'')>=Date.parse(y.lastSuccess||y.fullListingConfirmedAt||'')?a:b;
        if(file!=='data/shop-buyback-summary.json')merged.shops[shop]=selected.shops[shop]||[];
        else{merged.shops[shop]=selected.shops[shop];for(const id of Object.keys(merged.cards)){
          const row=selected.cards[id]?.shops?.[shop];merged.cards[id].shops ||= {};
          if(row)merged.cards[id].shops[shop]=row;else delete merged.cards[id].shops[shop];
        }}
      }
    }else merged=seedMerge(base,a,b);
    out.push([file,merged]);metrics.push({file,method:/catalog|checkpoint|http-cache|source-update-runs|stock-summary|buyback/.test(file)?'個別確認日時/取得元実成功時刻・履歴保持':'両原票保持後の再生成用seed'});
  }
  // Resolve every real-source observation before writing anything. Derived seeds must be rebuilt/tested before publication.
  for(const [file,data]of out)atomicWrite(path.join(root,file),data,0);
  atomicWrite(path.join(root,'data/current-guide-merge-audit.json'),{at:new Date().toISOString(),backup:'work/current-guide-merge-stages',metrics,
    status:'正常原票統合済み・全要約再生成/必須検証/公開照合待ち',acquisitionRequests:0},0);
  console.log(JSON.stringify({resolved:out.length,status:'rebuild-required',rawStageBackups:files.length}));
}
if(require.main===module)run();
module.exports={latest,byKey,seedMerge};
