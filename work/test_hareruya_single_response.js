const assert=require('node:assert/strict'),{parse}=require('./hareruya_single_response');
const url='https://www.hareruya2.com/products/123',product={ '@type':'Product',name:'ピカチュウ&イーブイ(SAR)',url,
  offers:[{price:10000,priceCurrency:'JPY',url:url+'?variant=4',availability:'https://schema.org/InStock'}]};
const html=(p=product,stock='在庫3',extra='')=>`<section id="MainProduct-test"><h1>ピカチュウ&amp;イーブイ(SAR)</h1><p id="Inventory-test">${stock}</p><script type="application/ld+json">${JSON.stringify(p)}</script>${extra}</section>`;
assert.deepEqual(parse(html(),url),{product:{title:product.name},quote:{price:10000,stock:3,available:true}});
assert.equal(parse(html({...product,offers:[...product.offers,...product.offers]}),url),null);
for(const change of [{priceCurrency:'USD'},{price:null},{price:true},{price:0},{url:'https://evil.test/products/123'},{url:url+'4'},{availability:'https://schema.org/PreOrder'}])
  assert.equal(parse(html({...product,offers:[{...product.offers[0],...change}]}),url),null);
assert.equal(parse(html(product,'在庫0'),url),null);
assert.equal(parse(html(product,'残りわずか'),url),null);
assert.equal(parse(html(product,'在庫3').replace('Inventory-test','Inventory-other'),url),null);
assert.equal(parse(html({...product,url:url+'4'}),url),null);
assert.equal(parse(html(product,'在庫3').replace('<h1>','<h2>').replace('</h1>','</h2>'),url),null);
assert.equal(parse(html(product,'在庫3',`<script type="application/ld+json">${JSON.stringify(product)}</script>`),url),null);
const out={...product,offers:[{...product.offers[0],availability:'https://schema.org/OutOfStock'}]};
assert.equal(parse(html(out,'在庫0'),url).quote.available,false);
const updater=require('node:fs').readFileSync(require('node:path').join(__dirname,'refresh_candidate_shops.js'),'utf8');
assert(updater.includes('single&&exactIdentity(card,single.product)'));
assert(updater.includes('shopifyQuote(product, stockHtml, url)'),'unsupported pages keep existing strict Ajax path');
console.log('PASS single normal response: exact product/JPY/one offer/current quantity; fallback retains identity and access guards');
