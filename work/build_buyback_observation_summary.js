const fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..'),periods=[7,30,75,200];
const day=at=>Number.isFinite(Date.parse(at))?new Date(Date.parse(at)+9*3600000).toISOString().slice(0,10):null;
// Saved titles, not cached cardIds, authorize rematching. Keep every full print
// and explicit specification until uniqueness has been checked across the catalogue.
function savedPrintEvidence(item) {
  const identity=require('./card_identity'),norm=identity.normalizeToken;
  const title=identity.normalizeWidth(item.name),declared=identity.normalizeWidth(item.number);
  const numbers=text=>{
    const result=[...text.matchAll(/(?<![\d/])(\d{1,3})\s*\/\s*(\d{1,3}|(?:XY|SM|SV|BW|S)-P)(?![\dA-Z/-])/ig)]
      .map(m=>`${Number(m[1])}/${/^\d+$/.test(m[2])?Number(m[2]):m[2].toUpperCase()}`);
    for(const m of text.matchAll(/(?:^|\[)\s*((?:XY|SM|SV|BW|S)-P)\s+(\d{1,3})(?=\s*\]|$)/ig))result.push(`${Number(m[2])}/${m[1].toUpperCase()}`);
    return result;
  };
  const declaredPrints=numbers(declared),prints=[...new Set([...numbers(title),...declaredPrints])],serial=prints[0];
  const promo=serial?.match(/\/((?:XY|SM|SV|BW|S)-P)$/)?.[1];
  const setNorm=value=>{
    const set=norm(value);
    // [SV 062/SV-P] and [SV-P 062] declare the same promo series.
    // Older catalogue identity parsing stored the full promo print as setCode.
    // Accept that representation only when it is the very same complete print.
    return promo && (set===norm(promo).slice(0,-1) || set.replace(/^0+(?=\d)/,'')===norm(serial))?norm(promo):set;
  };
  const sets=[...new Set([item.setCode,...[...`${title} ${declared}`.matchAll(/\[\s*((?:SV|SM|XY|BW|S|M)[a-z0-9+-]*)(?=\s|\])/ig)].map(m=>m[1]),promo].filter(Boolean).map(setNorm))];
  const rarities=[...new Set([identity.extractRarity(title.replace(/[()]/g,' ')),identity.extractRarity('',item.rarity)].filter(Boolean)
    .map(r=>promo && /^(PROMO|P|PR)$/.test(r)?'PROMO':r))],rarity=rarities[0]||'';
  const finish=value=>{
    const text=identity.normalizeWidth(value);
    if(/メタルカード|^メタル$|\bmetal\b/i.test(text))return 'metal';
    if(/イベントオーガナイザー/i.test(text))return 'event-organizer';
    const variant=identity.extractVariant(text);
    return variant==='promo'?'':norm(variant).toLowerCase();
  };
  const finishes=[finish(title),...[item.variant,item.finish].filter(Boolean).map(v=>/^(promo|プロモ|sa)$/i.test(v)?'':finish(v)||(/^(base|normal|regular|通常)$/i.test(v)?'base':norm(v).toLowerCase()))];
  const explicitFinishes=[...new Set(finishes.filter(Boolean))];
  return {title,serial,promo,set:sets[0],rarity,finish:explicitFinishes[0]==='base'?'':explicitFinishes[0]||'',
    valid:prints.length===1 && (!declared || declaredPrints.length>0) && sets.length<=1 && rarities.length<=1 && explicitFinishes.length<=1,
    japanese:(!item.language || item.language==='ja') && identity.extractLanguage(title)==='ja'};
}
function resolveSavedItem(item,cards,byNumber) {
  const {resolve:resolver,number}=require('./cardshop151');
  const identity=require('./card_identity'),proof=savedPrintEvidence(item);
  const held=reason=>({status:'確認待ち',reason});
  if(!proof.valid || !proof.japanese)return held('原票の番号・セット・仕様・日本語の証拠不一致');
  if(byNumber)cards=byNumber.get(proof.serial)||[];
  cards=cards.filter(c=>{
    const candidate=savedPrintEvidence({name:c.name,number:c.model,setCode:c.setCode,rarity:c.rarity,variant:c.variant,finish:c.finish,language:c.language});
    return candidate.valid && candidate.japanese && c.language==='ja' && !c.identityReviewRequired
      && candidate.serial===proof.serial && (!proof.set || candidate.set===proof.set)
      && (!proof.rarity || proof.rarity===candidate.rarity || proof.promo && /^(PROMO|P|PR)$/.test(proof.rarity) && !candidate.rarity)
      && (!proof.finish || proof.finish===candidate.finish);
  });
  let cleanName=proof.title.replace(/\s+\d{1,3}\s*\/\s*(?:\d{1,3}|(?:XY|SM|SV|BW|S)-P)\b/ig,'');
  // An annotation may be omitted from the name only when the actual catalogue
  // label proves it. Never erase finish, artwork or language annotations here.
  for(const match of cleanName.split('[')[0].matchAll(/\(([^()]+)\)/g)) {
    const annotation=match[1],token=identity.normalizeToken(annotation);
    if(!token || /\b(?:SA|SRC)\b|ミラー|仕様|初版|エラー|未開封|英語|韓国|中国|サイン|メタル|metal|mirror|1st|1ed/i.test(annotation))continue;
    const supported=cards.filter(c=>identity.normalizeToken(c.name).includes(token));
    if(supported.length){cards=supported;cleanName=cleanName.replace(match[0],' ');}
  }
  if(proof.promo) {
    const promoName=value=>{
      const [head,...tail]=value.split('[');
      // Strip a standalone rarity first: 「: プロモ P」 otherwise leaves
      // the display label in the comparison name. Full print/spec guards above remain.
      return head.replace(/\b(?:PROMO|PR|P)\b/ig,'').replace(/:\s*[^:]*プロモ\s*$/,'').replace(/プロモ\s*$/,'').replace(/[:\s]+$/,'').trim()+(tail.length?' ['+tail.join('['):'');
    };
    cleanName=promoName(cleanName);
    cards=cards.map(c=>({...c,name:promoName(identity.normalizeWidth(c.name))}));
  }
  const row={type:'PSA10',genre:'ポケモンカード',name:cleanName,listNo:proof.serial};
  const finishSafe=matched=>{
    const card=cards.find(c=>c.id===matched.cardId);
    if(card && savedPrintEvidence({name:card.name,number:card.model,variant:card.variant,finish:card.finish}).finish!==proof.finish)return held('原票の仕上げ仕様の証拠不足');
    return {...matched,evidence:{...matched.evidence,name:item.name,normalizedName:matched.evidence?.name,
      sourceSetExplicit:!!proof.set,sourceRarityExplicit:!!proof.rarity,sourceFinishExplicit:!!proof.finish}};
  };
  const result=resolver(row,cards);
  if(result.cardId)return finishSafe(result);
  const serial=number(row.listNo),secret=serial?.match(/^(\d+)\/(\d+)$/);
  if(/\bSA\b/.test(cleanName) && secret && Number(secret[1])>Number(secret[2])) {
    const matched=resolver({...row,name:cleanName.replace(/\bSA\b/g,'')},cards);
    const card=cards.find(c=>c.id===matched.cardId);
    // Some catalogues omit the SA label. Exact unique secret number/name is required;
    // normal artwork, duplicate variants and non-SR rarities cannot authorize this path.
    if(card && /^(SR|SSR)$/.test(require('./card_identity').extractRarity(card.name,card.rarity)||'') && !/\bSA\b|ミラー|初版|エラー|未開封/.test(card.name))return finishSafe({...matched,method:'unique-secret-number-name-ja-sa-label-omitted'});
  }
  const set=String(item.name).match(/\[((?:SV|SM|XY|BW|S|M)[a-z0-9+-]*)\s+\d{1,3}\s*\/\s*\d{1,3}\]/i)?.[1];
  if(!set || !/\bSRC\b/.test(cleanName))return result;
  // SRC is a source classification, not evidence that the card is an ordinary SR.
  // Remove only that token; require an explicit set plus exact number/name and a unique specification.
  const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const scoped=cards.filter(c=>norm(c.setCode)===norm(set));
  const matched=resolver({...row,name:cleanName.replace(/\bSRC\b/g,'')},scoped);
  return matched.cardId ? finishSafe({...matched,method:'explicit-set-number-name-spec-ja-source-label',sourceClassification:'SRC'}) : result;
}
function capture(saved,catalog,source,cards) {
  const next=structuredClone(saved || {version:1,shops:{}}),byId=new Map(cards.map(c=>[c.id,c]));
  const byNumber=new Map(),number=require('./cardshop151').number;
  for(const c of cards) {const key=number(c.model||c.name);if(key){if(!byNumber.has(key))byNumber.set(key,[]);byNumber.get(key).push(c);}}
  next.shops ||= {}; const audit={accepted:0,rejected:0,reasons:{},holds:{}};
  const reject=r=>{audit.rejected++;audit.reasons[r]=(audit.reasons[r]||0)+1;};
  for(const [shop,items] of Object.entries(catalog.shops||{})) {
    const meta=source.shops?.[shop];
    // A daily skip or later JSON rebuild does not invalidate the last successful
    // saved response. Individual timestamps and the matching source success
    // below authorize the observation, never the file generation day.
    if(!meta?.lastSuccess || meta.lastAttempt!==meta.lastSuccess || ['pending','retired'].includes(meta.acquisitionPermission)) continue;
    for(const item of items) {
      const c=byId.get(item.cardId),quote=source.cards?.[item.cardId]?.shops?.[shop];
      if(!c || c.language!=='ja' || c.identityReviewRequired || !c.identityKey) {reject('仕様未確定');continue;}
      if(!item.active || quote?.quarantined || quote?.listingActive!==true || quote.matchConfidence!=='high' || item.price!==quote.price || quote.priceDate!==day(meta.lastSuccess)) {reject('価格・照合・個別日付不一致');continue;}
      const result=resolveSavedItem(item,cards,byNumber);
      const explicit=String(item.name).match(/\[((?:SV|SM|XY|BW|S|M)[a-z0-9+-]*)\s/i)?.[1];
      const promo=String(item.number || item.name).match(/\d{1,3}\s*\/\s*((?:XY|SM|SV|BW|S)-P)/i)?.[1];
      const setNorm=v=>String(v || '').toUpperCase().replace(/[^A-Z0-9]/g,'');
      const explicitMismatch=explicit && setNorm(explicit)!==setNorm(c.setCode)
        && !(promo && setNorm(c.setCode)===setNorm(promo) && setNorm(explicit)===setNorm(promo).slice(0,-1));
      const identity=require('./card_identity'),rarity=savedPrintEvidence(item).rarity,cardRarity=savedPrintEvidence({name:c.name,rarity:c.rarity}).rarity;
      const variant=identity.extractVariant(c.name),sourceVariant=identity.extractVariant(item.name);
      const rarityMismatch=rarity && rarity!==cardRarity && !(variant==='promo' && !cardRarity && /^(PROMO|P|PR)$/.test(rarity));
      if(result.cardId!==c.id || /mirror/.test(variant) && variant!==sourceVariant || item.language && item.language!=='ja' || item.currency && String(item.currency).toUpperCase()!=='JPY' || item.gradingCompany && String(item.gradingCompany).toUpperCase()!=='PSA' || item.grade!=null && !['10','PSA10'].includes(String(item.grade)) || rarityMismatch || explicitMismatch) {(audit.holds[c.id]||={})[shop]=true;reject('番号・名称・仕様・日本語の一意照合不可');continue;}
      const observedAt=item.observedAt||meta.lastSuccess, date=day(observedAt);
      if(date!==quote.priceDate || Date.parse(observedAt)>Date.parse(meta.lastSuccess)+60000) {reject('取得日時の証拠不一致');continue;}
      const rows=((next.shops[shop]||={})[c.id]||={});
      const value={price:item.price,priceDate:quote.priceDate,observedAt,identity:c.identityKey,url:item.itemUrl||meta.url,method:result.method,timestampBasis:item.observedAt?'individual-fetch':'matching-successful-source-record',grade:'PSA10',currency:'JPY',identityAuditVersion:3,title:item.name,
        campaign:item.campaign===true,quantityLimited:item.quantityLimited===true,conditionsConfirmed:item.conditionsConfirmed!==false};
      if(!rows[date] || Date.parse(rows[date].observedAt)<=Date.parse(observedAt)) rows[date]=value;
      audit.accepted++;
    }
  }
  return {saved:next,audit};
}
function aggregate(saved,source,cards,now=Date.now()) {
  const asOf=day(new Date(now).toISOString()),start=Date.parse(asOf)-364*86400000,byId=new Map(cards.map(c=>[c.id,c]));
  const byNumber=new Map(),number=require('./cardshop151').number;
  for(const c of cards){const key=number(c.model||c.name);if(key){if(!byNumber.has(key))byNumber.set(key,[]);byNumber.get(key).push(c);}}
  const result={version:1,asOf,periods,staleHours:48,shops:{},cards:{},rule:'確認済み同一日本語PSA10・店舗・同日1記録。店舗別観測平均の中央値を保守出口に使用。欠測補完なし。非10は現在国内PSA9のフリマ仮置き。探索のみ'};
  result.historyIdentityHolds={};
  for(const [shop,entries] of Object.entries(saved.shops||{})) {
    if(!source.shops?.[shop] || ['pending','retired'].includes(source.shops[shop].acquisitionPermission)) continue;
    result.shops[shop]={name:source.shops?.[shop]?.name||shop,fulfilment:source.shops?.[shop]?.fulfilment||'mail'};
    for(const [id,dates] of Object.entries(entries)) {
      const c=byId.get(id);if(!c)continue;
      for(const date of Object.keys(dates)) if(Date.parse(date)<start) delete dates[date];
      const records=Object.entries(dates).filter(([date,r])=>{
        if(!(r.identityAuditVersion===3 && r.grade==='PSA10' && r.currency==='JPY' && !r.campaign && !r.quantityLimited && r.conditionsConfirmed!==false && date<=asOf && day(r.observedAt)===date && Date.parse(r.observedAt)<=now && r.identity===c.identityKey && Number.isFinite(r.price) && r.price>0))return false;
        if(resolveSavedItem({name:r.title},cards,byNumber).cardId!==id){
          (result.historyIdentityHolds[id]||={})[shop]=true;
          r.quarantined=true;r.quarantineKind='saved-identity-review';
          r.quarantineReason='保存原票の言語・セット・番号・仕様を一意照合できない';
          return false;
        }
        if(r.quarantineKind==='saved-identity-review'){
          delete r.quarantined;delete r.quarantineKind;delete r.quarantineReason;
        }
        if(r.quarantined)return false;
        return true;
      });
      const row={identity:c.identityKey,periods:{}};
      for(const n of periods) {
        const earliest=Date.parse(asOf)-(n-1)*86400000,rows=records.filter(([d])=>Date.parse(d)>=earliest).sort((a,b)=>a[0].localeCompare(b[0]));
        if(rows.length)row.periods[n]=[rows.reduce((s,[,r])=>s+r.price,0)/rows.length,rows.length,rows.at(-1)[1].observedAt];
      }
      if(Object.keys(row.periods).length)(result.cards[id]||={})[shop]=row;
    }
  }
  return result;
}
function build(root=ROOT) {
  const read=(f,fallback)=>fs.existsSync(path.join(root,f))?JSON.parse(fs.readFileSync(path.join(root,f),'utf8')):fallback;
  const source=read('data/shop-buyback-summary.json',{}),cards=read('data/pokemon-cards.json',[]);
  const {saved,audit}=capture(read('work/buyback-price-observations.json',{version:1,shops:{}}),read('work/shop_buyback_catalog.json',{}),source,cards);
  const summary=aggregate(saved,source,cards);summary.captureHolds=audit.holds;summary.captureAudit={accepted:audit.accepted,rejected:audit.rejected,reasons:audit.reasons};
  for(const [f,x] of [['work/buyback-price-observations.json',saved],['data/buyback-observation-summary.json',summary]]) {
    const file=path.join(root,f),text=JSON.stringify(x);if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')===text)continue;
    fs.writeFileSync(file+'.tmp',text);fs.renameSync(file+'.tmp',file);
  }
  return {cards:Object.keys(summary.cards).length,...audit};
}
function recover(refs,root=ROOT) {
  const cp=require('node:child_process'),file=path.join(root,'work/buyback-price-observations.json');
  let saved=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{version:1,shops:{}};const audit=[];
  for(const ref of refs) {
    if(!/^[a-f0-9]{7,40}$/.test(ref))throw Error('Explicit commit hash required for proof recovery');
    const read=f=>JSON.parse(cp.execFileSync('git',['show',ref+':'+f],{cwd:root,maxBuffer:96e6}));
    const result=capture(saved,read('work/shop_buyback_catalog.json'),read('data/shop-buyback-summary.json'),read('data/pokemon-cards.json'));
    saved=result.saved;audit.push({ref,...result.audit});
  }
  fs.writeFileSync(file+'.tmp',JSON.stringify(saved));fs.renameSync(file+'.tmp',file);return audit;
}
if(require.main===module) {
  if(process.argv.includes('--recover-proof'))console.log(JSON.stringify(recover(['6fd5331c','66712a2a'])));
  console.log(JSON.stringify(build()));
}
module.exports={build,capture,aggregate,recover,resolveSavedItem};
