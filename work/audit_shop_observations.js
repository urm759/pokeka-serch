const fs=require('node:fs'), path=require('node:path');
const builder=fs.readFileSync(path.join(__dirname,'build_purchase_limit_audit.js'),'utf8');
let prefix=builder.slice(0,builder.indexOf('const calculated = prepareCalculatedCards(state.cards);'));
const ref=process.argv[2] === '--annotate' ? null : process.argv[2];
if(ref && !/^[a-f0-9]{7,40}$/.test(ref)) throw Error('Commit required');
if(ref) prefix=prefix.replace('const source = fs.readFileSync(path.join(root, "app.js"), "utf8");',
 "const source=require('node:child_process').execFileSync('git',['show','"+ref+":app.js'],{cwd:root,encoding:'utf8',maxBuffer:32000000});");
function finishAudit() {
  if (process.argv.includes('--annotate')) {
    const report=read('data/shop-observation-audit.json'), before=read('work/shop-observation-before.json');
    let priceChanges=0;
    const {execFileSync}=require('node:child_process');
    for (const id of ['cardrush','hareruya2','yuyutei','torecacamp']) {
      const file=`data/${id}-stock-summary.json`;
      const old=JSON.parse(execFileSync('git',['show',`${report.baselineRef}:${file}`],{cwd:root,encoding:'utf8',maxBuffer:32000000}));
      const current=read(file), field=`${id}Price`;
      for (const key of new Set([...Object.keys(old.cards||{}),...Object.keys(current.cards||{})])) {
        if ((old.cards?.[key]?.[field] ?? null) !== (current.cards?.[key]?.[field] ?? null)) priceChanges++;
      }
    }
    report.rawPriceChanges=priceChanges;
    report.baselineStoreOffers=before.storeOfferCount;
    report.actualRecheck=read('data/candidate-shop-refresh.json')?.sources?.hareruya2 || null;
    const presetBefore=read('work/store-freshness-before-presets.json'), presetAfter=read('work/store-freshness-after-presets.json');
    report.presetComparison=(presetAfter?.rows || []).map(row => ({ mode:row.mode,
      before:presetBefore?.rows?.find(r=>r.mode===row.mode)?.displayed ?? null, after:row.displayed,
      now:row.now, periodHeld:row.periodHeld,
      idsUnchanged:JSON.stringify(row.ids)===JSON.stringify(presetBefore?.rows?.find(r=>r.mode===row.mode)?.ids)}));
    report.providerPolicy={
      domesticShops:'カード個別の価格/在庫確認。ファイル更新日・履歴日からの再日付付けなし',
      minntore:'全カタログの正規一括応答で提供された項目のみ確認。欠損から過去価格を保持した項目は前回日時/不明を維持する',
      minntoreLatestBulk:read('data/update-status.json').sources?.toreca,
      psa:'Population各カードf。ファイル更新日は価格/POPの確認日ではない',
      buyback:'カード×店舗の価格日priceDate。現在の販売価格とは別',
      snkrRaw:'カードごとのfetchedAt。許諾待ちの収集停止・過去日時を保持',
      pokedata:'カードごとのcapturedAt/実成約日。海外参考のみ、国内購入GOへ未使用'};
    write('data/shop-observation-audit.json',report);
    console.log(JSON.stringify({rawPriceChanges:priceChanges,baselineStoreOffers:before.storeOfferCount,correctedStoreOffers:report.storeOfferCount}));
    return;
  }
  const all=prepareCalculatedCards(state.cards), sources={};
  for(const id of ['cardrush','hareruya2','yuyutei','torecacamp']){
    const payload=sourceFiles[id],rows=Object.entries(payload.cards||{});
    sources[id]={total:rows.length,fileUpdatedAt:payload.updatedAt,
      missingIndividualDates:rows.filter(([,r])=>!model.shopObservation(r).priceAt).length,
      freshIndividualPrices:rows.filter(([,r])=>{const t=model.observationTime(model.shopObservation(r).priceAt);return t<=Date.now()&&Date.now()-t<=48*3600000;}).length};
  }
  const packed=all.map(c=>({id:c.id,name:c.name,marketReference:c.price,offer:c.currentStoreOffer||null,
    verdict:c.purchaseDecision?.verdict||null,now:presetQualifications(c).now,
    storePriceAudit:c.storePriceAudit||[],limit:c.buyLimits?.clean?.finalMaxPrice??null}));
  const before=read('work/shop-observation-before.json'), old=new Map((before?.rows||[]).map(r=>[r.id,r]));
  const lost=packed.filter(r=>old.get(r.id)?.offer&&!r.offer);
  const changed=packed.filter(r=>old.get(r.id)?.offer && r.offer && old.get(r.id).offer.source!==r.offer.source);
  const gained=packed.filter(r=>!old.get(r.id)?.offer&&r.offer);
  const result={at:new Date().toISOString(),baselineRef:'97405e6',externalAcquired:0,rawPriceChanges:0,
    note:'同一保存データ・同じ設定の鮮度/購入先採否修正。価格下落または新規取得ではない。期間不一致等のGO保留条件は維持。',
    sources,storeOfferCount:packed.filter(r=>r.offer).length,nowCount:packed.filter(r=>r.now).length,
    lostOfferCount:lost.length,gainedOfferCount:gained.length,changedSourceCount:changed.length,
    lost:lost.map(r=>({id:r.id,name:r.name,before:old.get(r.id).offer,after:r.offer,
      reasons:r.storePriceAudit.filter(x=>x.source===old.get(r.id).offer.source).flatMap(x=>x.purchaseReasons)})),
    examples:packed.filter(r=>r.id==='pk-70077'),rows:packed};
  write(process.argv[2] ? 'work/shop-observation-before.json' : 'work/shop-observation-after.json',result);
  if(!process.argv[2]) {const {rows,...publicResult}=result;write('data/shop-observation-audit.json',publicResult);}
  console.log(JSON.stringify({...result,rows:undefined,lost:result.lost.slice(0,3)}));
}
new Function('require','__dirname','process',prefix+'\n('+finishAudit.toString()+')();')(require,__dirname,process);
