const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const {load} = require('./audit_search_profit_consistency');
const at = new Date().toISOString(), hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const previous = cp.execFileSync('git',['show','fee875c4:app.js'],{encoding:'utf8',maxBuffer:12e6}), current = fs.readFileSync('app.js','utf8');
const config = require('./priority-search-profiles.json');
const rows = [];
for (const profile of config.profiles) {
  for (const [overlayName,overlay] of [['urlOnly',{}],['approvedSaved',config.knownSavedOverlay]]) {
    const url = new URL(profile.url); for (const [key,value] of Object.entries(overlay)) if(!url.searchParams.has(key))url.searchParams.set(key,value);
    const before = load(previous,at,{url:url.href}), after = load(current,at,{url:url.href});
    const oldCards = before.prepareCalculatedCards(before.state.cards), newCards = after.prepareCalculatedCards(after.state.cards);
    const signature = cards => hash(cards.map(c=>[c.id,c.buyLimits,c.purchaseDecision,c.buybackAnalysis,c.psaDecision]));
    assert.equal(signature(oldCards),signature(newCards),'reference support must not change any economics/GO/demand scores');
    const ids = (api,cards) => cards.filter(c=>!api.cardSearchExclusions(c).length).map(c=>c.id);
    assert.deepEqual(ids(before,oldCards),ids(after,newCards));
    rows.push({profile:profile.id,overlay:overlayName,ids:ids(after,newCards),cards:newCards.length,financialHash:signature(newCards),unchanged:true});
  }
}
const result = {at,baseline:'fee875c4',sameDataSameSettingsSameTime:true,rows,llmCalls:0,
  note:'コード前後の影響だけを固定比較。実取得/時間経過の候補差分とは別。買取提示支持は既存点数・仕入れ式・GOへ未反映'};
fs.writeFileSync('data/buyback-support-isolation.json',JSON.stringify(result));console.log(JSON.stringify(result));
