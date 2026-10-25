// A single normal product response may prove the same fields as Ajax + HTML.
// Ambiguous variants, currencies, URLs or quantities fall back to the existing path.
function parse(html,url){
  try{
    const text=String(html||''),expected=new URL(url);
    const section=text.match(/<section\b[^>]*\bid="MainProduct-([^"]+)"[^>]*>([\s\S]*?)<\/section>/i);
    if(!section)return null;
    const body=section[2],escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const products=[...body.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
      .flatMap(m=>{try{const j=JSON.parse(m[1]);return j['@type']==='Product'?[j]:[];}catch{return [];}});
    if(products.length!==1)return null;
    const product=products[0],offers=Array.isArray(product.offers)?product.offers:[product.offers];
    const same=value=>{const u=new URL(value,expected);return u.origin===expected.origin&&u.pathname===expected.pathname;};
    if(!same(product.url)||offers.length!==1||!offers[0]||!same(offers[0].url))return null;
    const offer=offers[0],price=Number(offer.price);
    if(offer.priceCurrency!=='JPY'||!['number','string'].includes(typeof offer.price)||!Number.isFinite(price)||price<=0)return null;
    const label=body.match(new RegExp('<p\\b[^>]*id="Inventory-'+escape(section[1])+'"[^>]*>([\\s\\S]*?)<\\/p>','i'))?.[1];
    const quantity=label?.replace(/<[^>]*>/g,'').match(/^\s*在庫\s*([\d,]+)\s*$/);
    if(!quantity)return null;
    const stock=Number(quantity[1].replace(/,/g,''));
    const availability=String(offer.availability||'').split('/').at(-1);
    if(!Number.isSafeInteger(stock)||stock<0||!['InStock','OutOfStock'].includes(availability)
      ||(availability==='InStock')!==(stock>0))return null;
    const h1=body.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
    const normalize=t=>String(t||'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&#39;|&#x27;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
    if(!product.name||normalize(h1)!==normalize(product.name))return null;
    return {product:{title:product.name},quote:{price,stock,available:stock>0}};
  }catch{return null;}
}
module.exports={parse};
