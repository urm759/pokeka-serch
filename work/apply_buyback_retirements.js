const fs=require('node:fs'),path=require('node:path');
const {atomicWrite}=require('./acquisition_retry');
function exclude(summary, retired) {
  const next=structuredClone(summary);
  for(const id of retired)delete next.shops?.[id];
  for(const card of Object.values(next.cards||{})) {
    for(const id of retired)delete card.shops?.[id];
    const rows=Object.values(card.shops||{});
    for(const n of [7,30,90]) {
      card['total'+n]=rows.reduce((s,r)=>s+Number(r['c'+n]||0),0);
      card['shop'+n]=rows.filter(r=>r['c'+n]>0).length;
      const prices=rows.map(r=>r['avg'+n]).filter(v=>typeof v==='number'&&v>0);
      card['avg'+n]=prices.length?Math.round(prices.reduce((a,b)=>a+b,0)/prices.length):null;
    }
    card.currentShops=rows.filter(r=>r.price>0&&r.listingActive!==false).length;
    const observed=next.dates?.length||0, rate=card.total30/(Math.min(30,observed)*Math.max(1,rows.length));
    card.demand=observed<7?'買取掲載数：蓄積中':rate>=0.7?'買取掲載数：多い':rate>=0.3?'買取掲載数：普通':'買取掲載数：少ない';
  }
  return next;
}
function apply(root=path.join(__dirname,'..')) {
  const policy=JSON.parse(fs.readFileSync(path.join(root,'work/buyback-source-permissions.json'),'utf8'));
  const retired=Object.entries(policy.sources||{}).filter(([,v])=>v.status==='retired').map(([id])=>id);
  const file=path.join(root,'data/shop-buyback-summary.json'),original=fs.readFileSync(file,'utf8'),source=JSON.parse(original);
  const affected=retired.filter(id=>source.shops?.[id]||Object.values(source.cards||{}).some(c=>c.shops?.[id]));
  if(!affected.length)return {retired,changed:false};
  const archiveFile=path.join(root,'work/.private/retired-buyback-summary-snapshots.json');
  fs.mkdirSync(path.dirname(archiveFile),{recursive:true});
  const archive=fs.existsSync(archiveFile)?JSON.parse(fs.readFileSync(archiveFile,'utf8')):{version:1,records:{}};
  const hash=require('node:crypto').createHash('sha256').update(original).digest('hex');
  archive.records[hash]||={archivedAt:new Date().toISOString(),retired:affected,source};atomicWrite(archiveFile,archive,0);
  atomicWrite(file,exclude(source,retired),0);return {retired,changed:true};
}
module.exports={exclude,apply};
if(require.main===module)console.log(JSON.stringify(apply()));
