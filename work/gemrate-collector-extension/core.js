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
    const verified=Boolean(state.runtimeVersion&&state.exportBindingVersion===state.runtimeVersion);
    const due=sets.filter(s=>{const old=state.sets?.[s.setCode];return (!old?.hold||old.hold.stage==='csv-receipt')&&(old?.checkedDay!==day(at)||recoverableCsv(s,old,old?.sourceDate,verified))&&!(old?.retryAt>Date.parse(at))&&!(old?.attemptDay===day(at)&&old.attempts>=2);});
    if((state.attempts||state.checks||[]).filter(c=>day(c.at)===day(at)).length>=25)return null;
    // Existing sets all retain a daily slot; approved new sets have a separate one/day slot.
    return due.filter(s=>s.cards||state.newSetDay!==day(at)).sort((a,b)=>Number(b.cards>0)-Number(a.cards>0)||(state.sets?.[a.setCode]?.checkedAt||'').localeCompare(state.sets?.[b.setCode]?.checkedAt||'')||(b.priority||0)-(a.priority||0)||a.setCode.localeCompare(b.setCode))[0]||null;
  }
  function configDue(state,at){
    const now=Date.parse(at),last=Date.parse(state.configSyncedAt||'');
    return !state.configVersion||!Number.isFinite(last)||last>now||day(state.configSyncedAt)!==day(at)||now-last>=15*60000;
  }
  function applyConfig(state,config,at){
    if(config.schema!==1||!/^[a-f0-9]{64}$/.test(config.version)||!Array.isArray(config.targets)||!config.targets.length||config.targets.length>200)throw Error('取得設定の形式不一致');
    const codes=new Set(),urls=new Set();
    for(const s of config.targets){if(!/^[A-Z0-9-]+$/.test(s.setCode)||s.language!=='Japanese'||s.grader!=='PSA'||!Number.isSafeInteger(s.year)||!s.set.startsWith('Pokemon Japanese ')||!samePage(s.url,s)||!Number.isSafeInteger(s.cards)||s.cards<0||codes.has(s.setCode)||urls.has(s.url))throw Error('取得設定の仕様・重複不一致');codes.add(s.setCode);urls.add(s.url);}
    state.sets||={};
    for(const s of config.targets){const old=state.config?.find(r=>r.setCode===s.setCode);if(old&&(old.set!==s.set||old.year!==s.year||old.language!==s.language||old.grader!==s.grader)){
      const row=state.sets[s.setCode]||{};state.sets[s.setCode]={...row,...(!row.hold?{hold:{at,stage:'specification',reason:'公開設定の既存セット仕様変更・正規再照合待ち'}}:{})};
    }}
    if(state.configVersion!==config.version){
      state.configChanges={at,version:config.version,added:config.targets.filter(s=>!state.config?.some(o=>o.setCode===s.setCode)).map(s=>s.setCode),removed:(state.config||[]).filter(s=>!codes.has(s.setCode)).map(s=>s.setCode)};
      state.configHistory=[...(state.configHistory||[]),state.configChanges].slice(-20);
    }
    state.config=config.targets;state.configVersion=config.version;state.configSyncedAt=at;state.configDay=day(at);return state;
  }
  function recoverableCsv(set,old,date,verified){
    if(!verified||old?.hold?.stage!=='csv-receipt'||!Number.isFinite(Date.parse(old.hold.at||'')))return false;
    const baseline=[set.baselineDate,old.exportedDate].filter(Boolean).sort().at(-1)||'';
    return date>day(old.hold.at)&&date>baseline;
  }
  function decide(set,old,page,{testExport=false,bindingVerified=false}={}){
    if(!samePage(page.url,set)||page.grader!=='psa'||page.category!=='tcg-cards'||page.language!=='Japanese'||page.set!==set.set||Number(page.year)!==set.year)throw Error('ページの言語・セット・鑑定会社・URLが不一致');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(page.updated)||new Date(page.updated).toISOString().slice(0,10)!==page.updated||page.updated>day(page.checkedAt))throw Error('元基準日が無効');
    if(!Number.isSafeInteger(page.csvRows)||page.csvRows<=0||![page.setTotals?.psa10,page.setTotals?.total].every(Number.isSafeInteger)||page.setTotals.psa10<0||page.setTotals.psa10>page.setTotals.total)throw Error('公開件数・合計の根拠不足');
    const baseline=[set.baselineDate,old?.exportedDate].filter(Boolean).sort().at(-1)||null;
    if(baseline&&page.updated<baseline)throw Error('元基準日が後退');
    if(old?.sourceDate===page.updated&&old?.totals&&JSON.stringify(old.totals)!==JSON.stringify(page.setTotals))throw Error('同じ元基準日で枚数が矛盾');
    const csvHeld=old?.hold?.stage==='csv-receipt';
    const recovery=recoverableCsv(set,old,page.updated,bindingVerified);
    return {exportCsv:testExport||(!csvHeld||recovery)&&(!baseline||page.updated>baseline),newSourceDate:Boolean(baseline&&page.updated>baseline),baselineDate:baseline,firstSet:!baseline,testExport,
      ...(recovery?{receiptRecoveryForNewSourceDate:true}:{}),
      ...(csvHeld?{csvHeld:true,holdReason:old.hold.reason}: {})};
  }
  function bindingMatches(download,job){
    const b=job?.exportIntent;if(!b||b.kind!=='normal-export-dom-v1'||!samePage(b.pageUrl,job.set)||b.url!==download.url||!String(b.url).startsWith('blob:'+ORIGIN+'/')||!/\.csv$/i.test(b.downloadName||''))return false;
    const click=Date.parse(b.clickedAt),capture=Date.parse(b.capturedAt),start=Date.parse(download.startTime),requested=Date.parse(job.exportRequestedAt);
    const referrer=download.referrer||'';
    return [click,capture,start,requested].every(Number.isFinite)&&click>=requested-1000&&click<=requested+10000&&capture>=click&&capture<=click+5000&&start>=click-1000&&start<=click+120000&&(!referrer||referrer===ORIGIN+'/'||referrer===ORIGIN||samePage(referrer,job.set));
  }
  function claim(download,job){
    if(!job?.exportRequestedAt||job.downloadId!=null||!(samePage(download.referrer,job.set)||bindingMatches(download,job)))return false;
    if(job.bindingRequired&&!bindingMatches(download,job))return false;
    const t=Date.parse(download.startTime)-Date.parse(job.exportRequestedAt);
    return t>=-1000&&t<=120000&&String(download.url).startsWith('blob:'+ORIGIN+'/')&&/\.csv$/i.test(download.filename||'');
  }
  // Observe the normal export's own anchor; no guessed grid state, endpoint,
  // download-history scan, network interception or repeated button click.
  async function clickExportOnce(expectedPage){
    if(location.href!==expectedPage||location.origin!=='https://www.gemrate.com')throw Error('CSV出力ページが変更');
    const button=document.getElementById('csv_download');if(!button||button.disabled)throw Error('通常CSVボタンなし');
    const clickedAt=new Date().toISOString();
    return new Promise((resolve,reject)=>{
      let timer;const observer=new MutationObserver(records=>{
        const anchors=[];for(const r of records)for(const n of r.addedNodes){if(n.nodeType!==1)continue;if(n.matches?.('a[download]'))anchors.push(n);anchors.push(...(n.querySelectorAll?.('a[download]')||[]));}
        const csv=anchors.filter(a=>/\.csv$/i.test(a.getAttribute('download')||''));if(!csv.length)return;
        observer.disconnect();clearTimeout(timer);
        const unique=[...new Map(csv.map(a=>[a.href,a])).values()];
        if(unique.length!==1||!unique[0].href.startsWith('blob:https://www.gemrate.com/')){reject(Error('通常CSVの出力URLを一意に確認できない・再クリックしない'));return;}
        resolve({kind:'normal-export-dom-v1',url:unique[0].href,pageUrl:location.href,downloadName:unique[0].getAttribute('download'),clickedAt,capturedAt:new Date().toISOString()});
      });
      observer.observe(document.documentElement,{childList:true,subtree:true});
      timer=setTimeout(()=>{observer.disconnect();reject(Error('通常CSVの出力URL未確認・再クリックしない'));},3000);
      try{button.click();}catch(e){observer.disconnect();clearTimeout(timer);reject(e);}
    });
  }
  function receiptFilename(item,intents={}){
    const r=Object.values(intents).find(r=>r.url===item.url);
    return r&&/^GemRate-Auto\/pending\/[0-9a-f]{8}-[0-9a-f-]{27}\/receipt\.json$/.test(r.filename)?r.filename:null;
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
  const api={day,url,samePage,groups,choose,decide,recoverableCsv,claim,bindingMatches,clickExportOnce,receiptFilename,readPage,configDue,applyConfig,DAY};if(typeof module==='object')module.exports=api;else root.GemRateCollector=api;
})(typeof self==='object'?self:globalThis);
