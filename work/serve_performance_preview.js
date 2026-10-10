const http = require('node:http'),fs = require('node:fs'),path = require('node:path'),zlib = require('node:zlib');
const {execFileSync} = require('node:child_process');
const root = path.join(__dirname,'..');
const doubled = require('./ui_double_fixture').fixture(root);
const before = Object.fromEntries(['app.js','index.html'].map(f => [f,Buffer.from(execFileSync('git',['show',`eea00178:${f}`],{cwd:root,maxBuffer:8*1024*1024}))]));
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8'};
http.createServer((req,res) => {
  const url = new URL(req.url,'http://127.0.0.1'), parts = url.pathname.split('/').filter(Boolean), mode = parts.shift();
  if (!['before','after','double'].includes(mode)) { res.writeHead(404).end(); return; }
  const file = parts.join('/') || 'index.html';
  const target = path.resolve(root,file);
  if (!target.startsWith(root+path.sep) || !(file.startsWith('data/') || /^[a-z0-9-]+\.(html|js|css)$/.test(file))) {res.writeHead(403).end();return;}
  try {
    const data = mode === 'before' && before[file] || mode === 'double' && doubled.get(file) || fs.readFileSync(target);
    const gzip = /gzip/.test(req.headers['accept-encoding'] || '');
    res.writeHead(200,{'content-type':types[path.extname(file)] || 'application/octet-stream','cache-control':'no-store',
      ...(gzip ? {'content-encoding':'gzip'} : {})});
    res.end(gzip ? zlib.gzipSync(data) : data);
  } catch { res.writeHead(404).end(); }
}).listen(8765,'127.0.0.1',()=>console.log('Local performance preview: before/after share identical current data; double is an isolated synthetic fixture.'));
