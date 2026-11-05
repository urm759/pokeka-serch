const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.join(__dirname,'..');
function evaluate(at=new Date().toISOString(), options={}) {
  if(!Number.isFinite(Date.parse(at)))throw Error('Invalid live search evaluation time');
  const config=JSON.parse(fs.readFileSync(path.join(ROOT,'work/priority-search-profiles.json'),'utf8'));
  const profiles=[...(config.profiles||[]),...(config.additionalProfiles||[])].filter(p=>config.focusProfileIds.includes(p.id));
  if(profiles.length!==2||new Set(profiles.map(p=>p.id)).size!==2)throw Error('Expected exactly two distinct focus URLs');
  const source=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
  const audit=JSON.parse(fs.readFileSync(path.join(ROOT,'data/priority-search-profile-audit.json'),'utf8'));
  const started=performance.now();
  const results=profiles.map(p=>{
    try {
      const url=new URL(p.url);
      for(const [k,v]of Object.entries(options.extraParams||{}))url.searchParams.set(k,String(v));
      const api=(options.load||require('./audit_search_profit_consistency').load)(source,at,{url:url.href,...(options.dataRef?{dataRef:options.dataRef}:{})});
      if(!Array.isArray(api.state.cards)||!api.state.cards.length)throw Error('Card input unavailable; search count is unknown');
      const cards=api.prepareCalculatedCards(api.state.cards);
      const ids=cards.filter(c=>!api.cardSearchExclusions(c).length).map(c=>String(c.id)).sort();
      return {id:p.id,status:ids.length?'ready':'zero',count:ids.length,ids,
        urlHash:crypto.createHash('sha256').update(p.url).digest('hex'),evaluationAt:at,
        generatedAuditCount:(audit.profiles||[]).map(r=>r.urlOnly||r).find(r=>r.id===p.id)?.qualified??null};
    } catch(error) {return {id:p.id,status:'error',count:null,error:error.message,evaluationAt:at};}
  });
  return {version:1,evaluationAt:at,generatedAuditAt:audit.at||audit.generatedAt||null,
    dataRevision:JSON.parse(fs.readFileSync(path.join(ROOT,'data/ui/manifest.json'),'utf8')).revision,
    scope:'最新2URLのみ。端末保存追加条件・実ブラウザ読込状態はクラウドから未確認',
    durationMs:Math.round(performance.now()-started),profiles:results,llmCalls:0,codexCalls:0};
}
function record(root=ROOT,at=new Date().toISOString()) {
  const row=evaluate(at);
  const file=path.join(root,'data/search-runtime-probe.json');
  let previous={};try{previous=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
  const history=[...(previous.history||[]),{at,runId:process.env.GITHUB_RUN_ID||null,
    event:process.env.GITHUB_EVENT_NAME||null,profiles:row.profiles.map(({id,count,status,error})=>({id,count,status,...(error?{error}:{})}))}].slice(-168);
  fs.writeFileSync(file,JSON.stringify({...row,history}));
  return row;
}
if(require.main===module)console.log(JSON.stringify(process.argv.includes('--record')?record():evaluate(process.argv[2]||undefined)));
module.exports={evaluate,record};
