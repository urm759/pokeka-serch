const fs=require('node:fs'),path=require('node:path'),{issueCompatible}=require('./refresh_candidate_shops');
const ROOT=path.join(__dirname,'..');
function build(root=ROOT) {
  const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8')),write=(f,x)=>require('./acquisition_retry').atomicWrite(path.join(root,f),x,0);
  const cards=read('data/pokemon-cards.json'),state=read('work/candidate-shop-refresh.json'),rows=[];
  for(const source of ['hareruya2','cardrush']) {
    const catalog=read(`work/${source}_catalog.json`),summary=read(`data/${source}-stock-summary.json`),byUrl=new Map(catalog.map(r=>[r.detailUrl,r]));
    for(const card of cards) {
      const url=card[`${source}Url`],record=byUrl.get(url),quote=summary.cards?.[card.id];
      if(!url || !record || !quote || issueCompatible(card,record.name||record.title))continue;
      const reason='仕様不一致で保留：抽選/特別配布または未開封品を通常単品と比較できない。根拠確認後だけ再開';
      rows.push({id:card.id,name:card.name,source,url,sourceCardId:record.cardId,title:record.name||record.title,reason,observedAt:quote.observedAt,
        retainedPrice:quote[`${source}Price`],available:quote.available});
      if(quote.identityReason!==reason)rows.at(-1).previousQuote=quote;
      summary.cards[card.id]={...quote,conditionAccepted:false,identityStatus:'仕様不一致で保留',identityReason:reason};
      state.checkpoints[source].manualWait ||= {};
      const old=state.checkpoints[source].manualWait[card.id];
      state.checkpoints[source].manualWait[card.id]=old?.url===url && old?.reason===reason ? old : {url,reason,checkedAt:new Date().toISOString(),method:'saved-source-title-audit',httpRequests:0};
    }
    write(`data/${source}-stock-summary.json`,summary);
  }
  write('work/candidate-shop-refresh.json',state);
  const report={version:1,at:new Date().toISOString(),held:rows.length,rows,httpRequests:0,llmCalls:0,
    note:'保存済みの正規商品名とカード仕様を照合。元URL・価格・取得日時は保持し、単品の状態A価格としては採用しない。非該当カードの採算条件変更なし'};
  write('data/purchase-issue-alias-audit.json',report);return report;
}
if(require.main===module)console.log(JSON.stringify(build()));
module.exports={build};
