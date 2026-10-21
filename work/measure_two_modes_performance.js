const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const guard=require('./measure_performance_guard'),file=path.resolve('app.js'),original=fs.readFileSync;
const before=cp.execFileSync('git',['show','839d8685:app.js'],{maxBuffer:12000000});
const epoch=Date.now(),RealDate=Date;
class FixedDate extends RealDate {constructor(...args){super(...(args.length?args:[epoch]));}static now(){return epoch;}}
global.Date=FixedDate;
let old,current;
try {
  if(process.env.TWO_MODE_REVERSE==='1')current=guard.measure();
  fs.readFileSync=(name,encoding)=>path.resolve(String(name))===file?(encoding?before.toString(encoding):before):original(name,encoding);
  old=guard.measure();fs.readFileSync=original;if(!current)current=guard.measure();
}finally{fs.readFileSync=original;global.Date=RealDate;}
assert.equal(old.dataFingerprint,current.dataFingerprint);assert.equal(old.initialBytes,current.initialBytes);assert(current.calculationValuesEqual&&old.calculationValuesEqual);
const keys=['initialBytes','doubleInitialBytes','jsonParseMs','doubleJsonParseMs','fullCalculationMs','doubleCalculationMs','cacheMs','searchMs','doubleSearchMs'];
const report={at:new Date().toISOString(),evaluationAt:new Date(epoch).toISOString(),reference:'839d8685',sameData:true,repeats:3,runOrder:process.env.TWO_MODE_REVERSE==='1'?'after-before':'before-after',scope:'Node production calculation/index/JSON only; browser paint and compressed transfer are separate',before:Object.fromEntries(keys.map(k=>[k,old[k]])),after:Object.fromEntries(keys.map(k=>[k,current[k]])),errors:current.errors};
const historyFile='work/two-modes-performance-history.json',history=fs.existsSync(historyFile)?JSON.parse(fs.readFileSync(historyFile)):[];
if(!history.length&&fs.existsSync('work/two-modes-performance.json'))history.push(JSON.parse(fs.readFileSync('work/two-modes-performance.json')));
history.push(report);fs.writeFileSync(historyFile,JSON.stringify(history,null,2));
fs.writeFileSync('work/two-modes-performance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(current.errors.length)process.exitCode=1;
