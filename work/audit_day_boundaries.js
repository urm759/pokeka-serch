const fs=require('node:fs'),path=require('node:path'),metrics=require('../exploration-metrics');
function audit(root=path.join(__dirname,'..'),now=Date.now()){
 const started=performance.now(),file=path.join(root,'data/buyback-observation-summary.json');if(!fs.existsSync(file))return {status:'unmeasured',reason:'input-unavailable',sourceRequests:0};
 const full=JSON.parse(fs.readFileSync(file,'utf8')),support=full.support;if(!support?.asOf)throw Error('Boundary audit source date unavailable');
 const compact=require('./build_ui_data').project('buyback-observation-summary',full),midnight=Date.parse(support.asOf)+864e5-9*36e5;
 const clocks=[['source-day-end',midnight-1000],['next-day-start',midnight+1000],['current',now]],rows=[],errors=[];
 for(const [clock,at]of clocks)for(const mode of ['all','mail']){let checked=0,unchanged=0,pending=0,unavailable=0;for(const id of Object.keys(support.meanWindows||{})){
   const identity=support.meanWindows[id].identity,raw=metrics.buybackSupport(full,id,mode,[],at,null,identity).meanWindows?.[75],view=metrics.buybackSupport(compact,id,mode,[],at,null,identity).meanWindows?.[75];checked++;
   if(view?.status==='recalculation-pending'){pending++;if(Number.isFinite(view.mean))errors.push({id,clock,mode,reason:'pending-adopted-as-current'});continue;}
   if(Number.isFinite(raw?.mean)&&Number.isFinite(view?.mean)){unchanged++;if(Math.abs(raw.mean-view.mean)>1e-12||raw.days!==view.days||raw.stores!==view.stores)errors.push({id,clock,mode,reason:'compact-raw-window-mismatch'});}
   else if(Number.isFinite(raw?.mean)!==Number.isFinite(view?.mean))errors.push({id,clock,mode,reason:'window-availability-mismatch'});else unavailable++;
 }
 rows.push({clock,at:new Date(at).toISOString(),mode,checked,unchanged,pending,unavailable});}
 return {version:1,checkedAt:new Date(now).toISOString(),sourceAsOf:support.asOf,status:errors.length?'error':'pass',rows,errors,durationMs:Math.round(performance.now()-started),sourceRequests:0,llmCalls:0,codexCalls:0,rule:'同じ原票・仕様/店舗条件でJST日付境界と現在時計を比較。期間内の同一集合だけ要約再利用。再集計待ちは正常0/現在値と区別。価格再取得なし。'};
}
if(require.main===module){const result=audit();fs.writeFileSync(path.join(__dirname,'day-boundary-audit.json'),JSON.stringify(result));console.log(JSON.stringify(result));if(result.status==='error')process.exitCode=1;}
module.exports={audit};
