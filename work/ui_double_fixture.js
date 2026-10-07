const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const codec = require('../ui-data-codec.js');
function fixture(root) {
  const buffers = new Map();
  const manifest = JSON.parse(fs.readFileSync(path.join(root,'data/ui/manifest.json'),'utf8'));
  const app = fs.readFileSync(path.join(root,'app.js'),'utf8');
  const listed = app.match(/const initialFiles = \[([\s\S]*?)\];/)[1];
  const files = [...listed.matchAll(/"([^"]+)"/g)].map(m=>'data/'+m[1]+'.json');
  files.push(...JSON.parse(fs.readFileSync(path.join(root,'data/card-catalog/manifest.json'))).files.map(r=>r.file));
  const copy = row => ({...row,id:'scale-'+row.id});
  for (const original of files) {
    const file = manifest.aliases[original] || original;
    if (buffers.has(file)) continue;
    const input = JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
    const value = codec.decode(input);
    if (Array.isArray(value)) value.push(...value.map(copy));
    else if (value.cards) {
      if (Array.isArray(value.cards)) value.cards.push(...value.cards.map(copy));
      else for (const [id,row] of Object.entries({...value.cards})) value.cards['scale-'+id]=structuredClone(row);
    }
    if (original === 'data/card-catalog/manifest.json') {
      for (const key of ['total','analysisCount','totalCards','analysisCards']) if (typeof value[key]==='number') value[key]*=2;
      for (const entry of value.files) if (entry.count) entry.count*=2;
    }
    if (original === 'data/card-catalog-completion.json') {
      const ratio = /Pct|Rate|Days|Retention/;
      for (const [key,n] of Object.entries(value.summary)) if(typeof n==='number'&&!ratio.test(key)) value.summary[key]=n*2;
      for (const item of Object.values(value.itemTotals||{})) for(const [key,n]of Object.entries(item)) if(typeof n==='number'&&!ratio.test(key))item[key]=n*2;
    }
    const text = JSON.stringify(input.codec ? codec.encode(value) : value);
    buffers.set(file,Buffer.from(text));
    manifest.hashes[file]=crypto.createHash('sha256').update(text).digest('hex');
  }
  manifest.revision='synthetic-double-'+manifest.revision;
  manifest.syntheticDouble=true;
  buffers.set('data/ui/manifest.json',Buffer.from(JSON.stringify(manifest)));
  return {get:name=>buffers.get(name), byteLength:[...buffers.values()].reduce((n,b)=>n+b.length,0)};
}
module.exports={fixture};
