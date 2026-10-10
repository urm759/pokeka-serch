const fs = require('node:fs'), path = require('node:path');
const model = require('../psa-plan-model');
const {atomicWrite, classify} = require('./acquisition_retry');
const OUTPUT = path.join(__dirname,'../data/psa-japan-services.json');
const URL = 'https://www.psacard.com/ja-JP/services/trad';
async function main() {
  const at = new Date().toISOString();
  const previous = fs.existsSync(OUTPUT) ? JSON.parse(fs.readFileSync(OUTPUT,'utf8')) : {};
  let parsed;
  try {
    const response = await fetch(URL,{headers:{'user-agent':'Mozilla/5.0 PSA-Japan-plan-monitor'},signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error(`PSA Japan HTTP ${response.status}`);
    const html = await response.text();
    if (/just a moment|verify you are human|cf-chl-/i.test(html)) throw new Error('PSA Japan Cloudflare・正規認証待ち');
    parsed = model.parse(html);
    if (parsed.some(p=>!p.plan)) throw new Error('PSA Japan format: '+parsed.filter(p=>!p.plan).map(p=>p.name+':'+p.reason).join('／'));
    const date = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
    const value = {updatedAt:date,checkedAt:date,verifiedAt:at,lastAttemptAt:at,checkStatus:'success',fetchMethod:'official-direct',sourceUrl:URL,handlingFee:1000,
      plans:parsed.map(p=>({...p.plan,verifiedAt:at,validationStatus:'valid'})),suspendedPlans:/バリュー.*受付.*停止/.test(html)?['バリュー']:[]};
    atomicWrite(OUTPUT,value,0); console.log(JSON.stringify({completionStatus:'success',acquired:3,updated:3}));
  } catch(error) {
    const plans = model.definitions.map(([id,name])=>{
      const old = previous.plans?.find(p=>p.id===id), candidate=parsed?.find(p=>p.id===id);
      if (candidate?.plan) return {...candidate.plan,verifiedAt:at,validationStatus:'valid'};
      const reason = candidate?.reason || model.problem(old);
      return {...old,id,name,...(reason ? {validationStatus:'held',validationReason:reason} : {})};
    });
    atomicWrite(OUTPUT,{...previous,plans,lastAttemptAt:at,checkStatus:'failed',checkError:error.message,
      failureKind:classify(error).kind,fetchMethod:'official-direct-no-bypass'},0);
    console.error('PSA Japan refresh failed; previous verified values retained: '+error.message);
    process.exitCode=1;
  }
}
if(require.main===module)main();
module.exports={main};
