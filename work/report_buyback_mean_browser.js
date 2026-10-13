const fs=require('node:fs'),assert=require('node:assert/strict');
const raw=JSON.parse(fs.readFileSync('work/buyback-mean-browser-raw.json','utf8')),unique=new Map();
for(const r of raw){const key=r.width+':'+r.mode;if(unique.has(key))assert.deepEqual(unique.get(key),r,'duplicate result read is not a new sample');else unique.set(key,r);}
assert.equal(unique.size,8);const median=xs=>xs.slice().sort((a,b)=>a-b)[Math.floor(xs.length/2)],pairs=[];
for(const width of [1440,390])for(const double of [false,true]) {
  const before=unique.get(width+':'+(double?'before-double':'before')),after=unique.get(width+':'+(double?'double':'after'));
  assert.equal(before.financialHash,after.financialHash);assert.deepEqual(before.ids,after.ids);assert.equal(after.displayed,60);
  const metrics=r=>({fullCalculationMs:median(r.samples.map(s=>s.full.calculationMs)),conditionDomMs:median(r.samples.map(s=>s.condition.domMs)),detailDomMs:median(r.samples.map(s=>s.detail.domMs)),initialJsonBytes:r.initialJsonBytes,jsonParseMs:r.jsonParseMs,transferredBytes:r.transferredBytes});
  pairs.push({width,double,loadedCards:after.loadedCards,before:metrics(before),after:metrics(after),financialHash:after.financialHash,idsMatch:true});
}
const report={version:1,at:new Date().toISOString(),baseline:'e406c099',evaluationAt:'2026-10-13T16:20:00Z',pairs,samples:[...unique.values()],
  rule:'同じ国内判断データ・設定・60枚・各3回。390pxは同じPCの幅で実機ではない。コード非選択時の金融値/ID一致。平均要約追加の通信増を隠さない。解析/通信はページ1読込、計算/DOMは3回中央値。Paint完了とは別',
  duplicateResultReads:raw.length-unique.size,notCompleted:'このブラウザ検証は定期取得・保存・公開成功の証明ではない'};
fs.writeFileSync('data/buyback-mean-browser-validation.json',JSON.stringify(report));console.log(JSON.stringify(pairs));
