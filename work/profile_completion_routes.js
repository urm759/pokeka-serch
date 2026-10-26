function buybackState(row,meta,now=Date.now()) {
  if(row?.quarantined)return 'quarantined';
  if(row?.listingActive===false){
    const checked=Date.parse(meta.lastSuccess||'');
    if(meta.error)return 'source-failure';
    if(!Number.isFinite(checked))return 'unacquired';
    if(checked>now||now-checked>168*3600000)return 'table-expired';
    if(meta.fullListingConfirmedAt!==meta.lastSuccess)return 'coverage-incomplete';
    return meta.unmatched===0?'confirmed-unlisted':'unmatched-or-unlisted';
  }
  if(row?.stale)return 'expired';
  if(row?.valid && row.buybackPrice>0)return 'usable';
  if(row?.buybackPrice>0)return 'identity-or-price-unverified';
  if(meta.error)return 'source-failure';
  const at=Date.parse(meta.lastSuccess || '');
  if(!Number.isFinite(at))return 'unacquired';
  if(at>now || now-at>168*3600000)return 'table-expired';
  if(meta.fullListingConfirmedAt!==meta.lastSuccess)return 'coverage-incomplete';
  return meta.unmatched===0?'confirmed-unlisted':'unmatched-or-unlisted';
}
function sourceForUrl(url){try{const u=new URL(url);if(u.protocol!=='https:')return null;return {'hareruya2.com':'hareruya2','torecacamp-pokemon.com':'torecacamp','cardrush-pokemon.jp':'cardrush','yuyu-tei.jp':'yuyutei'}[u.hostname.replace(/^www\./,'')]||null;}catch{return null;}}
function requestForSource(row,source){return !Array.isArray(row.sourceTargets)||row.sourceTargets.some(t=>t.source===source);}
function minimalMedian(evidence){
  const origins=new Set((evidence.rows||[]).filter(r=>r.fresh&&r.origin).map(r=>r.origin));
  const freshSources=new Set((evidence.rows||[]).filter(r=>r.fresh).map(r=>sourceForUrl(r.url)).filter(Boolean));
  const needed=Math.max(0,2-origins.size),targets=[];
  for(const row of evidence.omitted||[]){
    const source=sourceForUrl(row.url);if(!['hareruya2','torecacamp'].includes(source)||freshSources.has(source)||origins.has(source)||origins.has(new URL(row.url).hostname))continue;
    if(!/古値|日時不明|期限/.test(row.reason||'')||/仕様|対立|不一致|状態|実売根拠/.test(row.reason||''))continue;
    if(targets.some(r=>r.source===source))continue;
    targets.push({source,url:row.url,at:row.observedAt||null});if(targets.length>=needed)break;
  }
  return {needed,targets:needed?targets:[],automatic:needed>0&&targets.length>=needed};
}
function prospectPlan(card,fields,{shops={},linkage={},psaProgress={},psaAccess=null,tradeReceipt=null,priceEvidence=null,priceAudit=null,storeMode='all',selected=[],repairTargets=[],now=Date.now()}={}) {
  const requirements=[];
  for(const field of [...new Set(fields)]) {
    if(field==='buybackExitEvidence' || field==='buyback'){
      const evidence=Object.entries(shops).filter(([shopId,meta])=>storeMode==='selected'?selected.includes(shopId):storeMode==='all'||meta.fulfilment!=='store')
        .map(([shopId,meta])=>({shopId,state:buybackState((card.buybackAnalysis?.rows || []).find(r=>r.shopId===shopId),meta,now),checkedAt:meta.lastSuccess || null,
          reason:meta.error || null,fullListingConfirmedAt:meta.fullListingConfirmedAt || null,unmatched:meta.unmatched ?? null}));
      const absent=evidence.length>0&&evidence.every(r=>r.state==='confirmed-unlisted');
      requirements.push({field,source:'shopBuyback',state:absent?'confirmed-unlisted':'table-update-or-linkage',automatic:!absent,evidence,
        nextAction:absent?'正常な未掲載。カード別の同じ再取得はせず、通常の買取表差分更新後に再評価':'独立した買取表更新／保存原票の仕様照合。未掲載と取得不足を混同しない',
        resumeCondition:absent?'店舗一覧または掲載内容の変化':'正常取得・2店舗以上の新鮮で同一仕様の掲載'});
    }else if(field==='psaOfficial'){
      if (linkage[card.id]?.savedEvidence?.candidateCount > 0) {
        requirements.push({ field, source: 'psaOfficial', state: 'saved-rematch-review', automatic: false,
          stopScope: 'card', networkRequired: false, evidence: linkage[card.id].savedEvidence,
          nextAction: '保存原票の名称・番号・セット・言語・完全仕様を再照合。共通照合更新時に通信なしで再評価',
          resumeCondition: '同一仕様と名称対応を一意に証明。根拠不足は保留し、新規取得許諾待ちと分離' });
        continue;
      }
      if (psaAccess && !psaAccess.allowed) {
        requirements.push({field,source:'psaOfficial',state:'permission-wait',automatic:false,stopScope:'source',nextRetryAt:null,
          url:linkage[card.id]?.sourceSetUrl || null,reason:psaAccess.reason,nextAction:'書面許諾・正規提供条件の確認。ほかの取得元の補完は継続',resumeCondition:psaAccess.resumeCondition});
        continue;
      }
      const source=linkage[card.id] || {},url=source.sourceSetUrl;
      const retry=psaProgress.sourceRetry || psaProgress.retryByUrl?.[url];
      const waiting=retry&&!require('./acquisition_retry').eligible(retry,now);
      const usable=source.status==='unlinked' && Boolean(url) && !/pokemon-asia/i.test(url) && !waiting;
      requirements.push({field,source:'psaOfficial',state:waiting?retry.status || 'retry-wait':usable?'registered-acquisition':source.status || 'unregistered',automatic:usable,
        stopScope:waiting?retry.scope || 'url':null,nextRetryAt:retry?.nextRetryAt || null,
        url:url || null,candidateUrls:source.candidateOfficialUrls || [],reason:waiting?retry.reason:/pokemon-asia/i.test(url || '')?'日本語版の根拠不足':source.ambiguityReason || null,
        nextAction:usable?'PC正規認証取得→仕様照合→保存→公開':'正規セットURL・日本語・番号・仕様の確認',resumeCondition:usable?'認証済み通常ページへのアクセス確認':'公式リンクと同一仕様の根拠確定'});
    }else if(field==='referenceMedian'){
      if(card.medianEvidence?.rows){
        const plan=minimalMedian(card.medianEvidence);
        requirements.push({field,source:'domesticShops',state:plan.needed?'minimum-independent-source-refresh':'median-evidence-already-ready',
          automatic:plan.automatic,targets:plan.targets,requiredIndependent:2,remainingIndependent:plan.needed,
          nextAction:plan.automatic?'不足する独立元だけ再確認。新鮮な採用元は再取得しない':'独立元の不足/停止・根拠を確認。単一店舗への置換なし',resumeCondition:'同一仕様・同等状態の新鮮な独立元が2以上'});continue;
      }
      const rows=(card.priceAggregation?.included || []).filter(r=>{
        const at=Date.parse(r.updatedAt||r.observedAt||'');return !Number.isFinite(at)||at>now||now-at>48*3600000;
      });
      const sources=rows.map(r=>({source:/hareruya2\.com/.test(r.url||'')?'hareruya2':/torecacamp-pokemon\.com/.test(r.url||'')?'torecacamp':/cardrush-pokemon\.jp/.test(r.url||'')?'cardrush':/yuyu-tei\.jp/.test(r.url||'')?'yuyutei':'toreca',url:r.url||null,at:r.updatedAt||r.observedAt||null}));
      const automatic=sources.some(r=>['hareruya2','torecacamp','toreca'].includes(r.source));
      const conflicted=(card.priceAggregation?.comparison||card.priceAggregation)?.conflicted;
      requirements.push({field,source:'domesticShops',state:conflicted?'price-conflict-review':sources.length?'adopted-source-refresh':'median-evidence-unavailable',
        automatic:automatic&&!conflicted,evidence:sources,
        nextAction:'古い採用元そのものの正規再確認。別店舗の新鮮価格だけを繰り返さず、価格対立は自動解除しない',resumeCondition:'同一仕様・個別日時・採用元の正常再確認'});
    }else if(field==='shopStateA'){
      const requested=repairTargets.filter(t=>t.field===field);
      const all=requested.length?requested:['hareruya2','torecacamp'].flatMap(source=>card[source+'Url']?[{source,url:card[source+'Url']}]:[]);
      const urls=requested.length?all:all.slice(0,1),automatic=urls.length?urls.every(t=>['hareruya2','torecacamp'].includes(t.source)):true;
      requirements.push({field,source:'domesticShops',state:!automatic?'source-access-or-identity-review':urls.length?'price-and-stock-acquisition':'url-discovery',automatic,urls,targets:urls,
        nextAction:urls.length?'状態A・在庫・価格・個別取得日時の実確認':'正規商品一覧の差分探索→仕様照合→実価格確認',resumeCondition:'取得元アクセス正常・仕様一意。403元は別停止'});
    }else if(['domesticTrades','psa10Trades'].includes(field)){
      const evidence=require('./domestic_trade_evidence').inspect(tradeReceipt,card,field,now);
      const unsupported=['period-not-provided','source-card-absent'].includes(evidence.status);
      requirements.push({field,source:'toreca',state:evidence.status,automatic:!unsupported&&evidence.automatic,
        evidence,reason:evidence.reason,normalBulkRecheck:unsupported,
        nextAction:unsupported?'カードIDまたは期間項目が現原票に未提供。通常の一括差分で提供開始を確認し、専用の個別反復取得はしない':'正規一括差分の期間件数・同一仕様を再確認',
        resumeCondition:unsupported?'正規原票に対象期間の件数が提供されること':'仕様一致・対象期間と取得日時が確認できる正常応答'});
    }else if(field==='domesticPrice' && (priceEvidence?.cards?.[card.id]?.status==='unbacked'
      || priceAudit?.cards?.some(r=>r.id===card.id))){
      const unbacked=priceEvidence?.cards?.[card.id]?.status==='unbacked';
      requirements.push({field,source:'toreca',state:unbacked?'source-evidence-unavailable':'price-conflict-review',automatic:false,
        networkRequired:false,evidence:priceEvidence?.cards?.[card.id]||null,
        reason:unbacked?'参考価格の実売根拠不足':'同一仕様の価格根拠を要確認',normalBulkRecheck:true,
        nextAction:'保存原票の価格区分・個別日時・採否を確認。通常一括差分で根拠の変更を検知し、同じ価格の反復取得を補完可能と数えない',
        resumeCondition:'同一仕様の有効な価格根拠、または対立の原因が確定。参考価格の自動採用・別店舗価格への置換なし'});
    }else if(field==='domesticPrice' && Object.hasOwn(card,'price') && !(typeof card.price==='number' && Number.isFinite(card.price) && card.price>0)){
      requirements.push({field,source:'toreca',state:'source-price-missing',automatic:false,networkRequired:false,normalBulkRecheck:true,
        reason:'保存済みの取得元価格が欠損・有効値なし',
        nextAction:'通常一括差分で有効価格の提供開始を検知。店舗の購入価格取得は別工程で継続し、参考相場へ黙って置換しない',
        resumeCondition:'同一仕様の有効価格が正規原票へ提供されること、または分析定義を満たす正規の別経路確立'});
    }else if(['domesticPrice','psa10Price','psa9Evidence','psa9Aggregate'].includes(field)){
      requirements.push({field,source:'toreca',state:'bulk-delta-acquisition',automatic:true,nextAction:'正規一括差分更新',resumeCondition:'正常な外部応答'});
    }else requirements.push({field,source:'manual',state:'unimplemented-or-review',automatic:false,nextAction:'既存残件台帳の担当経路を確認',resumeCondition:'取得経路・仕様根拠の確定'});
  }
  return {requirements,allRequiredPathsAutomatic:requirements.every(r=>r.automatic),blockedFields:requirements.filter(r=>!r.automatic).map(r=>r.field),
    note:'全経路が自動でも値の存在・指定条件への適合は未確定。未掲載や0件は不足を取得済みへ置換しない'};
}
module.exports={buybackState,prospectPlan,requestForSource,minimalMedian};
