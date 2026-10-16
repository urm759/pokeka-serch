const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const stamp=r=>Math.max(0,...['observedAt','priceObservedAt','confirmedAt','lastConfirmedAt','fetchedAt','checkedAt','lastAttemptAt','lastSuccessAt','endedAt','startedAt','recordedAt','generatedAt','at'].map(k=>Date.parse(r?.[k])||0));
function combine(b,a,t,preferred='ours',where='') {
  if(equal(a,t)||equal(b,t))return a;
  if(equal(b,a))return t;
  if(Array.isArray(a)&&Array.isArray(t))return [...new Map([...a,...t].map(v=>[JSON.stringify(v),v])).values()];
  if(a&&t&&typeof a==='object'&&typeof t==='object') {
    const observation=stamp(a)&&stamp(t)&&stamp(a)!==stamp(t)&&where&&!/\/(?:sources|jobs|checkpoints)$/.test(where)&&!a.jobs&&!a.checkpoints;
    if(observation)return stamp(a)>stamp(t)?a:t;
    const out={};for(const k of new Set([...Object.keys(b||{}),...Object.keys(a),...Object.keys(t)])) {
      const v=combine(b?.[k],a[k],t[k],preferred,where+'/'+k);if(v!==undefined)out[k]=v;
    }return out;
  }
  return preferred==='ours'?a:t;
}
function mergeRows(b,a,t,key,preferred='theirs') {
  const maps=[b,a,t].map(rows=>{const m=new Map(rows.map(r=>[key(r),r]));assert.equal(m.size,rows.length,'duplicate source row');return m;});
  return [...new Set([...maps[1].keys(),...maps[2].keys()])].map(k=>combine(maps[0].get(k),maps[1].get(k),maps[2].get(k),preferred,'/row')).filter(r=>r!=null);
}
function retainKnownPriceTime(row,candidates) {
  if(Object.hasOwn(row,'priceObservedAt')||!row.identityKey||!(row.price>0))return row;
  const same=candidates.filter(r=>r?.identityKey===row.identityKey&&r.price===row.price&&typeof r.priceObservedAt==='string'
    &&r.priceObservedAt.includes('T')&&Number.isFinite(Date.parse(r.priceObservedAt)));
  if(!same.length)return row;
  return {...row,priceObservedAt:same.map(r=>r.priceObservedAt).sort((a,b)=>Date.parse(b)-Date.parse(a))[0]};
}
function run() {
  const git=args=>cp.execFileSync('git',args,{cwd:root,maxBuffer:100e6,encoding:'utf8'});
  const files=git(['diff','--name-only','--diff-filter=U']).trim().split(/\r?\n/).filter(Boolean);
  assert(files.every(f=>f.endsWith('.json')&&/^(?:data|work)\//.test(f)),'non-data conflict requires separate review');
  const incoming=git(['rev-parse','MERGE_HEAD']).trim();
  const directory=path.join(root,'work/expanded-daily-merge-stages',incoming);
  const read=(stage,f)=>JSON.parse(git(['show',`:${stage}:${f}`]));
  const committed=(ref,f)=>JSON.parse(git(['show',`${ref}:${f}`]));
  const summaries=[committed('HEAD','data/shop-buyback-summary.json'),committed('MERGE_HEAD','data/shop-buyback-summary.json')];
  const receipts=[committed('HEAD','data/psa10-observation-receipt.json'),committed('MERGE_HEAD','data/psa10-observation-receipt.json')];
  const newestSource=stamp(receipts[0])>stamp(receipts[1])?'ours':'theirs';
  const isOurs=(shop)=>(Date.parse(summaries[0].shops[shop]?.lastSuccess)||0)>=(Date.parse(summaries[1].shops[shop]?.lastSuccess)||0);
  const outputs=[];
  for(const f of files) {
    const rows=[1,2,3].map(stage=>{const text=git(['show',`:${stage}:${f}`]),target=path.join(directory,String(stage),f);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);return JSON.parse(text);});
    const [b,a,t]=rows;let value;
    if(f==='data/pokemon-cards.json') {
      const baseById=new Map(b.map(r=>[r.id,r])),byId=new Map(a.map(r=>[r.id,r])),incomingById=new Map(t.map(r=>[r.id,r]));
      // A new domestic-market receipt must not discard independently discovered shop URLs.
      value=[...new Set([...byId.keys(),...incomingById.keys()])].map(id=>retainKnownPriceTime(
        combine(baseById.get(id),byId.get(id),incomingById.get(id),newestSource,''),[byId.get(id),incomingById.get(id)]));
    }
    else if(f==='work/hareruya2_catalog.json') {
      value=mergeRows(b,a,t,r=>r.cardId||r.detailUrl);
      for(const r of [...a,...t])assert(stamp(value.find(v=>(v.cardId||v.detailUrl)===(r.cardId||r.detailUrl)))>=stamp(r),'individual confirmation must not regress');
    } else if(f==='data/hareruya2-stock-summary.json') {
      value={...t,cards:combine(b.cards,a.cards,t.cards,'theirs','/cards')};
    } else if(f==='work/hareruya2_stock_history.json') {
      const catalog=outputs.find(([name])=>name==='work/hareruya2_catalog.json')?.[1]||mergeRows(read(1,'work/hareruya2_catalog.json'),read(2,'work/hareruya2_catalog.json'),read(3,'work/hareruya2_catalog.json'),r=>r.cardId||r.detailUrl);
      const ca=read(2,'work/hareruya2_catalog.json'),ct=read(3,'work/hareruya2_catalog.json');
      const times=xs=>Object.fromEntries(xs.filter(r=>r.cardId).map(r=>[r.cardId,stamp(r)])),ta=times(ca),tt=times(ct);
      const dates=[...new Set([...a.dates,...t.dates])].sort(),stocks={};
      for(const id of new Set([...Object.keys(a.stocks),...Object.keys(t.stocks)]))stocks[id]=dates.map(d=>{const x=a.stocks[id]?.[a.dates.indexOf(d)],y=t.stocks[id]?.[t.dates.indexOf(d)];return x==null?y??null:y==null?x:(ta[id]||0)>=(tt[id]||0)?x:y;});
      value={...a,...t,dates,stocks};assert(catalog.length>=Math.max(ca.length,ct.length));
    } else if(f==='data/shop-buyback-summary.json') {
      const stores={};for(const shop of new Set([...Object.keys(a.shops),...Object.keys(t.shops)]))stores[shop]=isOurs(shop)?a.shops[shop]:t.shops[shop];
      const cards={};for(const id of new Set([...Object.keys(a.cards),...Object.keys(t.cards)])) {
        const chosen={};for(const shop of new Set([...Object.keys(a.cards[id]?.shops||{}),...Object.keys(t.cards[id]?.shops||{})]))chosen[shop]=(isOurs(shop)?a:t).cards[id]?.shops?.[shop]|| (isOurs(shop)?t:a).cards[id]?.shops?.[shop];
        cards[id]={...(newestSource==='ours'?a:t).cards[id],shops:chosen};
      }value={...t,shops:stores,cards};
    } else if(['work/shop_buyback_catalog.json','work/shop_buyback_unmatched.json'].includes(f)) {
      value={...t,shops:{}};for(const shop of new Set([...Object.keys(a.shops),...Object.keys(t.shops)]))value.shops[shop]=(isOurs(shop)?a:t).shops[shop]||(isOurs(shop)?t:a).shops[shop];
    } else if(f==='work/shop_buyback_history.json') {
      const dates=[...new Set([...a.dates,...t.dates])].sort(),shops={};
      for(const shop of new Set([...Object.keys(a.shops),...Object.keys(t.shops)])) {
        const left=a.shops[shop]||{},right=t.shops[shop]||{};shops[shop]={};
        for(const id of new Set([...Object.keys(left),...Object.keys(right)]))shops[shop][id]=dates.map(d=>{const x=left[id]?.[a.dates.indexOf(d)],y=right[id]?.[t.dates.indexOf(d)];return x==null?y??null:y==null?x:isOurs(shop)?x:y;});
      }value={...combine(b,a,t),dates,shops};
    } else if(f==='work/market_stability_history.json') {
      value={...t,dates:[...new Set([...a.dates,...t.dates])].sort(),cards:{}};
      for(const id of new Set([...Object.keys(a.cards),...Object.keys(t.cards)])) {
        const old=new Map((b.cards[id]||[]).map(r=>[r[0],r])),left=new Map((a.cards[id]||[]).map(r=>[r[0],r])),right=new Map((t.cards[id]||[]).map(r=>[r[0],r]));
        value.cards[id]=[...new Set([...left.keys(),...right.keys()])].sort().map(d=>{const x=left.get(d),y=right.get(d);return equal(x,y)||equal(y,old.get(d))?x:equal(x,old.get(d))?y:!x?y:!y?x:newestSource==='ours'?x:y;});
      }
    } else if(['data/pokemon-cards-meta.json','data/psa10-observation-receipt.json','work/daily-http-cache.json'].includes(f))value=newestSource==='ours'?a:t;
    else if(f==='work/psa10-trade-observations.json') {
      value={...t,cards:{}};
      for(const id of new Set([...Object.keys(a.cards||{}),...Object.keys(t.cards||{})]))value.cards[id]=require('./psa10_trade_statistics').dailyObservations([...(a.cards[id]||[]),...(t.cards[id]||[])]);
    }
    else if(f==='work/changed-card-ids.json')value=combine(b,a,t,newestSource);
    else if(f==='data/state-a-price-evidence.json')value=combine(b,a,t,'theirs','/evidence');
    else if(f.startsWith('work/')||['data/update-history.json','data/performance-history.json','data/search-profile-cycle-progress.json'].includes(f))value=combine(b,a,t,'theirs');
    else value=a; // Derived seeds only; all builders and hash checks must run before staging.
    outputs.push([f,value]);
  }
  // Every stage is archived and every row invariant checked before writing any resolution.
  for(const [f,value]of outputs)fs.writeFileSync(path.join(root,f),JSON.stringify(value));
  const result={at:new Date().toISOString(),local:git(['rev-parse','HEAD']).trim(),scheduled:git(['rev-parse','MERGE_HEAD']).trim(),files:files.length,backup:directory,networkRequests:0,requiresRebuild:true};
  fs.writeFileSync(path.join(root,'work/expanded-daily-merge.json'),JSON.stringify(result));console.log(JSON.stringify(result));
  return result;
}
if(require.main===module)run();
module.exports={combine,mergeRows,retainKnownPriceTime};
