const assert=require('node:assert/strict'),core=require('./gemrate-collector-extension/core');
async function check(kind){
  let callback,timer,clicks=0,disconnected=false;
  const anchor=(url='blob:https://www.gemrate.com/own')=>({nodeType:1,href:url,matches:s=>s==='a[download]',getAttribute:k=>k==='download'?'export.csv':url,querySelectorAll:()=>[]});
  class Observer{constructor(fn){callback=fn;}observe(){}disconnect(){disconnected=true;}}
  const button={disabled:false,click(){clicks++;if(kind==='timeout')return;callback([{addedNodes:kind==='multiple'?[anchor(),anchor('blob:https://www.gemrate.com/second')]:[anchor(kind==='external'?'blob:https://example.invalid/other':'blob:https://www.gemrate.com/own')]}]);}};
  const document={documentElement:{},getElementById:()=>button},location={href:'https://www.gemrate.com/item-details?fixture',origin:'https://www.gemrate.com'};
  const capture=Function('document','location','MutationObserver','setTimeout','clearTimeout','return ('+core.clickExportOnce.toString()+')')(document,location,Observer,fn=>{timer=fn;return 1;},()=>{});
  const result=capture(location.href);if(kind==='timeout')timer();
  if(kind==='valid'){const b=await result;assert.equal(b.url,'blob:https://www.gemrate.com/own');assert.equal(b.pageUrl,location.href);assert.equal(b.kind,'normal-export-dom-v1');}
  else await assert.rejects(result,/再クリックしない/);
  assert.equal(clicks,1,'no repeated click even when binding fails');assert(disconnected,'observer removed after success/failure');
}
(async()=>{for(const kind of ['valid','multiple','external','timeout'])await check(kind);console.log('PASS own normal-export DOM URL binding, multiple/other-origin rejection, bounded timeout, one click and observer cleanup');})().catch(e=>{console.error(e);process.exitCode=1});
