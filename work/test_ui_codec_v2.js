const assert=require('node:assert/strict'),fs=require('node:fs'),codec=require('../ui-data-codec');
(async()=>{
  const sample={date:'2026-10-27',again:'2026-10-27',literal:'~0',escaped:'~~z',empty:'',n:0,negative:-2,missing:null,
    rows:[{date:'2026-10-27',v:12.125},{date:'2026-10-27',v:-3}],nested:[[-2,0],[-1,3]],'__proto__not_special':'value'};
  for(const version of [1,2]){const p=codec.encode(sample,{version});assert.deepEqual(codec.decode(p),sample);assert.deepEqual(await codec.decodeAsync(p),sample);}
  const special=JSON.parse('{"__proto__":{"x":1},"~0":"literal"}');
  assert.deepEqual(codec.decode(codec.encode(special,{version:2})),special);assert.equal({}.x,undefined);
  for(const data of ['~no!','~zzzz','~',[-2,-1]])assert.throws(()=>codec.decode({codec:'ui-schema-v2',strings:[],schemas:[],data}));
  const manifest=JSON.parse(fs.readFileSync('data/ui/manifest.json'));let n=0;
  for(const file of Object.values(manifest.aliases)){const original=codec.decode(JSON.parse(fs.readFileSync(file)));const p=codec.encode(original,{version:2});
    assert.deepEqual(codec.decode(p),original,file);assert.deepEqual(await codec.decodeAsync(p),original,file);n++;}
  console.log('PASS UI codec v1/v2 sync/async, escaped literals, zero/null/precision, prototype guard, all '+n+' current summaries');
})().catch(e=>{console.error(e);process.exitCode=1});
