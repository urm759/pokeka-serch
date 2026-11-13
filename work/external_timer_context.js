function parse(event){
 const at=event?.inputs?.timer_scheduled_at,id=event?.inputs?.timer_request_id;
 if(!at&&!id)return null;
 const valid=typeof at==='string'&&at.includes('T')&&Number.isFinite(Date.parse(at))&&typeof id==='string'&&/^cloud-wakeup-[0-9TZ:.+-]+$/.test(id)&&id.length<=100;
 return {valid,scheduledAt:valid?at:null,requestId:valid?id:null,verifiedOrigin:false,
  meaning:'外部起動の申告値。提供元確認日時・取得成功・自然定期の証明とは別。外部ログとAPI作成時刻の照合が必要。'};
}
function read(env=process.env){
 if(env.GITHUB_EVENT_NAME!=='workflow_dispatch'||!env.GITHUB_EVENT_PATH)return null;
 try{return parse(JSON.parse(require('node:fs').readFileSync(env.GITHUB_EVENT_PATH,'utf8')));}catch{return {valid:false,verifiedOrigin:false,reason:'起動イベントの証跡読込失敗'};}
}
module.exports={parse,read};
