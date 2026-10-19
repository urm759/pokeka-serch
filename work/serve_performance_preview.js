const http = require('node:http'),fs = require('node:fs'),path = require('node:path'),zlib = require('node:zlib');
const {execFileSync} = require('node:child_process');
const root = path.join(__dirname,'..');
const doubled = require('./ui_double_fixture').fixture(root);
const before = Object.fromEntries(['app.js','index.html','styles.css','decision-model.js','price-integrity.js','current-market-model.js','exploration-metrics.js','update-health-banner.js'].map(f => [f,Buffer.from(execFileSync('git',['show',`${process.env.PERFORMANCE_BASE_COMMIT || 'ceba99b4'}:${f}`],{cwd:root,maxBuffer:8*1024*1024}))]));
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8'};
// Local benchmark adapter only: identical POP evidence, legacy wire representation.
const legacy = [false,true].map(double=>{
  const files=new Map(),manifest=JSON.parse((double&&doubled.get('data/ui/manifest.json')||fs.readFileSync(path.join(root,'data/ui/manifest.json'))).toString());
  for(let i=0;i<32;i++){
    const file=`data/psa-pop-glance/${String(i).padStart(2,'0')}.json`;
    const data=JSON.parse((double&&doubled.get(file)||fs.readFileSync(path.join(root,file))).toString());
    const cards=Object.fromEntries(Object.entries(data.cards).filter(([,r])=>!Array.isArray(r)).map(([id,r])=>[id,{...r,at:new Date(r.at).toISOString(),windows:r.windows.map(w=>[w[0],w[1],w[2],new Date(w[3]).toISOString(),w[4]])}]));
    const body=Buffer.from(JSON.stringify({version:1,cards}));files.set(file,body);
    manifest.hashes[file]=require('node:crypto').createHash('sha256').update(body).digest('hex');manifest.bytes[file]=body.length;
  }
  manifest.revision+='-legacy-fixture';files.set('data/ui/manifest.json',Buffer.from(JSON.stringify(manifest)));return files;
});
http.createServer((req,res) => {
  const url = new URL(req.url,'http://127.0.0.1'), parts = url.pathname.split('/').filter(Boolean), mode = parts.shift();
  if (!['before','after','double','before-double'].includes(mode)) { res.writeHead(404).end(); return; }
  const file = parts.join('/') || 'index.html';
  const target = path.resolve(root,file);
  if (!target.startsWith(root+path.sep) || !(file.startsWith('data/') || /^[a-z0-9-]+\.(html|js|css)$/.test(file))) {res.writeHead(403).end();return;}
  try {
    let data = mode.startsWith('before') && (before[file]||legacy[mode.endsWith('double')?1:0].get(file)) || mode.endsWith('double') && doubled.get(file) || fs.readFileSync(target);
    const evaluationAt=process.env.PERFORMANCE_EVALUATION_AT;
    if(file==='index.html'&&evaluationAt) {
      const epoch=Date.parse(evaluationAt);if(!Number.isFinite(epoch))throw new Error('Invalid performance evaluation time');
      const fixture=`<meta name="performance-evaluation-time" content="${new Date(epoch).toISOString()}"><script>{const RealDate=Date;class FixtureDate extends RealDate{constructor(...args){super(...(args.length?args:[${epoch}]))}static now(){return ${epoch}}}window.Date=FixtureDate;}</script>`;
      // Only the localhost fixture is frozen; production HTML/data are untouched.
      data=Buffer.from(data.toString('utf8').replace('</head>',fixture+'</head>'));
    }
    if(file==='index.html' && process.env.PERFORMANCE_PROBE==='observation') {
      data=Buffer.from(data.toString('utf8').replace('</body>','<script>'+fs.readFileSync(path.join(__dirname,'observation_efficiency_browser_probe.js'),'utf8')+'</script></body>'));
    }
    const gzip = /gzip/.test(req.headers['accept-encoding'] || '');
    res.writeHead(200,{'content-type':types[path.extname(file)] || 'application/octet-stream','cache-control':'no-store',
      ...(gzip ? {'content-encoding':'gzip'} : {})});
    res.end(gzip ? zlib.gzipSync(data) : data);
  } catch { res.writeHead(404).end(); }
}).listen(Number(process.env.PERFORMANCE_PREVIEW_PORT || 8765),'127.0.0.1',()=>console.log('Local performance preview: before/after share identical current data; double is an isolated synthetic fixture.'));
