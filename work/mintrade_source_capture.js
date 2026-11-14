// Private original responses from existing normal requests only. No fetch,
// public source replacement, inferred price, or observation-time mutation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
function eligible(url){try{const u=new URL(url);return u.origin==='https://toreca-souba.com'&&!u.username&&!u.password&&(u.pathname==='/cards'||u.pathname.startsWith('/_next/static/'));}catch{return false;}}
function save(root,{url,text,status=200,at=new Date().toISOString()},env=process.env){
 if(!eligible(url)||status!==200||!Number.isFinite(Date.parse(at)))throw Error('Invalid mintrade response evidence');
 const bytes=Buffer.from(text,'utf8');if(bytes.length>32*1024*1024)throw Error('Mintrade private response exceeds evidence budget');
 const hash=crypto.createHash('sha256').update(bytes).digest('hex'),folder=path.join(root,'.private','mintrade-source-captures'),file=hash+'.txt.gz';fs.mkdirSync(folder,{recursive:true});
 if(!fs.existsSync(path.join(folder,file)))fs.writeFileSync(path.join(folder,file),zlib.gzipSync(bytes),{flag:'wx'});
 const receipt={url,confirmedAt:at,httpStatus:status,sha256:hash,bytes:bytes.length,file,workflowRunId:env.GITHUB_RUN_ID||null,workflowAttempt:env.GITHUB_RUN_ATTEMPT||null,encoding:'decoded-response-text/utf8',sourceRequests:0};
 const receiptName=crypto.createHash('sha256').update(JSON.stringify([url,at,hash,receipt.workflowRunId])).digest('hex')+'.json';fs.writeFileSync(path.join(folder,receiptName),JSON.stringify(receipt),{flag:'wx'});return receipt;
}
module.exports={save,eligible};
