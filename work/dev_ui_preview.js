const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const legacy = Object.fromEntries(['index.html','app.js'].map(f=>[f,execFileSync('git',['show',`ec674c80:${f}`],{cwd:root,maxBuffer:3000000})]));
http.createServer((req,res)=>{
  const url = new URL(req.url, 'http://localhost');
  const old = url.pathname.startsWith('/legacy/');
  let name = decodeURIComponent(url.pathname).replace(/^\/(legacy\/)?/, '') || 'index.html';
  const file = path.resolve(root, name);
  if (!file.startsWith(root+path.sep)) {res.writeHead(403);res.end();return;}
  try {
    const data = old && legacy[name] || fs.readFileSync(file);
    res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'application/json; charset=utf-8'});
    res.end(data);
  } catch {res.writeHead(404);res.end();}
}).listen(8766,'127.0.0.1',()=>console.log('UI preview http://127.0.0.1:8766 (legacy route preserves pre-change code)'));
