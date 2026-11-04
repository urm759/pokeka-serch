// Same domesticPrice requirement as build_card_completion. This checks ordering;
// it neither changes the analysis definition nor adopts another price source.
function mismatches(cards,completion,audit,evidence){
 const disputed=new Set((audit.cards||[]).map(r=>String(r.id)));
 return cards.filter(c=>{const row=completion.cards?.[c.id];if(!row)return true;
   const expected=typeof c.price==='number'&&Number.isFinite(c.price)&&c.price>0&&!disputed.has(String(c.id))&&evidence.cards?.[c.id]?.status!=='unbacked';
   return (row.i?.domesticPrice==='取得済み')!==expected;
 }).map(c=>c.id);
}
module.exports={mismatches};
