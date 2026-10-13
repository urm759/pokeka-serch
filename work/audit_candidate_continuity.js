const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),path=require('node:path');
const {snapshot,extraUrl,bindings}=require('./audit_candidate_reduction'),{compare}=require('../candidate-reduction-model');
const {userUrl}=require('./audit_efficiency_thresholds');
const root=path.join(__dirname,'..'),before='b0bf0a1f',at=new Date().toISOString();
const source=fs.readFileSync(path.join(root,'app.js'),'utf8'),old=cp.execFileSync('git',['show',before+':app.js'],{cwd:root,encoding:'utf8',maxBuffer:10000000});
const oldAt='2026-10-13T02:50:00Z';
const profiles=[];
for(const [name,url]of [['latest-shared',userUrl()],['legacy-20pct',require('./audit_search_profit_consistency').specifiedUrl]]) {
  const original=snapshot({source:old,ref:before,at:oldAt,url});
  assert.deepEqual(original.missingHistoricalInputs,[],'do not silently substitute current data for missing historical inputs');
  const oldDataNow=snapshot({source:old,ref:before,at,url}),newDataOldCode=snapshot({source:old,at,url}),current=snapshot({source,at,url});
  assert.equal(newDataOldCode.calculationHash,current.calculationHash,'same data/time/settings: no financial change');
  const code=compare(newDataOldCode,current);assert.equal(code.lostCount+code.gainedCount,0);
  const savedFile=path.join(root,fs.existsSync(path.join(root,'work/runtime-saved-conditions.json'))?'work/runtime-saved-conditions.json':'work/candidate-reduction-saved-extras-latest.json');
  const saved=fs.existsSync(savedFile)?JSON.parse(fs.readFileSync(savedFile,'utf8')):null;
  const overlay=saved?snapshot({source,at,url:extraUrl(saved,url)}):null;
  profiles.push({name,url,beforeRef:before,oldAt,at,counts:current.counts,
    timeOnly:{from:oldAt,to:at,...compare(original,oldDataNow)},
    dataOnly:{at,...compare(oldDataNow,newDataOldCode)},codeOnly:{at,...code},
    recordedSavedOverlay:saved?{capturedAt:saved.observedAt,inputs:Object.fromEntries(Object.entries(saved.inputs||{}).filter(([id])=>Object.hasOwn(bindings,id)&&id!=='efficiencyManualPriceInput')),...compare(current,overlay)}:null});
}
const report={version:1,at,profiles,financialModelChanged:false,
  limitations:'直近共有URLは明示設定を優先。保存追加条件は記録された端末・時刻のものだけで、現在の利用端末を断定しない。時間→データ→コードの順に一因だけ変更。同一ID群で比較し、重複除外理由は離脱数と別。未保存期間は比較不能。',llmCalls:0,codexCalls:0};
fs.writeFileSync(path.join(root,'data/candidate-continuity-audit.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(profiles.map(p=>({name:p.name,count:p.counts.selected,time:p.timeOnly.lostCount,data:p.dataOnly.lostCount,gained:p.dataOnly.gainedCount,code:p.codeOnly.lostCount}))));
