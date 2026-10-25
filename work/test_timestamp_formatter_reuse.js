const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const app=fs.readFileSync(require('path').join(__dirname,'../app.js'),'utf8');
const start=app.indexOf('function formatJstTimestamp('),end=app.indexOf('\nfunction ',start+1);
let constructors=0;
const context={Date,Intl:{DateTimeFormat:function(...args){constructors++;return new Intl.DateTimeFormat(...args);}}};
vm.createContext(context);vm.runInContext(app.slice(start,end),context);
const options={timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'};
for(const value of ['2026-10-25T06:11:38Z','2026-01-01T15:00:00Z','2026-12-31T23:59:59Z']) {
  assert.equal(context.formatJstTimestamp(value),new Date(value).toLocaleString('ja-JP',options));
}
assert.equal(context.formatJstTimestamp(null),'未記録');
assert.equal(context.formatJstTimestamp('2026-10-25'),'2026-10-25（時刻未取得）');
assert.equal(context.formatJstTimestamp('invalid'),'invalid');
for(let i=0;i<1000;i++)context.formatJstTimestamp('2026-10-25T06:11:38Z');
assert.equal(constructors,1,'reuse the immutable locale/time-zone formatter without caching stale timestamps');
console.log('PASS timestamp formatting: same JST text, missing/invalid dates, one formatter for repeated detail rows');
