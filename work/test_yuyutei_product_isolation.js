const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {parseYuyuteiResults,parseYuyuteiProduct,replayYuyuteiProduct}=require('./update_yuyutei_torecacamp');
const prefix='<a href="https://yuyu-tei.jp/sell/poc/card/svpromo-100/10061">前の商品</a>';
const detail='<section class="product-detail" id="product-detail"><h3>PROMO イーブイ</h3><span>062/SV-P</span><h4>12,800 円</h4><label>在庫 : 3 点</label><input value="10062" class="cart_cid"><input value="0" class="cart_kizu"></section>';
const next='<a href="https://yuyu-tei.jp/sell/poc/card/svpromo-100/10063">次の商品</a>';
for(const html of [prefix+detail+next,prefix+detail.replaceAll('"',"'")+next,prefix+detail.replace('<section','<SECTION')+next])assert.deepEqual(parseYuyuteiResults(html),[],'product offer cannot leak to adjacent URLs');
const tile='<a href="https://yuyu-tei.jp/sell/poc/card/svpromo-100/10062"><img alt="062/SV-P PROMO イーブイ"></a><span>062/SV-P</span><h4>PROMO イーブイ</h4><strong>12,800 円</strong>在庫 : 3 点';
assert.equal(parseYuyuteiResults(tile).length,1,'normal search parsing retained');
assert.equal(parseYuyuteiResults(tile)[0].detailUrl,'https://yuyu-tei.jp/sell/poc/card/svpromo-100/10062');
assert.equal(parseYuyuteiResults(tile)[0].price,12800);
assert.equal(parseYuyuteiResults(tile)[0].stock,3);
console.log('PASS product-page adjacent-URL isolation; normal search identity/price/stock parsing unchanged');

const url='https://yuyu-tei.jp/sell/poc/card/svpromo-100/10062';
const card={id:'x-122054',name:'イーブイ: プロモ [SV-P 062](「YU NAGABA×ポケモンカードゲーム」プロモーションカード「SV-P」)',language:'ja',yuyuteiUrl:url};
// Reduced from the retained response, with no cookies, tokens or unrelated UI.
// In particular #power is OUTSIDE the detail section, and both stock labels
// refer to one offer. Previous/next URLs do not identify that offer.
const product={
  '@type':'Product',name:'PROMO イーブイ',description:'062/SV-P',
  image:'https://card.yuyu-tei.jp/poc/front/svpromo-100/10062.jpg',
  offers:{'@type':'Offer',price:'12800',priceCurrency:'JPY',availability:'InStock'},
};
const page={'@type':'WebPage',url};
const jsonld=v=>`<script type="application/ld+json">${JSON.stringify(v)}</script>`;
const body=`${prefix}<div class="power mt-4" id="power"><h3 class="fw-bold"> PROMO イーブイ</h3></div><section
class="product-detail" id="product-detail"><div><img class="vimg" src="${product.image}" alt="Product"></div>
<span class="pote">062/SV-P</span><h4 class="fw-bold"> 12,800 円</h4>
<label id="cart_sell_zaiko_mobile"> 在庫 : 3 点 </label><label id="cart_sell_zaiko_pc"> 在庫 : 3 点 </label>
<input type="hidden" value="31" class="cart_gid"><input type="hidden" value="svpromo-100" class="cart_ver">
<input type="hidden" value="10062" class="cart_cid"><input type="hidden" value="0" class="cart_kizu"></section>${next}`;
const html=jsonld(product)+jsonld(page)+body;
const expected={cardId:card.id,detailUrl:url,setCode:'svpromo-100',cardNo:'062/SV-P',title:'PROMO イーブイ',productId:'10062',
  price:12800,stock:3,state:'A',cartKizu:0,language:'ja',identityVerified:true,conditionAccepted:true,parser:'yuyutei-product-v1'};
assert.deepEqual(parseYuyuteiProduct(html,url,card),expected);
assert.deepEqual(parseYuyuteiResults(html),[]);
for(const source of [html.replace('id="product-detail"','id="product-detail" id="other"'),
  html.replace('id="product-detail"','id=product-detail'),html.replace('id="product-detail"','id="other"')]){
  assert.deepEqual(parseYuyuteiResults(source),[],'malformed/id-less product pages still cannot enter listing parsing');
}
for(const otherUrl of [url.replace('10062','10061'),url.replace('10062','10063'),url.replace('svpromo-100','svpromo-200'),
  url+'?kizu=1',url+'#10062',url.replace('https:','http:'),url.replace('yuyu-tei.jp','yuyu-tei.jp.evil.invalid'),
  url.replace('yuyu-tei.jp','user@yuyu-tei.jp')])assert.equal(parseYuyuteiProduct(html,otherUrl,card),null,otherUrl);

const reject=(name,source,expectedCard=card)=>assert.equal(parseYuyuteiProduct(source,url,expectedCard),null,name);
const mutations=[
  ['hidden product ID',s=>s.replace('value="10062"','value="10061"')],
  ['hidden set ID',s=>s.replace('value="svpromo-100"','value="svpromo-200"')],
  ['wrong game',s=>s.replace('value="31"','value="1"')],
  ['damaged',s=>s.replace('value="0" class="cart_kizu"','value="1" class="cart_kizu"')],
  ['missing condition',s=>s.replace(/<input[^>]*class="cart_kizu">/,'')],
  ['visible condition input',s=>s.replace('type="hidden" value="0"','type="text" value="0"')],
  ['duplicate condition',s=>s.replace('</section>','<input type="hidden" value="0" class="cart_kizu"></section>')],
  ['duplicate attribute',s=>s.replace('class="cart_kizu"','class="cart_kizu" value="1"')],
  ['duplicate section attribute',s=>s.replace('id="product-detail"','id="product-detail" id="other"')],
  ['missing stock',s=>s.replace(/<label[^>]*>[^<]*<\/label>/g,'')],
  ['conflicting mobile stock',s=>s.replace('在庫 : 3 点','在庫 : 2 点')],
  ['stock outside detail',s=>s.replace(/<label[^>]*>[^<]*<\/label>/g,'')+'<label>在庫 : 3 点</label>'],
  ['conflicting visible price',s=>s.replace('12,800 円','14,800 円')],
  ['duplicate visible price',s=>s.replace('</section>','<h4>12,800 円</h4></section>')],
  ['price outside detail',s=>s.replace('<h4 class="fw-bold"> 12,800 円</h4>','')+'<h4>12,800 円</h4>'],
  ['printed number differs',s=>s.replace('<span class="pote">062/SV-P','<span class="pote">063/SV-P')],
  ['visible name differs',s=>s.replace('> PROMO イーブイ</h3>','> PROMO ピカチュウ</h3>')],
  ['different current image',s=>s.replace('<img class="vimg" src="'+product.image,'<img class="vimg" src="'+product.image.replace('10062','10063'))],
  ['duplicate product section',s=>s+body],
  ['second incomplete product section',s=>s+'<section id="product-detail">'],
  ['truncated section',s=>s.replace('</section>','')],
];
for(const [name,change] of mutations)reject(name,change(html));
for(const patch of [{offers:{...product.offers,price:'14800'}},{offers:{...product.offers,priceCurrency:'USD'}},
  {offers:{...product.offers,availability:'OutOfStock'}},{image:product.image.replace('10062','10063')},
  {description:'063/SV-P'},{name:'PROMO イーブイ 英語版'},{name:'PROMO イーブイ マスターボールミラー'}]){
  reject(JSON.stringify(patch),jsonld({...product,...patch})+jsonld(page)+body);
}
reject('wrong structured page URL',jsonld(product)+jsonld({...page,url:url.replace('10062','10061')})+body);
reject('multiple structured products',jsonld(product)+html);
reject('no structured product',jsonld(page)+body);
reject('malformed structured product','<script type="application/ld+json">{</script>'+html);
for(const patch of [{id:null},{name:card.name.replace('062','063')},{name:card.name.replace('SV-P','S-P')},
  {name:card.name.replace('イーブイ','わるいイーブイ')},{name:card.name.replace(': プロモ',': マスターボールミラー')},
  {name:card.name.replace(': プロモ',': SA')},{name:card.name.replace(': プロモ',': 1ED')},
  {name:card.name.replace(': プロモ',': 英語版')},{name:card.name.replace(': プロモ',': 未開封')},
  {name:card.name.replace(': プロモ',': PSA10')},{name:card.name.replace(': プロモ',': 状態B')},
  {language:'en'},{language:'unknown'},{variant:'mirror'},{finish:'master-ball-mirror'},{rarity:'SAR'},
  {manualReview:true},{identityReviewRequired:true},{identityHoldReason:'manual hold'},
  {identityVerified:false},{priceQuarantined:true},{referenceOnly:true},{conditionAccepted:false},{state:'B'},{rawCondition:'sealed-single'}]){
  reject(JSON.stringify(patch),html,{...card,...patch});
}
// Attribute order/quote/case variations still bind only to the current product.
assert.deepEqual(parseYuyuteiProduct(html.replaceAll('"',"'").replace(/(<script[^>]*>)(.*?)(<\/script>)/g,
  (_,open,json,close)=>open+json.replaceAll("'",'"')+close),url,card),expected);
assert.deepEqual(parseYuyuteiProduct(html.replace(/<section/g,'<SECTION').replace(/<\/section/g,'</SECTION'),url,card),expected);
assert.deepEqual(parseYuyuteiProduct(html,url,{...card,name:'イーブイ P [062 SV-P]'}),expected);
const soldOut=jsonld({...product,offers:{...product.offers,availability:'OutOfStock'}})+jsonld(page)+body.replaceAll('在庫 : 3 点','在庫 : 0 点');
assert.equal(parseYuyuteiProduct(soldOut,url,card).stock,0,'explicit zero stock is not missing stock');
const standardUrl=url.replace('svpromo-100','sv04a');
const standardHtml=html.replaceAll('svpromo-100','sv04a').replaceAll('062/SV-P','349/190').replaceAll('PROMO イーブイ','SAR リザードンex');
assert.equal(parseYuyuteiProduct(standardHtml,standardUrl,{id:'standard',name:'リザードンex SAR [SV4a 349/190]'}).price,12800);
assert.equal(parseYuyuteiProduct(standardHtml,standardUrl,{id:'other-rarity',name:'リザードンex SSR [SV4a 349/190]'}),null);

const binding={cardId:card.id,detailUrl:url,price:14800,stock:1,observedAt:'2026-09-05'};
const capture={url,html,httpStatus:200,fetchedAt:'2026-11-11T13:31:00+09:00'};
const options={now:Date.parse('2026-11-11T07:00:00Z')};
const before=JSON.stringify({card,binding,capture});
assert.deepEqual(replayYuyuteiProduct(card,binding,capture,options),{...expected,observedAt:capture.fetchedAt});
for(const patch of [{httpStatus:403},{httpStatus:401},{httpStatus:302},{html:'CAPTCHA'},{html:'login required'},
  {fetchedAt:null},{fetchedAt:'2026-11-11'},{fetchedAt:'2026-11-12T00:00:00Z'},
  {finalUrl:url.replace('10062','10061')},{url:url.replace('10062','10063')}]){
  assert.equal(replayYuyuteiProduct(card,binding,{...capture,...patch},options),null,JSON.stringify(patch));
}
for(const patch of [{cardId:'neighbor'},{detailUrl:url.replace('10062','10061')},{identityHoldReason:'manual hold'},
  {identityVerified:false},{conditionAccepted:false},{priceQuarantined:true}]){
  assert.equal(replayYuyuteiProduct(card,{...binding,...patch},capture,options),null,JSON.stringify(patch));
}
assert.equal(replayYuyuteiProduct({...card,yuyuteiUrl:url.replace('10062','10063')},binding,capture,options),null);
assert.equal(replayYuyuteiProduct(card,binding,{...capture,html:''},options),null,'never fall back to the retained price');
assert.equal(replayYuyuteiProduct(card,binding,{...capture,fetchedAt:'2026-09-05T01:00:00Z'},options).observedAt,
  '2026-09-05T01:00:00Z','old capture keeps its time; parsing does not renew freshness');
assert.equal(JSON.stringify({card,binding,capture}),before,'saved rows, card settings and evidence stay unchanged');

const rawPath=path.join(__dirname,'..','.private','yuyutei-062-response.html');
if(fs.existsSync(rawPath)){
  const raw=fs.readFileSync(rawPath,'utf8');
  assert.deepEqual(parseYuyuteiProduct(raw,url,card),expected,'retained real response');
  for(const cid of ['10061','10063'])assert.equal(parseYuyuteiProduct(raw,url.replace('10062',cid),card),null);
  assert.deepEqual(parseYuyuteiResults(raw),[],'real detail remains isolated from listing parser');
  const receipt=JSON.parse(fs.readFileSync(path.join(path.dirname(rawPath),'yuyutei-062-receipt.json'),'utf8'));
  assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(rawPath)).digest('hex'),receipt.sha256);
  const replay=replayYuyuteiProduct(card,binding,{url:receipt.url,finalUrl:receipt.finalUrl,httpStatus:receipt.status,
    html:raw,fetchedAt:receipt.at},options);
  assert.deepEqual(replay,{...expected,observedAt:'2026-11-11T04:31:23.500Z'},'original receipt time retained on saved replay');
  console.log('PASS retained 062/SV-P raw: 12800 JPY, stock 3, hidden cart_kizu=0; no neighbor adoption');
}
console.log('PASS exact direct-product identity/condition, conflicting evidence, zero stock, saved bindings and original timestamps; no fetch/write');

async function testSingleProbe(){
  const os=require('node:os'),{probeYuyuteiProduct}=require('./probe_yuyutei_product');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yuyutei-single-probe-'));
  try{
    for(const [label,status,content] of [['normal',200,html],['403',403,'Forbidden'],['401',401,'Login'],
      ['redirect',302,'redirect'],['captcha',200,'CAPTCHA'],['wrong-product',200,html.replace('value="10062"','value="10063"')]]){
      let calls=0;
      const rawDir=path.join(temp,label);
      const result=await probeYuyuteiProduct({card,binding,rawDir,fetchImpl:async(request,init)=>{
        calls++;
        assert.equal(request,url);assert.equal(init.redirect,'manual');
        assert.deepEqual(Object.keys(init.headers),['user-agent']);
        return {status,url,arrayBuffer:async()=>Buffer.from(content)};
      }});
      assert.equal(calls,1,'one known URL, no retry/follow-up request');
      assert.equal(result.result,label==='normal'?'verified-not-adopted':status===200?'identity-or-page-rejected':'http-error');
      assert.equal(result.adopted,0);assert.equal(result.holdsChanged,0);
      assert.equal(fs.readFileSync(path.join(rawDir,'response.html'),'utf8'),content);
      assert.equal(fs.existsSync(path.join(rawDir,'parsed.json')),label==='normal');
      const saved=JSON.parse(fs.readFileSync(path.join(rawDir,'receipt.json'),'utf8'));
      assert.equal(saved.url,url);assert.equal(saved.httpStatus,status);
      assert(Number.isFinite(Date.parse(saved.fetchedAt)));
      if(label==='normal')assert.equal(JSON.parse(fs.readFileSync(path.join(rawDir,'parsed.json'),'utf8')).observedAt,saved.fetchedAt);
      await assert.rejects(probeYuyuteiProduct({card,binding,rawDir,fetchImpl:async()=>{calls++;throw Error('must not refetch');}}));
      assert.equal(calls,1,'an existing capture cannot be overwritten/refetched');
    }
    let calls=0;
    const failed=await probeYuyuteiProduct({card,binding,rawDir:path.join(temp,'timeout'),fetchImpl:async()=>{calls++;throw Error('timeout');}});
    assert.equal(calls,1);assert.equal(failed.result,'failed');assert.equal(failed.error,'timeout');
    await assert.rejects(probeYuyuteiProduct({card,binding:{...binding,identityHoldReason:'manual'},rawDir:path.join(temp,'held'),
      fetchImpl:async()=>{calls++;}}));
    assert.equal(calls,1,'identity holds stop before requesting');
    assert.equal(JSON.stringify({card,binding,capture}),before,'probe never mutates saved card/catalog/capture');
    console.log('PASS single known-URL probe: raw/receipt saved, no retry/redirect/auth/hold release/catalog adoption');
  }finally{
    const resolved=fs.realpathSync(temp),tempRoot=fs.realpathSync(os.tmpdir());
    assert.equal(path.dirname(resolved),tempRoot);
    assert(path.basename(resolved).startsWith('yuyutei-single-probe-'));
    fs.rmSync(resolved,{recursive:true,force:true});
  }
}
testSingleProbe().catch(error=>{console.error(error);process.exitCode=1;});
