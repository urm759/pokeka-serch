const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
async function main(){
 const cache=read('work/candidate-shop-refresh.json'),cards=read('data/pokemon-cards.json'),catalog=read('work/hareruya2_catalog.json');
 const matches=require('./refresh_candidate_shops.js').exactIdentity, records=[];
 for(const [id,wait] of Object.entries(cache.checkpoints.hareruya2.manualWait || {})){
  const card=cards.find(c=>c.id===id); if(!card)continue;
  const record={id,name:card.name,url:wait.url,previousReason:wait.reason,checkedAt:new Date().toISOString(),state:'手動確認待ち',candidates:[]};
  try{
   const res=await fetch(`${wait.url}.js`,{signal:AbortSignal.timeout(15000)});record.httpStatus=res.status;
   if(res.status===403||res.status===401){record.state='アクセス停止';record.reason=`HTTP ${res.status}・正規アクセスの人間確認が必要`;records.push(record);break;}
   if(res.ok){const p=await res.json();record.title=p.title;record.productId=p.id;record.identityConfirmed=matches(card,p);record.reason=record.identityConfirmed?'同一カード仕様確認・自動巡回へ復帰可能':'番号・セット・名称・レアリティ・仕様の照合を人間が確認';}
   else record.reason=res.status===404?'旧商品URLまたは商品非掲載。公開カタログから完全一致候補のみ検索':'HTTP取得失敗・旧正常値保持';
   record.candidates=catalog.filter(p=>p.detailUrl!==wait.url&&matches(card,{...p,title:p.name||p.title})).map(p=>({url:p.detailUrl,title:p.name||p.title})).slice(0,8);
   if(record.identityConfirmed){record.state='自動巡回待ち';record.resolution='正規商品JSONで同一プロモ番号・シリーズ・名称・状態Aを確認。次回は価格/在庫を再取得';delete cache.checkpoints.hareruya2.manualWait[id];
     const deadlinePath=path.join(root,'work/priority-price-checkpoint.json'),deadline=JSON.parse(fs.readFileSync(deadlinePath,'utf8'));
     if(deadline.sources?.hareruya2?.jobs?.[id]){deadline.sources.hareruya2.jobs[id].failures=0;deadline.sources.hareruya2.jobs[id].nextRetryAt=null;}
     fs.writeFileSync(deadlinePath,JSON.stringify(deadline));
   }
  }catch(e){record.reason=e.message;record.state='再試行待ち';}
  records.push(record);
  fs.writeFileSync(path.join(root,'data/priority-manual-wait-audit.json'),JSON.stringify({at:new Date().toISOString(),source:'hareruya2',records,llmCalls:0,codexCalls:0}));
  await new Promise(r=>setTimeout(r,1300));
 }
 fs.writeFileSync(path.join(root,'data/priority-manual-wait-audit.json'),JSON.stringify({at:new Date().toISOString(),source:'hareruya2',records,llmCalls:0,codexCalls:0}));
 fs.writeFileSync(path.join(root,'work/candidate-shop-refresh.json'),JSON.stringify(cache));
 console.log(JSON.stringify(records));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
