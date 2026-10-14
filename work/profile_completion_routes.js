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
function prospectPlan(card,fields,{shops={},linkage={},psaProgress={},storeMode='all',selected=[],now=Date.now()}={}) {
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
      const source=linkage[card.id] || {},url=source.sourceSetUrl;
      const retry=psaProgress.sourceRetry || psaProgress.retryByUrl?.[url];
      const waiting=retry&&!require('./acquisition_retry').eligible(retry,now);
      const usable=source.status==='unlinked' && Boolean(url) && !/pokemon-asia/i.test(url) && !waiting;
      requirements.push({field,source:'psaOfficial',state:waiting?retry.status || 'retry-wait':usable?'registered-acquisition':source.status || 'unregistered',automatic:usable,
        stopScope:waiting?retry.scope || 'url':null,nextRetryAt:retry?.nextRetryAt || null,
        url:url || null,candidateUrls:source.candidateOfficialUrls || [],reason:waiting?retry.reason:/pokemon-asia/i.test(url || '')?'日本語版の根拠不足':source.ambiguityReason || null,
        nextAction:usable?'PC正規認証取得→仕様照合→保存→公開':'正規セットURL・日本語・番号・仕様の確認',resumeCondition:usable?'認証済み通常ページへのアクセス確認':'公式リンクと同一仕様の根拠確定'});
    }else if(field==='shopStateA'){
      const urls=['hareruya2','torecacamp'].flatMap(source=>card[source+'Url']?[{source,url:card[source+'Url']}]:[]);
      requirements.push({field,source:'domesticShops',state:urls.length?'price-and-stock-acquisition':'url-discovery',automatic:true,urls,
        nextAction:urls.length?'状態A・在庫・価格・個別取得日時の実確認':'正規商品一覧の差分探索→仕様照合→実価格確認',resumeCondition:'取得元アクセス正常・仕様一意。403元は別停止'});
    }else if(['domesticPrice','domesticTrades','psa10Price','psa10Trades','psa9Evidence','psa9Aggregate'].includes(field)){
      requirements.push({field,source:'toreca',state:'bulk-delta-acquisition',automatic:true,nextAction:'正規一括差分更新',resumeCondition:'正常な外部応答'});
    }else requirements.push({field,source:'manual',state:'unimplemented-or-review',automatic:false,nextAction:'既存残件台帳の担当経路を確認',resumeCondition:'取得経路・仕様根拠の確定'});
  }
  return {requirements,allRequiredPathsAutomatic:requirements.every(r=>r.automatic),blockedFields:requirements.filter(r=>!r.automatic).map(r=>r.field),
    note:'全経路が自動でも値の存在・指定条件への適合は未確定。未掲載や0件は不足を取得済みへ置換しない'};
}
module.exports={buybackState,prospectPlan};
