importScripts('core.js');
const C=GemRateCollector,KEY='collector',BASE='https://urm759.github.io/pokeka-serch/';
let running=false;
const get=async()=>((await chrome.storage.local.get(KEY))[KEY]||{enabled:false,sets:{},checks:[]});
const save=state=>chrome.storage.local.set({[KEY]:state});
const alarm=()=>chrome.alarms.create('gemrate-tick',{periodInMinutes:1});
async function config(){
  const read=async f=>{let r;try{r=await fetch(BASE+f,{credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});}catch(e){e.temporary=true;throw e;}if(!r.ok){const e=Error('公開設定HTTP '+r.status);e.temporary=r.status===429||r.status>=500;throw e;}return r.json();};
  const focus=await read('work/pop-focus-targets.json');const sets=new Set((focus.rows||[]).map(r=>r.setCode));
  return C.groups(await read('work/gemrate-reviewed-sets.json'),await read('data/gemrate-reference-summary.json'),await read('work/gemrate-collection-sets.json')).map(s=>({...s,priority:sets.has(s.setCode)?1:0})).sort((a,b)=>b.priority-a.priority);
}
async function jsonReceipt(job,download=null){
  const receipt={version:1,kind:'gemrate-normal-csv-v1',jobId:job.id,setCode:job.set.setCode,page:job.page,decision:job.decision,download:download?{id:download.id,url:download.url,referrer:download.referrer,startTime:download.startTime,endTime:download.endTime,state:download.state,fileSize:download.fileSize}:null};
  await writeReceipt(receipt);
}
async function writeReceipt(receipt){
  const url='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(receipt)),filename='GemRate-Auto/pending/'+receipt.jobId+'/receipt.json';
  const old=(await chrome.storage.local.get('receiptIntents')).receiptIntents||{};
  const intents=Object.fromEntries(Object.entries(old).filter(([,r])=>Date.now()-r.at<86400000));
  intents[receipt.jobId]={url,filename,at:Date.now()};
  await chrome.storage.local.set({receiptIntents:intents});
  await chrome.downloads.download({url,filename,saveAs:false,conflictAction:'uniquify'});
}
async function finish(state,job,download=null){
  await jsonReceipt(job,download);
  const old=state.sets[job.set.setCode]||{};
  state.sets[job.set.setCode]={...old,checkedAt:job.page.checkedAt,checkedDay:C.day(job.page.checkedAt),sourceDate:job.page.updated,totals:job.page.setTotals,...(download?{exportedDate:job.page.updated}:{})};
  if(!job.set.cards)state.newSetDay=C.day(job.page.checkedAt);
  state.checks=[...(state.checks||[]),{set:job.set.setCode,at:job.page.checkedAt,sourceDate:job.page.updated,csv:Boolean(download),newDate:job.decision.newSourceDate}].slice(-100);
  state.active=null;state.nextAllowedAt=Date.now()+60000;await save(state);await chrome.tabs.remove(job.tabId).catch(()=>{});
}
async function hold(state,job,reason){
  const at=new Date().toISOString(),stage=job.exportRequestedAt?'csv-receipt':'provider-check',old=state.sets[job.set.setCode]||{};
  const temporary=!job.exportRequestedAt&&/page-not-ready|読込期限超過|No tab with id/i.test(reason);
  state.sets[job.set.setCode]={...old,...(temporary?{retryAt:Date.now()+3600000,attemptDay:C.day(at),attempts:(old.attemptDay===C.day(at)?old.attempts||0:0)+1}:{hold:{at,stage,reason}})};
  await writeReceipt({version:1,kind:'gemrate-source-hold-v1',jobId:job.id,setCode:job.set.setCode,url:job.set.url,at,stage,reason,temporary}).catch(()=>{});
  state.active=null;state.nextAllowedAt=Date.now()+60000;await save(state);await chrome.tabs.remove(job.tabId).catch(()=>{});
}
async function inspect(state,job){
  const result=await chrome.scripting.executeScript({target:{tabId:job.tabId},func:C.readPage});const page=result[0]?.result;
  if(page?.error==='page-not-ready'&&Date.now()-job.openedAt<60000)return;
  if(!page||page.error)throw Error(page?.error||'ページ確認失敗');
  const decision=C.decide(job.set,state.sets[job.set.setCode],page,{testExport:job.testExport});job.page=page;job.decision=decision;
  if(!decision.exportCsv){await finish(state,job);return;}
  // Persist intent before clicking once. A timeout/restart never re-clicks an uncertain export.
  job.exportRequestedAt=new Date().toISOString();state.active=job;await save(state);
  await chrome.scripting.executeScript({target:{tabId:job.tabId},func:()=>{const b=document.getElementById('csv_download');if(!b||b.disabled)throw Error('通常CSVボタンなし');b.click();}});
}
async function tick(){
  if(running)return;running=true;
  try{
    const state=await get();if(!state.enabled)return;
    if(state.active){const job=state.active;
      if(job.exportRequestedAt){
        if(job.downloadId!=null){const rows=await chrome.downloads.search({id:job.downloadId});const d=rows[0];if(d?.state==='complete'){if(!d.filename.replaceAll('\\','/').endsWith('/GemRate-Auto/pending/'+job.id+'/export.csv'))throw Error('CSV保存先が競合');await finish(state,job,d);return;}if(d?.state==='interrupted')throw Error('CSVダウンロード中断');}
        if(Date.now()-Date.parse(job.exportRequestedAt)>120000)throw Error('CSV受領根拠未確認・再クリックしない');return;
      }
      if(Date.now()-job.openedAt>90000)throw Error('公開ページ読込期限超過');await inspect(state,job);return;
    }
    if(Date.now()<(state.nextAllowedAt||0))return;
    if(state.configDay!==C.day(new Date().toISOString())){state.config=await config();state.configDay=C.day(new Date().toISOString());await save(state);}
    const set=C.choose(state.config,state,new Date().toISOString());if(!set)return;
    state.attempts=[...(state.attempts||[]),{set:set.setCode,at:new Date().toISOString()}].slice(-100);await save(state);
    const tab=await chrome.tabs.create({url:set.url,active:false});state.active={id:crypto.randomUUID(),set,tabId:tab.id,openedAt:Date.now(),testExport:false};await save(state);
  }catch(e){const state=await get();if(state.active)await hold(state,state.active,e.message);else{if(e.temporary)state.nextAllowedAt=Date.now()+3600000;else state.enabled=false;state.error={at:new Date().toISOString(),reason:e.message};await save(state);}}
  finally{running=false;}
}
chrome.downloads.onDeterminingFilename.addListener((item,suggest)=>{
  (async()=>{
    const intents=(await chrome.storage.local.get('receiptIntents')).receiptIntents||{},receipt=C.receiptFilename(item,intents);
    if(receipt){suggest({filename:receipt,conflictAction:'uniquify'});return;}
    const state=await get(),job=state.active;
    if(!C.claim(item,job)){suggest();return;}
    job.downloadId=item.id;await save(state);suggest({filename:'GemRate-Auto/pending/'+job.id+'/export.csv',conflictAction:'uniquify'});
  })().catch(()=>suggest());return true;
});
chrome.downloads.onChanged.addListener(delta=>{if(delta.state)void tick();});
chrome.tabs.onUpdated.addListener((id,change)=>{if(change.status==='complete')void get().then(s=>{if(s.active?.tabId===id)void tick();});});
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='gemrate-tick')void tick();});
chrome.runtime.onStartup.addListener(()=>{void alarm();void tick();});
chrome.runtime.onInstalled.addListener(()=>{void alarm();});
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  if(sender.id!==chrome.runtime.id)return;
  (async()=>{const state=await get();
    if(msg.type==='status')return state;
    if(msg.type==='enabled'){state.enabled=msg.value===true;await save(state);await alarm();void tick();return state;}
    if(msg.type==='test-one'){
      if(state.active)throw Error('実行中・重複試験を停止');
      if(state.testIntent)throw Error('単発試験は受領確認後にのみ再設定');
      const sets=await config(),set=sets.find(s=>s.cards);if(!set)throw Error('確認済み対象なし');
      state.testIntent=new Date().toISOString();state.attempts=[...(state.attempts||[]),{set:set.setCode,at:state.testIntent}].slice(-100);await save(state);state.enabled=true;const tab=await chrome.tabs.create({url:set.url,active:false});state.active={id:crypto.randomUUID(),set,tabId:tab.id,openedAt:Date.now(),testExport:true};await save(state);await alarm();return state;
    }
    throw Error('Unknown collector message');
  })().then(reply,e=>reply({error:e.message}));return true;
});
void alarm();
