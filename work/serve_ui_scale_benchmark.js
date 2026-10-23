const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const doubled=require('./ui_double_fixture').fixture(root);
const frozen=new Map(), evaluatedAt=Date.now();
const extTypes={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1'),match=url.pathname.match(/^\/(normal|double)\/(.*)$/);
  if(!match || req.method!=='GET'){res.writeHead(404);res.end();return;}
  const name=decodeURIComponent(match[2]||'index.html'),ext=path.extname(name);
  if(name.includes('..')||name.includes('\\')||!(name.startsWith('data/')&&ext==='.json'||!name.includes('/')&&extTypes[ext])){res.writeHead(404);res.end();return;}
  try{
    if(!frozen.has(name))frozen.set(name,fs.readFileSync(path.join(root,name)));
    let body=match[1]==='double'&&doubled.get(name)||frozen.get(name);
    if(name==='index.html')body=Buffer.from(body.toString().replace('<head>',`<head><script>const ClockDate=Date;Date=class extends ClockDate{constructor(...args){super(...(args.length?args:[${evaluatedAt}]))}static now(){return ${evaluatedAt}}};</script>`));
    res.writeHead(200,{'Content-Type':extTypes[ext],'Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end();}
});
server.listen(8771,'127.0.0.1',()=>console.log(JSON.stringify({normal:'http://127.0.0.1:8771/normal/',double:'http://127.0.0.1:8771/double/',evaluatedAt:new Date(evaluatedAt).toISOString(),scope:'loopback only / in-memory synthetic double / fixed evaluation clock / no publication'})));
