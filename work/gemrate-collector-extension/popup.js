const api=msg=>chrome.runtime.sendMessage(msg);
function show(s){document.getElementById('enabled').checked=s.enabled===true;document.getElementById('status').textContent=JSON.stringify({enabled:s.enabled,targets:s.config?.length,active:s.active?.set?.setCode,checks:s.checks?.slice(-12),holds:Object.fromEntries(Object.entries(s.sets||{}).filter(([,s])=>s.hold).map(([id,s])=>[id,s.hold])),error:s.error},null,2);}
document.getElementById('enabled').addEventListener('change',async e=>show(await api({type:'enabled',value:e.target.checked})));
document.getElementById('test').addEventListener('click',async e=>{e.target.disabled=true;const s=await api({type:'test-one'});if(s.error)document.getElementById('status').textContent=s.error;else show(s);});
api({type:'status'}).then(show);
