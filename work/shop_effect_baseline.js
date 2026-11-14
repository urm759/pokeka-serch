const cp=require('node:child_process');
function resolve(root,selector,triggerCommit=process.env.GITHUB_SHA||null){
 const git=args=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const actual=git(['rev-parse','HEAD']);
 if(!/^[a-f0-9]{40}$/.test(actual))throw Error('Actual checkout commit unavailable');
 const reference=selector==='checkout'?actual:selector;
 if(!/^[a-f0-9]{40}$/.test(reference||''))throw Error('Explicit full reference SHA or checkout selector required');
 try{git(['cat-file','-e',reference+'^{commit}']);}catch{throw Error('Explicit shop-effect baseline unavailable; comparison retained as incomplete, never substitute a different baseline');}
 return {referenceCommit:reference,checkoutCommit:actual,triggerCommit:/^[a-f0-9]{40}$/.test(triggerCommit||'')?triggerCommit:null,
  referenceBasis:selector==='checkout'?'取得開始時の実チェックアウト版。待機中に進んだmainと起動イベントSHAは別。':'明示された旧比較コミット'};
}
module.exports={resolve};
