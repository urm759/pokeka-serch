const fs=require('node:fs'),path=require('node:path');
const {atomicWrite}=require('./acquisition_retry');
const identity=require('./quarantine_shop_identity');
function reconcileLinks(cards,catalogs,{now=Date.now(),holds={}}={}){
  const updated=cards.map(c=>({...c})),links=[],owners=new Map();
  for(const card of updated)for(const source of Object.keys(catalogs))if(card[source+'Url']){
    const key=source+'|'+card[source+'Url'];owners.set(key,owners.has(key)?null:card.id);
  }
  const indexed={},claims=new Map();
  for(const [source,rows]of Object.entries(catalogs)){
    indexed[source]=new Map();
    for(const row of rows){
      const list=indexed[source].get(row.cardId)||[];list.push(row);indexed[source].set(row.cardId,list);
      const at=Date.parse(row.observedAt||'');
      if(row.identityVerified===true&&identity.identityUsable(row)&&!row.priceQuarantined&&row.state==='A'
        &&Number.isFinite(at)&&at<=now&&now-at<=48*3600000){
        const key=source+'|'+row.detailUrl,ids=claims.get(key)||new Set();ids.add(row.cardId);claims.set(key,ids);
      }
    }
  }
  for(const source of Object.keys(catalogs))for(const card of updated){
    if(card[source+'Url']||card.identityReviewRequired||card.manualReview)continue;
    const rows=indexed[source].get(card.id)||[],eligible=rows.filter(r=>{
      const at=Date.parse(r.observedAt||'');let url;
      try{url=new URL(r.detailUrl);}catch{return false;}
      return url.protocol==='https:'&&url.hostname===({hareruya2:'www.hareruya2.com',torecacamp:'torecacamp-pokemon.com'}[source])
        &&url.pathname.startsWith('/products/')&&r.identityVerified===true&&identity.identityUsable(r)&&!r.priceQuarantined
        &&r.state==='A'&&r.price>0&&Number.isFinite(at)&&at<=now&&now-at<=48*3600000
        &&holds[source]?.[card.id]?.url!==r.detailUrl&&!identity.reason(card,r.title||r.name)
        &&require('./refresh_candidate_shops').exactIdentity(card,{title:r.title||r.name});
    });
    const urls=[...new Set(eligible.map(r=>r.detailUrl))];
    if(urls.length!==1||owners.has(source+'|'+urls[0])||claims.get(source+'|'+urls[0])?.size!==1)continue;
    const row=eligible.find(r=>r.detailUrl===urls[0]);
    card[source+'Url']=row.detailUrl;owners.set(source+'|'+row.detailUrl,card.id);
    links.push({id:card.id,source,url:row.detailUrl,observedAt:row.observedAt});
  }
  return {cards:updated,links};
}
function reconcileSavedLinks(root=path.join(__dirname,'..')){
  const read=file=>JSON.parse(fs.readFileSync(path.join(root,file)));
  const guard=read('work/candidate-shop-refresh.json').checkpoints||{};
  const result=reconcileLinks(read('data/pokemon-cards.json'),Object.fromEntries(['hareruya2','torecacamp'].map(s=>[s,read(`work/${s}_catalog.json`)])),
    {holds:Object.fromEntries(Object.entries(guard).map(([s,v])=>[s,v.manualWait||{}]))});
  if(result.links.length)atomicWrite(path.join(root,'data/pokemon-cards.json'),result.cards,0);
  const report={at:new Date().toISOString(),links:result.links,acquisitionRequests:0,reason:'正常な保存原票の商品URL接続漏れのみ。価格/確認日時/保留は変更しない'};
  atomicWrite(path.join(root,'work/saved-shop-link-reconciliation.json'),report,0);return report;
}
function mergeRows(current,saved,cards,source,now=Date.now()) {
  const rows=current.map(r=>({...r})),changes=[],rejected=[];
  for(const incoming of saved){
    const card=cards.get(incoming.cardId),at=Date.parse(incoming.observedAt||'');
    const matches=rows.map((r,i)=>({r,i})).filter(({r})=>r.cardId===incoming.cardId);
    const newest=Math.max(-Infinity,...matches.map(({r})=>Date.parse(r.observedAt||'')||-Infinity));
    if(at<=newest)continue;
    const title=incoming.title||incoming.name||'';
    const reference=incoming.referenceOnly===true&&incoming.rawCondition==='sealed-single';
    let sourceUrl=false;
    try{const url=new URL(incoming.detailUrl);sourceUrl=url.protocol==='https:'
      &&url.hostname===({hareruya2:'www.hareruya2.com',torecacamp:'torecacamp-pokemon.com'}[source])
      &&url.pathname.startsWith('/products/');}catch{}
    const verified=card&&incoming.identityVerified===true&&!incoming.cardMismatchSuspected&&!incoming.priceQuarantined
      && sourceUrl&&!rows.some(r=>r.detailUrl===incoming.detailUrl&&r.cardId!==incoming.cardId)
      && Number.isFinite(at)&&at<=now&&incoming.price>0
      &&!identity.reason(card,title)
      &&(reference?require('./raw_condition_reference').sameIssue(card,title):
        incoming.state==='A'&&require('./refresh_candidate_shops').exactIdentity(card,{title}));
    if(!verified||matches.some(({r})=>r.cardMismatchSuspected||r.priceQuarantined)){
      rejected.push({id:incoming.cardId,reason:'取得原票の仕様/状態/日時不足または現行保留。自動解除しない'});continue;
    }
    if(matches.length>1)throw Error('Ambiguous saved shop row identity: '+incoming.cardId);
    const previous=matches[0]?.r;
    if(previous?.referenceOnly&&!reference)throw Error('Saved condition transition requires review');
    if(matches.length)rows[matches[0].i]={...incoming};else rows.push({...incoming});
    changes.push({id:incoming.cardId,source,url:incoming.detailUrl,before:previous||null,after:incoming,
      type:reference?'reference-only':previous?'confirmed-price-recovery':'new-shop-price'});
  }
  return {rows,changes,rejected};
}
function run(folder,root=path.join(__dirname,'..')){
  folder=path.resolve(folder);
  if(!folder.startsWith(path.resolve(root,'work')+path.sep+'recovery-'))throw Error('Explicit workspace recovery directory required');
  const manifest=require('./audit_saved_domestic_recovery').verify(folder);
  const cards=new Map(JSON.parse(fs.readFileSync(path.join(root,'data/pokemon-cards.json'))).map(c=>[c.id,c]));
  const pending=[];
  for(const source of ['hareruya2','torecacamp']){
    const file=`work/${source}_catalog.json`;
    if(!manifest.files.some(r=>r.file===file))continue;
    const result=mergeRows(JSON.parse(fs.readFileSync(path.join(root,file))),JSON.parse(fs.readFileSync(path.join(folder,file))),cards,source);
    pending.push({file,...result});
  }
  for(const item of pending)if(item.changes.length)atomicWrite(path.join(root,item.file),item.rows,0);
  project(root,pending.flatMap(item=>item.changes));
  for(const item of pending)for(const change of item.changes)if(change.type==='reference-only')
    identity.recordReference(root,change.source,{...change.after},cards.get(change.id));
  const report={version:1,runId:manifest.workflowRunId,verifiedFiles:manifest.files.length,checkedAt:new Date().toISOString(),
    sources:pending.map(({file,changes,rejected})=>({file,changes,rejected})),newHttpRequests:0,
    checkpointPolicy:'現行の新しい巡回位置は戻さず、個別実測日時が新しい正常原票のみ回収',
    publication:'原票保存済み・要約再生成/必須検証/公開照合待ち'};
  atomicWrite(path.join(root,'work/saved-shop-recovery-latest.json'),report,0);return report;
}
function project(root,changes){
  const pending=[];
  for(const source of ['hareruya2','torecacamp']){
    const file=path.join(root,`data/${source}-stock-summary.json`),summary=JSON.parse(fs.readFileSync(file));
    for(const change of changes.filter(r=>r.source===source&&r.type!=='reference-only')){
      const row=change.after,old=summary.cards?.[change.id];
      const current=JSON.parse(fs.readFileSync(path.join(root,`work/${source}_catalog.json`))).find(r=>r.cardId===change.id);
      if(current?.observedAt!==row.observedAt||current.detailUrl!==row.detailUrl)throw Error('Recovered projection no longer matches saved source');
      if(Date.parse(old?.observedAt||'')>Date.parse(row.observedAt))continue;
      summary.cards||={};summary.cards[change.id]={...old,[source+'Price']:row.price,stock:row.stock,available:row.available,
        detailUrl:row.detailUrl,observedAt:row.observedAt,updatedAt:row.observedAt,priceObservedAt:row.observedAt,inventoryObservedAt:row.observedAt,
        conditionAccepted:true,identityVerified:true,identityVerifiedAt:row.identityVerifiedAt,cardMismatchSuspected:false,matchStatus:'verified',identityHoldReason:null};
    }
    pending.push([file,summary]);
  }
  for(const [file,value]of pending)atomicWrite(file,value,0);
}
if(require.main===module)console.log(JSON.stringify(process.argv.includes('--reconcile-links')?reconcileSavedLinks():run(process.argv[2])));
module.exports={mergeRows,run,project,reconcileLinks,reconcileSavedLinks};
