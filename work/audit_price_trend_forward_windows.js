// Deterministic offline audit. Never feeds prices, thresholds or buy decisions.
const fs = require('node:fs');
const path = require('node:path');
const { pairs, readSaved, priceWindows } = require('./price_gap_observations');
const { calendarDay } = require('./psa10_observation_evidence');
const DAY = 86400000;
const root = path.resolve(__dirname,'..');
const read = file => JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));

function audit(asOf = calendarDay(new Date().toISOString())) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isFinite(Date.parse(asOf))) throw Error('Expected YYYY-MM-DD evaluation day');
  const cards = read('data/pokemon-cards.json');
  const history = read('work/market_stability_history.json').cards;
  const saved = readSaved(root);
  const end = Date.parse(asOf);
  const cutoff = calendar => new Date(calendar).toISOString().slice(0,10);
  // Fixed date split with an embargo: all development outcomes finish before
  // the first evaluation signal. Only dated observations before each signal
  // enter its windows, and only later observations enter its outcome.
  const split = end-21*DAY;
  const result = {asOf, calibrationEndsBefore:cutoff(split), evaluationStarts:cutoff(split),
    cards:cards.length, cardsWithPairedObservations:0, maximumPairedDays:0,
    eligible:{development:0,evaluation:0}, checks:{}, sourceRequests:0, llmCalls:0,
    note:'75 complete observed days and 7 subsequent observed days required for this audit. Later quoted prices are a proxy; no evidence of future transactions or demand.'};
  for (const card of cards) {
    if (card.identityReviewRequired || card.language!=='ja' || !card.identityKey) continue;
    const {rows} = pairs(history[card.id],card,end+15*3600000-1,saved[card.id]);
    if (!rows.length) continue;
    result.cardsWithPairedObservations++;
    result.maximumPairedDays=Math.max(result.maximumPairedDays,rows.length);
    if (rows.length<82) continue;
    const dates=new Map(rows.map(row=>[row.date,row]));
    for (const signal of rows) {
      const date=Date.parse(signal.date);
      const outcomeEnd=date+7*DAY;
      const partition=outcomeEnd<split?'development':date>=split&&outcomeEnd<=end?'evaluation':null;
      if(!partition)continue;
      const before = rows.filter(row => row.date<=signal.date);
      const after = Array.from({length:7},(_,i)=>dates.get(cutoff(date+(i+1)*DAY)));
      if (after.some(row=>!row)) continue;
      const windows=priceWindows(before,signal.date);
      if(windows.psa10[75]?.[1]!==75)continue;
      result.eligible[partition]++;
      for(const field of ['psa10','raw']){
        const trend=Math.sign(windows[field][30][0]/windows[field][75][0]-1);
        const laterMean=after.reduce((sum,row)=>sum+row[field],0)/after.length;
        const actual=Math.sign(laterMean/windows[field][7][0]-1);
        const stats=result.checks[partition+'-'+field]||={samples:0,matches:0,flatBaselineMatches:0};
        stats.samples++;
        if(trend===actual)stats.matches++;
        if(actual===0)stats.flatBaselineMatches++;
      }
    }
  }
  result.status=result.eligible.evaluation ? 'descriptive-forward-comparison-no-trained-model' : 'insufficient-forward-windows';
  return result;
}

function recordDaily({directory=root,now=new Date(),compute=audit}={}) {
  const day=calendarDay(now.toISOString());
  const file=path.join(directory,'data/price-trend-forward-audit.json');
  const history=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{version:1,days:{}};
  if(history.version!==1 || !history.days || Array.isArray(history.days))throw Error('Unknown trend audit history format');
  if(history.days[day])return history.days[day];
  const result=compute(day);
  if(result.asOf!==day)throw Error('Trend audit calendar day mismatch');
  history.days[day]={...result,recordedAt:now.toISOString()};
  require('./acquisition_retry').atomicWrite(file,history,0);
  return history.days[day];
}

if (require.main===module) console.log(JSON.stringify(audit(process.argv[2]),null,2));
module.exports={audit,recordDaily};
