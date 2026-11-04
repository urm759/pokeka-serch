(function(root){
  const ORIGIN='https://www.gemrate.com',DAY=86400000;
  const day=at=>new Date(Date.parse(at)+9*3600000).toISOString().slice(0,10);
  function url(set){return ORIGIN+'/item-details?'+new URLSearchParams({grader:'psa',year:String(set.year),category:'tcg-cards',set_name:set.set});}
  function samePage(value,set){try{const a=new URL(value),b=new URL(url(set));return a.origin===b.origin&&a.pathname===b.pathname&&!a.hash&&[...a.searchParams].length===4&&[...b.searchParams].every(([k,v])=>a.searchParams.get(k)===v);}catch{return false;}}
  function groups(scope,reference,collection={version:1,sets:[]}){
    if(scope?.version!==1||reference?.version!==2||reference.source!=='GemRate'||reference.grader!=='PSA')throw Error('公開設定の版不一致');
    if(collection.version!==1||!Array.isArray(collection.sets))throw Error('取得設定の版不一致');
    const all=[...scope.sets,...collection.sets];
    if(new Set(all.map(s=>s.setCode)).size!==all.length||new Set(all.map(s=>s.year+'|'+s.set)).size!==all.length)throw Error('取得セット重複');
    return all.filter(s=>s.language==='Japanese'&&s.grader==='PSA'&&/^[A-Z0-9-]+$/.test(s.setCode)&&s.set.startsWith('Pokemon Japanese ')).map(s=>{
      const rows=Object.values(reference.cards).filter(r=>samePage(r[4],s));return {...s,url:url(s),cards:rows.length,baselineDate:rows.map(r=>r[3]).sort().at(-1)||null};
    });
  }
  function choose(sets,state,at){
    const due=sets.filter(s=>{const old=state.sets?.[s.setCode];return !old?.hold&&old?.checkedDay!==day(at)&&!(old?.retryAt>Date.parse(at))&&!(old?.attemptDay===day(at)&&old.attempts>=2);});
    if((state.attempts||state.checks||[]).filter(c=>day(c.at)===day(at)).length>=25)return null;
    // Existing sets all retain a daily slot; approved new sets have a separate one/day slot.
    return due.filter(s=>s.cards||state.newSetDay!==day(at)).sort((a,b)=>Number(b.cards>0)-Number(a.cards>0)||(state.sets?.[a.setCode]?.checkedAt||'').localeCompare(state.sets?.[b.setCode]?.checkedAt||'')||(b.priority||0)-(a.priority||0)||a.setCode.localeCompare(b.setCode))[0]||null;
  }
  function decide(set,old,page,{testExport=false}={}){
    if(!samePage(page.url,set)||page.grader!=='psa'||page.category!=='tcg-cards'||page.language!=='Japanese'||page.set!==set.set||Number(page.year)!==set.year)throw Error('ページの言語・セット・鑑定会社・URLが不一致');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(page.updated)||new Date(page.updated).toISOString().slice(0,10)!==page.updated||page.updated>day(page.checkedAt))throw Error('元基準日が無効');
    if(!Number.isSafeInteger(page.csvRows)||page.csvRows<=0||![page.setTotals?.psa10,page.setTotals?.total].every(Number.isSafeInteger)||page.setTotals.psa10<0||page.setTotals.psa10>page.setTotals.total)throw Error('公開件数・合計の根拠不足');
    const baseline=[set.baselineDate,old?.exportedDate].filter(Boolean).sort().at(-1)||null;
    if(baseline&&page.updated<baseline)throw Error('元基準日が後退');
    if(old?.sourceDate===page.updated&&old?.totals&&JSON.stringify(old.totals)!==JSON.stringify(page.setTotals))throw Error('同じ元基準日で枚数が矛盾');
    return {exportCsv:testExport||!baseline||page.updated>baseline,newSourceDate:Boolean(baseline&&page.updated>baseline),baselineDate:baseline,firstSet:!baseline,testExport};
  }
  function claim(download,job){
    if(!job?.exportRequestedAt||job.downloadId!=null||!samePage(download.referrer,job.set))return false;
    const t=Date.parse(download.startTime)-Date.parse(job.exportRequestedAt);
    return t>=-1000&&t<=120000&&String(download.url).startsWith('blob:'+ORIGIN+'/')&&/\.csv$/i.test(download.filename||'');
  }
  function readPage(){
    const text=document.body?.innerText||'';
    if(/captcha|access denied|403 forbidden|attention required|sign in to continue/i.test(text.slice(0,4000)))return {error:'access-page-visible'};
    const value=id=>document.getElementById(id)?.value;
    const updated=Array.from(document.querySelectorAll('small')).map(e=>e.innerText).join('\n').match(/Updated:\s*(\d{4}-\d{2}-\d{2})/)?.[1];
    const h=Array.from(document.querySelectorAll('h5')).map(e=>e.innerText).join('\n');
    const number=re=>{const m=h.match(re);return m?Number(m[1].replaceAll(',','')):null;};
    const count=Array.from(document.querySelectorAll('.ag-status-bar')).map(e=>e.innerText).join('\n').match(/Rows\s*:\s*([\d,]+)/)?.[1];
    if(!updated||!count||!document.getElementById('csv_download'))return {error:'page-not-ready'};
    return {url:location.href,grader:value('grader'),category:value('category'),year:Number(value('year')),set:value('set_name'),language:'Japanese',updated,checkedAt:new Date().toISOString(),csvRows:Number(count.replaceAll(',','')),setTotals:{psa10:number(/Total Gems\s*([\d,]+)/),total:number(/Total Grades\s*([\d,]+)/)}};
  }
  const api={day,url,samePage,groups,choose,decide,claim,readPage,DAY};if(typeof module==='object')module.exports=api;else root.GemRateCollector=api;
})(typeof self==='object'?self:globalThis);
