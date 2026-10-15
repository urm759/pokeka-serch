const fs=require('node:fs');
async function run(){
  const saved=fs.existsSync('work/dorasuta-access-probe.json')?JSON.parse(fs.readFileSync('work/dorasuta-access-probe.json','utf8')):[];
  const policy=fs.existsSync('data/additional-shop-access-audit.json')?JSON.parse(fs.readFileSync('data/additional-shop-access-audit.json','utf8')).dorasuta:null;
  if(policy?.status==='access-stopped'||saved.some(r=>[401,403].includes(r.status))){console.log(JSON.stringify({status:'manual-wait',httpRequests:0,reason:'Previous protected access retained. Official access/permission review is required before a new pilot.'}));return;}
  const out=[];
  for(const [id,url] of [['robots','https://dorasuta.jp/robots.txt'],['home','https://dorasuta.jp/pokemon-card']]){
    if(out.length)await new Promise(r=>setTimeout(r,5000));
    const start=Date.now();
    try{
      const r=await fetch(url,{signal:AbortSignal.timeout(20000)}),text=await r.text();
      fs.writeFileSync('work/dorasuta-probe-'+id+'.txt',text);
      out.push({url,status:r.status,at:new Date().toISOString(),ms:Date.now()-start,bytes:Buffer.byteLength(text),
        title:text.match(/<title>([\s\S]*?)<\/title>/i)?.[1]||null,
        sample:id==='robots'?text.slice(0,2000):[...text.matchAll(/href="([^"]*products[^"]*)"/g)].slice(0,8).map(m=>m[1])});
      if([401,403,429].includes(r.status))break;
      if(id==='robots'&&r.ok&&/Disallow:\s*\/\s*(?:\r?\n|$)/i.test(text)){out.at(-1).stopReason='robots disallows root; automatic collection not started';break;}
    }catch(e){out.push({url,error:e.message,ms:Date.now()-start});break;}
  }
  fs.writeFileSync('work/dorasuta-access-probe.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));
}
if(require.main===module)run();module.exports={run};
