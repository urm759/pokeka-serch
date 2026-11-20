const SETS=new Set(['SM9','SM11','SM10A','SM12A','SM10','SM10B','SM9A','SM11A']);
function includes(card){return card.language==='ja'&&!card.identityReviewRequired&&SETS.has(String(card.setCode).toUpperCase())
  &&require('./card_identity').extractRarity(card.name,card.rarity)==='RR';}
module.exports={includes,sets:[...SETS]};
