const assert=require('node:assert/strict'),fs=require('node:fs');
const {parse,VERSION}=require('./homura_public_feed');
const {collapse}=require('./homura_public_feed');
const card={id:'fixture',name:'ピカチュウ SR [S4 104/100]',model:'S4 104/100',setCode:'S4',language:'ja',rarity:'SR'};
const item={id:123,name:'PSA10 ピカチュウ SR 104/100',price:15000,shipping_only:true,product_sub_category:{id:182,product_category:{id:21}}};
const payload={meta:{current_page:1,total_pages:1,total_count:1},data:[item]};
const at='2026-10-22T12:00:00Z';
let row=parse(payload,[card],at)[0];
assert.equal(row.verifiedCardId,'fixture');assert.equal(row.observedAt,at);assert.equal(row.sourceUpdatedAt,null);
assert.equal(row.fulfilment,'mail');assert.equal(row.strictIdentity,true);assert.equal(row.grade,'PSA10');
assert.equal(parse({...payload,data:[{...item,name:'PSA9 ピカチュウ SR 104/100'}]},[card],at).length,0);
assert.equal(parse({...payload,data:[{...item,name:'PSA10 ピカチュウ SR 104/100 【英語版】'}]},[card],at)[0].verifiedCardId,null);
assert.equal(parse(payload,[card,{...card,id:'other'}],at)[0].verifiedCardId,null,'ambiguous identity must remain held');
assert.equal(parse({...payload,data:[{...item,name:'PSA10 ピカチュウ SAR 104/100'}]},[card],at)[0].verifiedCardId,null);
assert.throws(()=>parse({...payload,data:[{...item,price:null}]},[card],at),/形式変更/);
assert.throws(()=>parse({...payload,data:[{...item,product_sub_category:{id:183}}]},[card],at),/カテゴリ/);
assert.throws(()=>parse({data:[]},[card],at),/形式変更/);
const cp={pages:1,rawCount:2,total:2,items:[row,{...row}]};
assert.equal(collapse(cp).items.length,1);assert.equal(collapse(cp).fullListing,false);
assert.throws(()=>collapse({...cp,items:[row,{...row,price:16000}]}),/対立/);
assert.throws(()=>collapse({...cp,total:3}),/件数/);
assert(!require('./update_shop_buybacks').SHOPS.some(s=>s.id==='cardshop151-store'));
assert.equal(require('./buyback-source-permissions.json').sources['cardshop151-store'].status,'retired');
assert(require('./update_shop_buybacks').SHOPS.find(s=>s.id==='kaitori-homura-mail').adapterVersion===VERSION);
const code=fs.readFileSync(__dirname+'/update_shop_buybacks.js','utf8');
assert(!code.includes('delete history.shops[shopId]'),'removed history must be retained');
const retired=require('./apply_buyback_retirements');
const before={dates:['2026-10-22'],shops:{old:{},good:{}},cards:{a:{shops:{old:{price:100,c7:1,c30:1,avg7:100},good:{price:200,c7:1,c30:1,avg7:200}}}}};
const after=retired.exclude(before,['old']);assert.equal(after.cards.a.total7,1);assert.equal(after.cards.a.avg7,200);
assert.equal(after.shops.old,undefined);assert(before.cards.a.shops.old,'retirement never mutates historical input');
const valid=require('./update_shop_buybacks').freshUsablePrice, now=Date.parse(at);
assert(valid({listingActive:true,price:100,matchConfidence:'high',observedAt:at},{},now));
assert.equal(valid({listingActive:true,price:100,matchConfidence:'high',priceDate:'2026-10-12'},{lastSuccess:at},now),false,'a new file cannot renew an old quote');
assert.equal(valid({listingActive:true,price:100,matchConfidence:'high',observedAt:at},{acquisitionPermission:'retired'},now),false);
assert(require('node:fs').readFileSync(__dirname+'/capture_unpublished_data.js','utf8').includes("if(source==='daily-prevalidation')"),'preverification archive is bounded to raw reconstruction inputs');
console.log('PASS Homura public feed category, grade, identity, timestamps, retired source and missing payload');
(async()=>{
  const path=require('node:path'),os=require('node:os');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'homura-feed-test-'));fs.mkdirSync(path.join(root,'work'));
  try {
    const feed=require('./homura_public_feed');let calls=0;
    const shop={name:'fixture'};
    await assert.rejects(feed.fetchItems(shop,async url=>{
      calls++;assert(!url.includes('availability'),'no authenticated availability request');
      if(calls===2)throw Error('timeout');
      return {...payload,meta:{current_page:1,total_pages:2,total_count:2}};
    },[card],root),/timeout/);
    const checkpoint=JSON.parse(fs.readFileSync(path.join(root,'work/homura-public-checkpoint.json')));
    assert.equal(checkpoint.nextPage,2);assert.equal(checkpoint.items.length,1);
    const result=await feed.fetchItems(shop,async url=>{
      assert.equal(new URL(url).searchParams.get('page'),'2');
      return {...payload,data:[{...item,id:124}],meta:{current_page:2,total_pages:2,total_count:2}};
    },[card],root);
    assert.equal(result.items.length,2);assert.equal(result.fullListing,true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root,'work/homura-public-checkpoint.json'))).complete,true);
    console.log('PASS Homura interrupted page save and resume without re-fetching the first page');
  }finally{
    const absolute=path.resolve(root),parent=path.resolve(os.tmpdir())+path.sep;
    if(!absolute.startsWith(parent)||!path.basename(absolute).startsWith('homura-feed-test-'))throw Error('Unsafe fixture cleanup');
    fs.rmSync(absolute,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
