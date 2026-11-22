const assert=require('node:assert/strict'),fs=require('node:fs'),codec=require('../ui-data-codec');
(async()=>{
  const sample={date:'2026-10-27',again:'2026-10-27',literal:'~0',escaped:'~~z',empty:'',n:0,negative:-2,missing:null,
    rows:[{date:'2026-10-27',v:12.125},{date:'2026-10-27',v:-3}],nested:[[-2,0],[-1,3]],'__proto__not_special':'value'};
  for(const version of [1,2]){const p=codec.encode(sample,{version});assert.deepEqual(codec.decode(p),sample);assert.deepEqual(await codec.decodeAsync(p),sample);}
  const special=JSON.parse('{"__proto__":{"x":1},"~0":"literal"}');
  assert.deepEqual(codec.decode(codec.encode(special,{version:2})),special);assert.equal({}.x,undefined);
  for(const data of ['~no!','~zzzz','~',[-2,-1]])assert.throws(()=>codec.decode({codec:'ui-schema-v2',strings:[],schemas:[],data}));
  const row=day=>({date:day,theoretical:0,operational:0,version:'model-v1'});
  const history=[row('2026-11-20'),row('2026-11-21'),row('2026-11-22')];
  const repeated=JSON.parse(JSON.stringify({cards:{a:{clean:history,scratch:history},b:{clean:history,scratch:[...history,{...row('2026-11-23'),operational:500}]},
    c:{clean:history.slice(1),scratch:[]}},literal:[[-3,0],[-3,1]],escaped:['~0','~!1'],lists:Array(4).fill([1.125,-3,null])}));
  const stored=JSON.parse(JSON.stringify(codec.encode(repeated,{version:2,repeats:true})));
  assert(stored.repeats.length&&JSON.stringify(stored).length<JSON.stringify(codec.encode(repeated,{version:2})).length,'repeated rows are stored once');
  for(const restored of [codec.decode(stored),await codec.decodeAsync(stored)]){
    assert.deepEqual(restored,repeated);assert.equal(JSON.stringify(restored),JSON.stringify(repeated),'key, row order and count are exact');
    restored.cards.a.clean[0].operational=999;
    assert.equal(restored.cards.a.scratch[0].operational,0,'restored rows never share an object');
    assert.equal(restored.cards.b.clean[0].operational,0);
  }
  assert.deepEqual(codec.decode(codec.encode(special,{version:2,repeats:true})),special);assert.equal({}.x,undefined);
  for(const [data,repeats] of [[[-3,0],undefined],[[-3,1],[[-1]]],[[-3,-1],[[-1]]],[[-3,0.5],[[-1]]],[[-3,0],[[-3,0]]],[[-3,0],[[-1,[-3,1]],[-1]]],[[-3,0,0],[[-1]]]]){
    const broken={codec:'ui-schema-v2',strings:[],schemas:[],data,repeats};
    assert.throws(()=>codec.decode(broken),/Invalid UI repeat reference/);
    await assert.rejects(()=>codec.decodeAsync(broken),/Invalid UI repeat reference/);
  }
  assert.throws(()=>codec.encode(repeated,{version:1,repeats:true}));
  const manifest=JSON.parse(fs.readFileSync('data/ui/manifest.json'));let n=0;
  for(const file of Object.values(manifest.aliases)){const original=codec.decode(JSON.parse(fs.readFileSync(file)));const p=codec.encode(original,{version:2});
    assert.deepEqual(codec.decode(p),original,file);assert.deepEqual(await codec.decodeAsync(p),original,file);n++;}
  console.log('PASS UI codec v1/v2 sync/async, repeated rows, escaped literals, zero/null/precision, prototype guard, all '+n+' current summaries');
})().catch(e=>{console.error(e);process.exitCode=1});
