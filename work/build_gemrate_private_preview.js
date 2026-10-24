const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),store=path.resolve(root,'..','private-research/gemrate');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function build() {
  if(!require('./gemrate_private_store').outside(fs.realpathSync(root),fs.realpathSync(store)))throw Error('Private store required');
  const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
  const expanded=read(path.join(store,'expanded-verification-report.json'));
  const manifest=read(path.join(store,'manifest.json'));
  const observations=expanded.outputs.flatMap(f=>{
    const receipt=manifest.files.find(r=>r.sha256===f.sha256),parsed=read(f.path);
    if(!receipt||hash(fs.readFileSync(receipt.storedPath))!==f.sha256
      ||hash(require('node:zlib').gunzipSync(fs.readFileSync(receipt.backupPath)))!==f.sha256
      ||parsed.csvSha256!==f.sha256||parsed.accepted.length!==f.accepted
      ||parsed.accepted.some(r=>r.csvSha256!==f.sha256))throw Error('Verified original/backup/import mismatch');
    return parsed.accepted;
  });
  const latest=new Map();
  for(const row of observations) {
    const old=latest.get(row.cardId);
    if(old?.sourceUpdatedDate===row.sourceUpdatedDate&&(old.psa10!==row.psa10||old.total!==row.total))throw Error('Same-day counts conflict');
    if(!old||old.sourceUpdatedDate<row.sourceUpdatedDate)latest.set(row.cardId,row);
  }
  const inputs=['data/psa-population-summary.json','data/pokemon-cards.json','data/ui/manifest.json','work/priority-search-profiles.json'];
  const before=Object.fromEntries(inputs.map(f=>[f,hash(fs.readFileSync(path.join(root,f)))]));
  const now=new Date().toISOString(),profile=read(path.join(root,'work/priority-search-profiles.json')).profiles[0];
  const api=require('./audit_search_profit_consistency').load(fs.readFileSync(path.join(root,'app.js'),'utf8'),now,{url:profile.url,fixedModelClock:true});
  const cards=api.prepareCalculatedCards(api.state.cards).filter(c=>latest.has(c.id));
  const catalog=read(path.join(root,'data/pokemon-cards.json'));
  const pending=read(expanded.outputs.at(-1).path).identityReview.map(row=>{
    const counterparts=catalog.filter(c=>{
      const p=require('./gemrate_identity_match').printed(c.name);
      return c.language==='ja'&&p?.set==='s6a'&&p.denominator===69&&p.number===Number(row.number);
    }).map(c=>({id:c.id,name:c.name,identityKey:c.identityKey}));
    return {...row,catalogCounterparts:counterparts,
      status:row.reason==='special-parallel-unresolved'?'special-finish-review':counterparts.length?'name-confirmation':'domestic-catalog-unlisted',
      automaticMatch:false,sourcePage:observations.at(-1).pageUrl,
      nextAction:row.reason==='special-parallel-unresolved'?'特殊加工の国内同一仕様・原票根拠待ち。通常版の対応は採用しない':counterparts.length?'名称対応を正規根拠で確認。番号一致だけでは採用しない':'国内の掲載対象・日本語名・仕様を正規カタログで確認してから追加。GemRate一覧だけでは追加しない'};
  });
  const model=require('./gemrate_reference_display');
  const rows=cards.map(c=>({cardId:c.id,name:c.name,...model.reference(c,latest.get(c.id),{audience:'private-preview',now:Date.parse(now)}),
    oldOfficial:c.official?{rate:c.official.rate,ten:c.official.ten,total:c.official.total,confirmedAt:c.official.f}:null,
    adoptedRate:c.buyLimits?.clean?.assumptions?.hitRate??null,adoptedSource:c.buyLimits?.clean?.assumptions?.hitRateSource??null}));
  if(cards.length!==expanded.acceptedCards||rows.some(r=>!r.available))throw Error('Private reference projection lost accepted identities');
  const html=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GemRate参考表示・非公開検証</title>
    <style>body{background:#101827;color:#edf2fc;font:16px system-ui;margin:20px}main{max-width:1100px;margin:auto}article{border:1px solid #526077;border-radius:12px;padding:16px;margin:16px 0}h2{font-size:17px;overflow-wrap:anywhere}.grade-rate-summary{display:grid;grid-template-columns:1fr 1fr;gap:14px}.grade-rate-summary>div{min-width:0}.grade-rate-summary span,.grade-rate-summary strong,.grade-rate-summary small{display:block}strong{color:#d1b7ff;font-size:28px}small{line-height:1.6;color:#bfcbe0;font-size:12px}.warning{color:#ffcd78}summary{cursor:pointer;font-size:13px}a{color:#a7d1ff}@media(max-width:500px){body{margin:10px}article{padding:12px}strong{font-size:24px}}</style>
    <main><h1>GemRate参考表示・非公開検証</h1><p>${rows.length}枚／公開0・計算採用0。選択中の計算設定は変更しません。</p>${cards.map(c=>`<article data-card-id="${c.id}"><h2>${String(c.name).replace(/[<&]/g,s=>s==='<'?'&lt;':'&amp;')}</h2>${model.render(c,latest.get(c.id),{audience:'private-preview',now:Date.parse(now)})}</article>`).join('')}</main></html>`;
  for(const file of inputs)if(before[file]!==hash(fs.readFileSync(path.join(root,file))))throw Error('Display preparation changed calculation/public inputs');
  const dir=path.join(store,'preview');fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'index.html'),html);
  const report={at:now,matched:rows.length,publicSwitched:0,calculationAdopted:0,newDomesticAnalyzable:0,inputHashes:before,
    pendingSpecifications:pending.reduce((counts,r)=>(counts[r.status]=(counts[r.status]||0)+1,counts),{}),
    publicationReason:'公開サイトでのGemRate率・PSA10枚数・TOTAL・基準日の再掲載条件が未確認。取得/保存/再配布の範囲と出典表示条件の確認が必要。契約/問い合わせは未実施。',rows};
  fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(store,'remaining-specification-plan.json'),JSON.stringify({at:now,rows:pending,newMatches:0,httpRequests:0,publicRecords:0},null,2));
  console.log(JSON.stringify({at:now,privateDisplay:rows.length,publicSwitched:0,calculationAdopted:0,unchangedInputs:true}));return report;
}
if(require.main===module) {
  build();
  if(process.argv.includes('--serve')) {
    const html=fs.readFileSync(path.join(store,'preview/index.html'));
    require('node:http').createServer((request,response)=>{
      if(request.url!=='/'||request.method!=='GET'){response.writeHead(404);response.end();return;}
      response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow',
        'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"});
      response.end(html);
    }).listen(8772,'127.0.0.1',()=>console.log('Private preview: http://127.0.0.1:8772/'));
  }
}
module.exports={build};
