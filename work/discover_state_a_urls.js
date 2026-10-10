const fs=require('node:fs');
const path=require('node:path');
const shop=require('./update_hareruya2_stock.js');
const retry=require('./acquisition_retry.js');
const crypto=require('node:crypto');
const {needs}=require('./completion_routes.js');
const root=path.join(__dirname,'..');
const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));}catch{return fallback;}};
const write=(file,value)=>{const target=path.join(root,file);fs.writeFileSync(target+'.tmp',JSON.stringify(value));fs.renameSync(target+'.tmp',target);};
function strictMatch(card,product) {
  if (/英語|海外|韓国|中国語|中文版|English|Korean|Chinese/i.test(card.name||'')) return false;
  if (shop.stateFromTitle(product.title)!=='A' || /PSA|BGS|CGC|TAG|ACE|鑑定|英語|海外|韓国|未開封|枚セット/i.test(product.title||'')) return false;
  const a=shop.extractCardSignature(card),b=shop.extractProductSignature(product);
  const number=s=>String(s).replace(/\/[A-Za-z0-9-]+-P$/i,'').split('/').map(n=>/^\d+$/.test(n)?String(Number(n)):n).join('/');
  const rarity=s=>/プロモ|PROMO/i.test(s)?'PROMO':(String(s).match(/(?:\b|[\{【])(MUR|BWR|SSR|CSR|CHR|SAR|UR|HR|SR|RRR|RR|AR|PR|P|H|C|U|R)(?:\b|[\}】])/i)||[])[1]?.toUpperCase();
  return Boolean(a.base && b.base && a.setCode && a.setCode===b.setCode && number(a.cardNo)===number(b.cardNo)
    && a.finish===b.finish && rarity(card.name.split('[')[0]) && rarity(card.name.split('[')[0])===rarity(product.title)
    && shop.productMatchesCard(card,product));
}
function diagnose(card,products) {
  const signature=shop.extractCardSignature(card);
  const number=s=>String(s||'').split('/').map(n=>/^\d+$/.test(n)?String(Number(n)):n.toLowerCase()).join('/');
  const near=products.filter(p=>number(shop.extractProductSignature(p).cardNo)===number(signature.cardNo));
  const reasons={};
  if(!signature.setCode||!signature.cardNo)reasons['国内識別情報不足']=1;
  if(!near.length)reasons['同一番号の掲載未確認']=1;
  const samples=near.slice(0,3).map(product=>{
    const p=shop.extractProductSignature(product),rejected=[];
    if(signature.setCode!==p.setCode)rejected.push('セットコード不一致');
    if(signature.finish!==p.finish)rejected.push(signature.finish==='first'&&!p.finish?'初版表記未確認':'仕様・ミラー不一致');
    if(shop.stateFromTitle(product.title)!=='A')rejected.push('状態A以外');
    if(/PSA|BGS|CGC|TAG|ACE|鑑定|海外|韓国|英語|未開封|枚セット/i.test(product.title))rejected.push('対象外仕様');
    if(!shop.productMatchesCard(card,product)&&!rejected.length)rejected.push('名称一致未確認');
    if(!strictMatch(card,product)&&!rejected.length)rejected.push('レアリティ・仕様確定待ち');
    rejected.forEach(reason=>reasons[reason]=(reasons[reason]||0)+1);
    return {title:product.title,url:product.handle?`https://www.hareruya2.com/products/${encodeURIComponent(product.handle)}`:null,rejected};
  });
  return {signature,listedProducts:products.length,sameNumberCandidates:near.length,reasons,samples,
    note:'番号だけで自動採用しない。掲載未確認は商品不存在を意味しない'};
}
function recordFailure(state,handle,error,now=Date.now()) {
  state.collectionRetries ||= {};
  const policy=retry.classify({error:error.message});
  const old=policy.scope==='source'?state.sourceRetry:state.collectionRetries[handle];
  const result=retry.failure(old,{error:error.message},now);
  if(policy.scope==='source')state.sourceRetry=result;
  else state.collectionRetries[handle]=result;
  return result;
}
function retryPolicy(card,item,now=Date.now()) {
  const release=Date.parse(item?.rd || card.releaseDate || '');
  const ageDays=Number.isFinite(release) ? (now-release)/86400000 : null;
  const frequent=(item?.r || []).some(reason=>/買取表30日(\d+)/.test(reason) && Number(reason.match(/買取表30日(\d+)/)[1])>=7);
  if(ageDays!=null && ageDays>=0 && ageDays<=90)return {days:1,reason:'発売90日以内'};
  if(item?.n || frequent)return {days:3,reason:item?.n?'サイト新規追加・探索優先':'買取掲載頻度が高い'};
  if(item?.m?.length===1 || (ageDays!=null && ageDays>=0 && ageDays<=730))return {days:7,reason:'あと1項目で分析可能／発売2年以内'};
  return {days:30,reason:'通常探索枠・存在未確認'};
}
function sourceFingerprint(products) {
  return crypto.createHash('sha256').update(JSON.stringify(products.map(p=>[p.id || p.handle,p.title]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))).digest('hex');
}
function matcherRevision(card,rules=read('data/source-matching-rules.json',{})) {
  const signature=shop.extractCardSignature(card);
  if(/-p$/.test(signature.setCode))return 'strict-promo-prefix-v3';
  return rules.setRevisions?.[String(signature.setCode).toUpperCase()] || rules.defaultRevision || 'strict-state-a-v2';
}
function canRecheck(card,item,state,now=Date.now()) {
  const previous=state.cards?.[card.id];
  if(previous?.held)return false;
  if(!previous)return true;
  if((previous.matcherRevision || 'strict-state-a-v2')!==matcherRevision(card))return true;
  const currentHash=state.cache?.[previous.collection]?.fingerprint;
  if(previous.sourceFingerprint && currentHash && previous.sourceFingerprint!==currentHash)return true;
  if(previous.matcherVersion!==2)return true;
  const checked=Date.parse(previous.checkedAt);
  const adaptive=Number.isFinite(checked)?checked+retryPolicy(card,item,now).days*86400000:Infinity;
  const stored=Date.parse(previous.nextRetryAt);
  return now>=Math.min(adaptive,Number.isFinite(stored)?stored:Infinity);
}
function select(cards,queue,state,now=Date.now(),limit=100) {
  const eligible=cards.filter(card=>!card.hareruya2Url && queue.cards?.[card.id] && needs(queue.cards[card.id],'shopStateA')
    && canRecheck(card,queue.cards[card.id],state,now));
  const ordered=eligible.sort((a,b)=>Number(queue.cards?.[b.id]?.p||0)-Number(queue.cards?.[a.id]?.p||0));
  const n=Math.max(1,Math.floor(limit*.25)),normal=[...eligible].sort((a,b)=>Date.parse(state.cards?.[a.id]?.lastAttemptAt||'1970-01-01')-Date.parse(state.cards?.[b.id]?.lastAttemptAt||'1970-01-01'));
  const priority=ordered.slice(0,limit-n),chosen=new Set(priority.map(c=>c.id));
  return [...priority,...normal.filter(c=>!chosen.has(c.id)).slice(0,n)];
}
async function run() {
  const start=Date.now(),budget=Number(process.env.URL_DISCOVERY_TIME_MS||90000);
  const file='work/state-a-url-discovery-checkpoint.json',state=read(file,{cards:{},cache:{}});
  const cards=read('data/pokemon-cards.json',[]),queue=read('work/card-completion-queue.json',{});
  const audit={startedAt:new Date(start).toISOString(),attempted:0,newLinked:0,ambiguous:0,noCandidate:0,httpRequests:0,cacheHits:0,llmCalls:0,codexCalls:0,records:[]};
  if (!retry.eligible(state.sourceRetry,start)) {audit.stopReason=state.sourceRetry.error||state.sourceRetry.reason||'取得元の再試行・正規アクセス確認待ち';}
  else try {
    const candidates=select(cards,queue,state,start,Number(process.env.URL_DISCOVERY_CARD_LIMIT||100));
    const cache=state.collections;
    const collectionOptions={deadlineAt:start+budget,intervalMs:1200,onRequest:()=>audit.httpRequests++};
    const recentDiscovery=candidates.some(card=>retryPolicy(card,queue.cards[card.id],start).days<=3);
    const collections=cache && start-Date.parse(cache.fetchedAt)<(recentDiscovery?1:7)*86400000 ? (audit.cacheHits++,cache.rows) : await shop.fetchAllCollections(collectionOptions);
    if (!collections.length) throw new Error('形式変更または正規一覧0件・過去データ保持');
    state.sourceRetry=null;
    state.collections={rows:collections,fetchedAt:cache && collections===cache.rows?cache.fetchedAt:new Date().toISOString()};
    const groups=new Map();
    for(const card of candidates) {
      let group=shop.findCollectionForPack(shop.extractCardSignature(card).pack,collections);
      if(!group?.handle) {
        const cached=Object.entries(state.cache||{}).filter(([,value])=>value.rows?.some(p=>strictMatch(card,p)));
        if(cached.length===1)group=collections.find(c=>c.handle===cached[0][0])||{handle:cached[0][0]};
      }
      if(!group?.handle) {
        const record={id:card.id,status:'collection-unmatched',checkedAt:new Date().toISOString(),
          reason:'正規セット一覧と収録情報が一致せず・商品取得未実行',url:null};
        const policy=retryPolicy(card,queue.cards[card.id],start);
        state.cards[card.id]={...record,matcherVersion:2,matcherRevision:matcherRevision(card),recheckPolicy:policy,nextRetryAt:new Date(start+policy.days*86400000).toISOString()};
        audit.records.push(record);continue;
      }
      if(!groups.has(group.handle))groups.set(group.handle,[]);
      groups.get(group.handle).push(card);
    }
    audit.queued=candidates.length;audit.collectionGroups=groups.size;
    for(const [handle,targets] of groups) {
      if(Date.now()-start>budget-30000){audit.stopReason='時間予算で保存・次回継続';break;}
      if(!retry.eligible(state.collectionRetries?.[handle])) {
        audit.retryWaiting=(audit.retryWaiting||0)+targets.length;
        continue;
      }
      let saved=state.cache[handle],products;
      try {
        const previousHash=saved ? saved.fingerprint || sourceFingerprint(saved.rows) : null;
        const ttlDays=Math.min(7,...targets.map(card=>retryPolicy(card,queue.cards[card.id]).days));
        if(saved && Date.now()-Date.parse(saved.fetchedAt)<ttlDays*86400000){products=saved.rows;audit.cacheHits++;}
        else {await new Promise(r=>setTimeout(r,1200));products=await shop.fetchCollectionProducts(handle,collectionOptions);saved={rows:products,fetchedAt:new Date().toISOString()};state.cache[handle]=saved;}
        saved.fingerprint=sourceFingerprint(products);
        if(previousHash && previousHash!==saved.fingerprint) {
          const selected=new Set(targets.map(card=>card.id));
          for(const card of cards)if(!selected.has(card.id) && !card.hareruya2Url && !state.cards?.[card.id]?.held
            && state.cards?.[card.id]?.collection===handle && queue.cards?.[card.id] && needs(queue.cards[card.id],'shopStateA')) {
            if(audit.attempted+targets.length>=Number(process.env.URL_DISCOVERY_CARD_LIMIT||100))break;
            targets.push(card);selected.add(card.id);audit.listingChangeRechecks=(audit.listingChangeRechecks||0)+1;
          }
        }
        for(const card of targets) {
          audit.attempted++;
          const matches=products.filter(p=>strictMatch(card,p));
          // Different URLs for the same card are not automatically resolved when the identity is ambiguous.
          const specs=new Set(matches.map(p=>shop.extractProductSignature(p).base));
          const match=specs.size===1?shop.chooseProduct(matches):null;
          const record={id:card.id,collection:handle,checkedAt:new Date().toISOString(),observedAt:saved.fetchedAt,
            status:match?'linked':matches.length?'ambiguous':'no-candidate',url:match?`https://www.hareruya2.com/products/${encodeURIComponent(match.handle)}`:null,
            diagnostic:match?null:diagnose(card,products)};
          if(match){card.hareruya2Url=record.url;audit.newLinked++;}
          else if(matches.length)audit.ambiguous++;else audit.noCandidate++;
          const policy=retryPolicy(card,queue.cards[card.id]);
          state.cards[card.id]={...record,matcherVersion:2,matcherRevision:matcherRevision(card),sourceFingerprint:saved.fingerprint,recheckPolicy:policy,
            nextRetryAt:new Date(Date.now()+policy.days*86400000).toISOString(),held:record.status==='ambiguous'};
          audit.records.push(record);
        }
        if(state.collectionRetries)delete state.collectionRetries[handle];
        write('data/pokemon-cards.json',cards);state.lastRun=audit;write(file,state);
      } catch(error) {
        const failure=recordFailure(state,handle,error);
        audit.failures ||= [];audit.failures.push({collection:handle,...failure});
        write(file,state);
        if(failure.scope==='source'){audit.stopReason=error.message;break;}
      }
    }
  } catch(error) {state.sourceRetry=retry.failure(state.sourceRetry,{error:error.message});audit.stopReason=error.message;}
  audit.endedAt=new Date().toISOString();audit.durationMs=Date.now()-start;
  audit.status=audit.stopReason || audit.failures?.length || audit.retryWaiting?'部分停止':audit.attempted?'部分探索':'対象なし・未完了';
  state.lastRun=audit;write(file,state);write('data/state-a-url-discovery.json',audit);
  console.log(JSON.stringify(audit));return audit;
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={strictMatch,diagnose,select,recordFailure,run,retryPolicy,canRecheck,sourceFingerprint,matcherRevision};
