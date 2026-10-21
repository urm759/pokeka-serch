const fs=require('node:fs'),path=require('node:path');
const names=['リザードン','フシギバナ','カメックス','にせオーキドはかせ','わるいギャラドス','ロケット団参上','のピカチュウ','R団のサンダー','ピィ','ひかるコイキング','マグマ団のグラードン','ブラッキー','ロケット団の幹部','ミュウex','サーナイトex','ネンドール','レントラーGL','ガブリアスC','ドンファン','レシラム','ゼクロム','ミュウツーEX','ゼルネアスEX','レックウザEX','カプテテフGX'];
const norm=s=>String(s).normalize('NFKC').replace(/[\s・!！_☆]/g,'').toLowerCase();
function audit(cards,completion) {
  const eligible=cards.filter(c=>String(c.setCode).toUpperCase()==='S8AP'&&c.language==='ja'&&!/未開封|BOX|パックのみ|複数枚/.test(c.name));
  const rows=names.map((name,i)=>{
    const number=String(i+1).padStart(3,'0');
    const matched=eligible.filter(c=>String(c.model).match(/(\d{3})(?:\/025|$)/)?.[1]===number&&norm(c.name.split('[')[0]).includes(norm(name)));
    return {number,name,ids:matched.map(c=>c.id),status:matched.length?'掲載済み':'未掲載',analyzable:matched.some(c=>completion.cards?.[c.id]?.s==='分析可能'),missing:matched.flatMap(c=>completion.cards?.[c.id]?.m||[])};
  });
  return {version:1,at:new Date().toISOString(),officialSource:'https://www.pokemon-card.com/ex/25th/s8aP/index.html',officialTotal:25,listed:rows.filter(r=>r.ids.length).length,missing:rows.filter(r=>!r.ids.length),duplicates:rows.filter(r=>r.ids.length>1),analyzable:rows.filter(r=>r.analyzable).length,rows,scope:'日本語版S8a-P単品25種。通常s8a・パック・海外版・クリーチャーズデッキ除外。掲載と条件による検索除外は別。'};
}
function build(root=path.join(__dirname,'..')) {
  const result=audit(JSON.parse(fs.readFileSync(path.join(root,'data/pokemon-cards.json'))),JSON.parse(fs.readFileSync(path.join(root,'data/card-catalog-completion.json'))));
  fs.writeFileSync(path.join(root,'data/25th-promo-coverage.json'),JSON.stringify(result));return result;
}
if(require.main===module){const r=build();console.log(JSON.stringify({listed:r.listed,official:r.officialTotal,missing:r.missing,duplicates:r.duplicates,analyzable:r.analyzable}));}
module.exports={audit,build};
