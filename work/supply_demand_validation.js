const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const proof=require('./psa10_observation_evidence'),metrics=require('../exploration-metrics');
const ROOT=path.join(__dirname,'..'),DAY=86400000,VERSION='supply-demand-shadow-1';
const HORIZONS=[7,30,91,119,147],LOOKBACK=30;
const read=(root,file,fallback={})=>{try{return JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));}catch{return fallback;}};
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function packedDay(value) {
  const bytes=Buffer.from(JSON.stringify(value));
  return {containerVersion:2,encoding:'gzip-base64',rawSha256:crypto.createHash('sha256').update(bytes).digest('hex'),rawBytes:bytes.length,
    payload:require('node:zlib').gzipSync(bytes).toString('base64')};
}
function unpackDay(value) {
  if(value.containerVersion!==2)return value;
  if(value.encoding!=='gzip-base64')throw Error('Unknown shadow archive format');
  const bytes=require('node:zlib').gunzipSync(Buffer.from(value.payload,'base64'),{maxOutputLength:128*1024*1024});
  if(bytes.length!==value.rawBytes||crypto.createHash('sha256').update(bytes).digest('hex')!==value.rawSha256)throw Error('Shadow archive integrity mismatch');
  return JSON.parse(bytes.toString('utf8'));
}
const readDay=(root,file)=>unpackDay(JSON.parse(fs.readFileSync(path.join(root,file),'utf8')));
const write=(root,file,value)=>{const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});const text=JSON.stringify(value);if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==text)require('./acquisition_retry').atomicWrite(target,value,0);};
const mean=a=>a.length?a.reduce((s,n)=>s+n,0)/a.length:null;
const median=a=>{const s=a.slice().sort((x,y)=>x-y);return s.length?(s[Math.floor(s.length/2)]+s[Math.floor((s.length-1)/2)])/2:null;};
function strata(r) {
  const f=r.features;
  const pop=f.pop30?.aligned?f.pop30:f.pop7?.aligned?f.pop7:null,popDays=f.pop30?.aligned?30:7;
  return {price:r.price<30000?'under30k':r.price<100000?'30k-100k':'over100k',
    pop:pop&&pop.delta>=0&&Number.isFinite(pop.ratePct)?popDays+'d:'+(pop.ratePct<5?'under5pct':pop.ratePct<20?'5-20pct':'over20pct'):null,
    trades:f.trades30==null?null:f.trades30/30<1?'under1/day':f.trades30/30<5?'1-5/day':'over5/day',
    support:f.grossBuybackRate==null?null:f.grossBuybackRate>=1?'at-or-above-market':'below-market',
    age:f.releaseAgeDays==null?null:f.releaseAgeDays<365?'under1y':f.releaseAgeDays<1095?'1-3y':'over3y',
    reprint:f.reprintStatus,popularity:f.popularityClass,market:f.marketChange30==null?null:f.marketChange30>5?'up':f.marketChange30< -5?'down':'flat'};
}
function capture(root,now=new Date()) {
  const cards=read(root,'data/pokemon-cards.json',[]),receipt=read(root,'data/psa10-observation-receipt.json');
  const periods=read(root,'data/psa10-period-summary.json'),buyback=read(root,'data/buyback-observation-summary.json');
  const population=read(root,'data/psa-population-summary.json'),historyCache=new Map();
  const releases=new Map((read(root,'data/card-catalog/index.json').cards||[]).map(c=>[c.id,c.releaseDate]));
  const fixed=read(root,'work/fixed-price-reference.json');
  const day=proof.calendarDay(now.toISOString()),file='data/research-supply-demand/days/'+day+'.json';
  const saved=fs.existsSync(path.join(root,file))?readDay(root,file):{version:1,day,cards:{}},directory=path.join(root,'data/research-supply-demand/days');
  const last=new Map();
  if(fs.existsSync(directory))for(const name of fs.readdirSync(directory).filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)&&n<day+'.json').sort().reverse()) {
    for(const r of Object.values(readDay(root,'data/research-supply-demand/days/'+name).cards||{}))if(!last.has(r.id))last.set(r.id,r);
  }
  let added=0;
  for(const c of cards) {
    const row=receipt.cards?.[c.id],at=Date.parse(receipt.observedAt);
    if(saved.cards[c.id]||!c.identityKey||c.identityReviewRequired||c.language!=='ja'||receipt.version!==1||!receipt.payloadHash||!receipt.sourceUrl
      ||row?.[0]!==proof.identity(c)||row[1]!==c.snkPsa10Price||!(row[1]>0)||!Number.isFinite(at)||at>+now||+now-at>48*3600000)continue;
    const prior=last.get(c.id);
    if(prior?.identity===c.identityKey&&prior.observedAt===receipt.observedAt)continue;
    const t=metrics.tradeDemand(periods,c.id,30,+now),s=metrics.buybackSupport(buyback,c.id,'all',[],+now,c.snkPsa10Price,c.identityKey),pop=population.cards?.[c.id];
    const t7=metrics.tradeDemand(periods,c.id,7,+now),usableTrade=t=>!t.stale&&Number.isFinite(Date.parse(t.at))&&Date.parse(t.at)<=+now;
    let pop30=null,pop7=null;
    if(pop?.sh&&!population.specificationHeld?.[c.id]) {
      if(!historyCache.has(pop.sh))historyCache.set(pop.sh,read(root,'data/psa-history/'+pop.sh+'.json'));
      const shard=historyCache.get(pop.sh),identity=shard.identities?.[c.id];
      const rows=(shard.cards?.[c.id]||[]).filter(r=>r[3]?.sourceUrl===pop.u&&r[3]?.specificationIdentity===identity);
      const w=require('./psa10_trade_statistics').popWindow(rows,30,usableTrade(t)?t.at:now.toISOString(),+now);
      pop30=w.delta==null?null:{...w,ratePct:w.startPop>0?w.delta/w.startPop*100:null};
      const seven=require('./psa10_trade_statistics').popWindow(rows,7,usableTrade(t7)?t7.at:now.toISOString(),+now);
      pop7=seven.delta==null?null:{...seven,ratePct:seven.startPop>0?seven.delta/seven.startPop*100:null};
    }
    // Feature availability is capture time, NOT the historical price/POP timestamp.
    // Never reconstruct yesterday's features with today's population or buyback.
    const validContext=e=>e?.confirmed===true&&e.sourceUrl&&Number.isFinite(Date.parse(e.observedAt))&&Date.parse(e.observedAt)<=+now;
    const released=Date.parse(releases.get(c.id) || c.releaseDate || ''),feature={
      pop30,pop7,trades7:usableTrade(t7)?t7.count:null,trades7At:t7.at,
      trades30:usableTrade(t)?t.count:null,tradesAt:t.at,
      grossBuybackRate:s.median,buybackShops:s.count,buybackAt:s.latest,
      buybackPremiumPct:median(s.rows.filter(r=>r.valid&&Number.isFinite(r.premium)).map(r=>r.premium)),
      continuity30:s.windows[30]?.aboveRate??null,continuityObservedDays:s.windows[30]?.days??0,
      releaseAgeDays:Number.isFinite(released)&&released<=+now?Math.floor((+now-released)/DAY):null,
      priceChange30:null,reprintStatus:validContext(c.officialReprint)?'officially-confirmed':null,
      popularityClass:validContext(c.popularityEvidence)?c.popularityEvidence.classification || null:null,
      marketChange30:fixed.asOfDate===day&&Number.isFinite(fixed.marketReturns?.psa1030)?fixed.marketReturns.psa1030:null,
      contextEvidence:{reprint:validContext(c.officialReprint)?c.officialReprint:null,popularity:validContext(c.popularityEvidence)?c.popularityEvidence:null,
        market:fixed.asOfDate===day?{asOf:fixed.asOfDate,baseline:fixed.baselineDate,cohortHash:hash(fixed.cohort || []),method:fixed.cohortMethod}:null}};
    saved.cards[c.id]={id:c.id,identity:c.identityKey,physicalIdentity:require('./build_buyback_support').physicalKey(c),price:row[1],observedAt:receipt.observedAt,availableAt:now.toISOString(),
      source:receipt.sourceUrl,receiptHash:receipt.payloadHash,features:feature,
      unavailableFeatures:['人気分類の正規根拠','当時の再販確認','固定群市場30日変化'],
      note:'国内集計価格・取引と世界POPの範囲差あり。取引は新供給吸収数ではない。新紐付けの累計POPを増分にしない'};
    added++;
  }
  if(added)write(root,file,packedDay(saved));
  return {added,day,kept:Object.keys(saved.cards).length};
}
function labels(rows,days,now=Date.now()) {
  const groups=new Map(),out=[];
  for(const r of rows){const k=r.id+'|'+r.identity+'|'+r.source;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
  for(const group of groups.values()) {
    group.sort((a,b)=>Date.parse(a.availableAt)-Date.parse(b.availableAt));
    const outcomes=group.filter(r=>Date.parse(r.availableAt)<=now).sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt));
    for(const r of group) {
      const target=Date.parse(r.availableAt)+days*DAY;
      let low=0,high=outcomes.length;
      while(low<high){const mid=(low+high)>>>1;if(Date.parse(outcomes[mid].observedAt)<target)low=mid+1;else high=mid;}
      const next=outcomes[low],end=next&&Date.parse(next.observedAt)<=target+2*DAY?next:null;
      if(end)out.push({...r,targetAt:end.observedAt,outcomeAvailableAt:end.availableAt,target:end.price/r.price-1});
    }
  }
  return out;
}
function nonoverlapping(rows) {
  const ends=new Map();return rows.slice().sort((a,b)=>Date.parse(a.availableAt)-Date.parse(b.availableAt)).filter(r=>{
    const key=r.physicalIdentity || r.identity;if(Date.parse(r.availableAt)<(ends.get(key)||0))return false;
    ends.set(key,Date.parse(r.targetAt));return true;
  });
}
function fit(rows) {
  const global=mean(rows.map(r=>r.target)),groups={};
  for(const r of rows)for(const [field,value]of Object.entries(strata(r)))if(value!=null)(groups[field+':'+value]||=[]).push(r.target);
  return {global,groups:Object.fromEntries(Object.entries(groups).map(([k,a])=>[k,{n:a.length,raw:mean(a),value:(mean(a)*a.length+(global??0)*30)/(a.length+30)}])),shrinkagePrior:30};
}
function predict(model,r) {
  const values=Object.entries(strata(r)).map(([k,v])=>v==null?null:model.groups[k+':'+v]?.value).filter(Number.isFinite);
  return values.length?mean(values):model.global;
}
function score(rows,predictions) {
  if(!rows.length)return {count:0,mae:null,downsideOverprediction:null,dropMissRate:null};
  const drops=rows.map((r,i)=>[r,predictions[i]]).filter(([r])=>r.target<=-0.1);
  return {count:rows.length,mae:mean(rows.map((r,i)=>Math.abs(predictions[i]-r.target))),
    downsideOverprediction:mean(rows.map((r,i)=>Math.max(0,predictions[i]-r.target))),
    negativeOutcomeMae:mean(rows.map((r,i)=>r.target<0?Math.abs(predictions[i]-r.target):null).filter(Number.isFinite)),
    dropCount:drops.length,dropMissRate:drops.length?drops.filter(([,p])=>p> -0.05).length/drops.length:null};
}
function validate(rows,days,now=Date.now()) {
  const labelled=labels(rows,days,now),folds=[],predictions=[];
  const dates=[...new Set(labelled.map(r=>proof.calendarDay(r.availableAt)))].sort();
  let previousEnd=-Infinity;
  for(const date of dates) {
    const start=Date.parse(date+'T00:00:00+09:00');if(start<previousEnd)continue;
    const end=start+days*DAY;
    const train=nonoverlapping(labelled.filter(r=>Date.parse(r.outcomeAvailableAt)<start-LOOKBACK*DAY));
    const test=nonoverlapping(labelled.filter(r=>Date.parse(r.availableAt)>=start&&Date.parse(r.availableAt)<end));
    if(train.length<30||test.length<20)continue;
    const model=fit(train),p=test.map(r=>predict(model,r));
    folds.push({start:new Date(start).toISOString(),end:new Date(end).toISOString(),train:train.length,test:test.length,
      trainLatestOutcome:new Date(Math.max(...train.map(r=>Date.parse(r.outcomeAvailableAt)))).toISOString(),
      embargoDays:LOOKBACK,modelHash:hash(model),candidate:score(test,p),flat:score(test,test.map(()=>0)),pooled:score(test,test.map(()=>model.global))});
    predictions.push(...test.map((r,i)=>({id:r.id,identity:r.identity,availableAt:r.availableAt,targetAt:r.targetAt,actual:r.target,predicted:p[i],strata:strata(r)})));
    previousEnd=end;
  }
  const candidate=score(predictions.map(p=>({target:p.actual})),predictions.map(p=>p.predicted));
  const flat=score(predictions.map(p=>({target:p.actual})),predictions.map(()=>0));
  const enough=folds.length>=3&&predictions.length>=100&&new Set(predictions.map(r=>r.id)).size>=30&&candidate.dropCount>=10;
  const passes=enough&&candidate.mae<flat.mae&&candidate.downsideOverprediction<=flat.downsideOverprediction&&candidate.dropMissRate<=flat.dropMissRate;
  return {days,kind:days<=30?'短期検証・返却時精度ではない':'返却期間検証',labelled:labelled.length,folds,
    candidate,flat,passedEvidenceGates:passes,adopted:false,status:!enough?'将来期間・独立標本不足・蓄積中':passes?'参考検証基準通過・承認待ち':'現相場維持基準を改善せず・現行維持',
    predictions};
}
function build(root=ROOT,now=new Date()) {
  const captured=capture(root,now),dir=path.join(root,'data/research-supply-demand/days'),rows=[];
  if(fs.existsSync(dir))for(const file of fs.readdirSync(dir).filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort())rows.push(...Object.values(readDay(root,'data/research-supply-demand/days/'+file).cards||{}));
  const algorithmHash=crypto.createHash('sha256').update(fs.readFileSync(__filename,'utf8').replace(/\r\n/g,'\n')).digest('hex');
  const old=read(root,'data/supply-demand-validation-summary.json'),inputHash=hash(rows),inputChanged=old.inputHash!==inputHash;
  const algorithmChanged=old.algorithmHash!==algorithmHash;
  const lastValidationAt=old.lastValidationAt || old.trainedAt || null;
  const intervalDue=!lastValidationAt || +now-Date.parse(lastValidationAt)>=7*DAY;
  // A calendar tick alone creates neither observations nor future outcomes.
  const due=algorithmChanged || intervalDue && inputChanged;
  const oldCounts=old.availableLabelCounts || Object.fromEntries((old.horizons||[]).map(h=>[h.days,h.labelled]));
  const samples=due || inputChanged ? HORIZONS.map(days=>({days,sample:nonoverlapping(labels(rows,days,+now))})) : null;
  const counts=samples?Object.fromEntries(samples.map(r=>[r.days,r.sample.length])):oldCounts;
  const details=due?HORIZONS.map(h=>validate(rows,h,+now)):read(root,'data/supply-demand-validation-details.json').horizons||[];
  const eligibleTraining=due?samples.map(({days,sample})=>({days,rows:sample.length,cards:new Set(sample.map(r=>r.physicalIdentity||r.identity)).size,
    model:sample.length>=30&&new Set(sample.map(r=>r.physicalIdentity||r.identity)).size>=10?fit(sample):null})):null;
  const established=Boolean(eligibleTraining?.some(r=>r.model));
  const previousFit=old.learning?.established===true;
  const trainedAt=established?now.toISOString():due?null:previousFit?old.trainedAt:null;
  const summary={version:2,candidateVersion:VERSION,algorithmHash,asOf:now.toISOString(),trainedAt,
    lastValidationAt:due?now.toISOString():lastValidationAt,
    execution:{attemptedAt:now.toISOString(),validationExecuted:due,inputChanged,algorithmChanged,intervalDue,
      newObservations:Math.max(0,rows.length-Number(old.storedObservations||0)),
      newLabels:Object.fromEntries(HORIZONS.map(h=>[h,Math.max(0,(counts[h]||0)-(oldCounts[h]||0))])),
      reason:due?'候補検証を実行・有効学習/改善は別集計':!inputChanged?'同一入力・新しい観測/将来結果なし・再学習省略':'新観測を保存・7日間隔待ち'},
    availableLabelCounts:counts,
    learning:{established:due?established:previousFit,
      status:trainedAt?'標本条件を満たす候補学習あり・本番未採用':'有効学習未成立・将来結果/独立標本不足',
      minimumRows:30,minimumCards:10,improved:details.some(h=>h.passedEvidenceGates)},
    dailyCapture:captured,storedObservations:rows.length,observedDays:new Set(rows.map(r=>proof.calendarDay(r.availableAt))).size,
    coverage:Object.fromEntries(['pop30','trades30','grossBuybackRate','buybackPremiumPct','continuity30','releaseAgeDays','reprintStatus','popularityClass','marketChange30'].map(k=>[k,rows.filter(r=>r.features[k]!=null).length])),
    popCoverage:{measured30:rows.filter(r=>r.features.pop30?.delta!=null).length,aligned30:rows.filter(r=>r.features.pop30?.aligned===true).length,
      measured7:rows.filter(r=>r.features.pop7?.delta!=null).length,aligned7:rows.filter(r=>r.features.pop7?.aligned===true).length,
      note:'部分期間の実測POP差を30日取引へ厳密対応させず、alignedの根拠がある特徴だけPOP層別学習へ使用'},
    inputHash,trainingInputHash:established?inputHash:trainedAt?old.trainingInputHash:null,
    horizons:details.map(({predictions,...r})=>r),modelHash:due?established?hash({algorithmHash,horizons:eligibleTraining}):null:previousFit?old.modelHash:null,
    adoption:{adopted:false,automaticAdoption:false,productionCandidateChanges:0,productionGoChanges:0,
      candidateImpact:null,reason:'需給シャドーモデルは本番から独立。承認・全カード影響監査前に係数やGOを変更しない',
      gates:'各期間3非重複fold・100検証例・30カード・下落10例、MAE改善かつ下落見落とし/損失側誤差非悪化。その後、明示承認と全件差分監査',
      rollback:'本番モデル未変更。候補アーカイブから復元可能。採用時は本番旧版と影響監査を別コミットで保存'},
    method:'JST日次・実確認時刻と特徴の利用可能時刻を分離。過去学習/未来検証、30日embargo、同カード重複ラベル期間除外。固定分類を全体平均へ30例分縮約。欠損分類は推定しない',
    limitations:['国内取引と世界POPは範囲差・再売買あり','価格予測であり返却時の手数料込み損益検証とは別','人気/再販/市場分類は根拠付き入力が未接続・null','旧候補モデルの検証完了を意味しない'],
    detailFile:'data/supply-demand-validation-details.json',llmCalls:0,codexCalls:0};
  if(due)write(root,'data/supply-demand-validation-details.json',{version:2,algorithmHash,validatedAt:summary.lastValidationAt,trainedAt:summary.trainedAt,horizons:details});
  if(established)write(root,'data/research-supply-demand/models/'+summary.modelHash+'.json',{version:VERSION,algorithmHash,trainedAt:summary.trainedAt,inputHash:summary.inputHash,horizons:eligibleTraining});
  write(root,'data/supply-demand-validation-summary.json',summary);return summary;
}
if(require.main===module){const r=build();console.log(JSON.stringify({captured:r.dailyCapture,observations:r.storedObservations,horizons:r.horizons.map(h=>({days:h.days,labelled:h.labelled,status:h.status}))}));}
module.exports={capture,labels,nonoverlapping,fit,predict,score,validate,build,strata,packedDay,unpackDay};
