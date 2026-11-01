const fs=require('fs'),path=require('path');const ROOT=path.resolve(__dirname,'..');
function summarize({profiles,focusIds,cards,population,coverage,gem,receivedSets=[],psaOnly=[]},now=Date.now()){
 const ids=[...new Set(profiles.filter(p=>focusIds.includes(p.id)).flatMap(p=>p.ids))],byId=new Map(cards.map(c=>[c.id,c]));
 const rows=ids.map(id=>{const c=byId.get(id),p=population.cards?.[id],held=population.specificationHeld?.[id],a=coverage.cards?.[id],set=require('./build_psa_linkage_queue').psaIdentity(c).setCode,matched=p&&!held;
  const freshness=matched&&Number.isFinite(Date.parse(p.f))?now-Date.parse(p.f)<=36*3600000?'fresh':'stale':'unknown';
  const reference=gem.cards?.[id];return{id,name:c.name,setCode:set,official:held?'specification-held':matched?'linked':'unlinked',officialObservedAt:p?.f||null,freshness,comparison:a?.reason||'unlinked-or-history-unavailable',gemrate:reference?'reference-published':receivedSets.some(s=>s.setCode===set&&s.language==='ja')?'received-set-specification-review':'not-in-received-set',gemrateSourceDate:reference?.[3]||null,priority:0,nextAction:held?'仕様根拠の確認':matched?'同一仕様の正規更新経路を待機・元日時保持':'保存原票の一括再照合を優先'};});
 const count=f=>rows.filter(f).length;return{at:new Date(now).toISOString(),focusProfileIds:focusIds,ids,rows,counts:{cards:ids.length,linked:count(r=>r.official==='linked'),unlinked:count(r=>r.official==='unlinked'),specificationHeld:count(r=>r.official==='specification-held'),fresh:count(r=>r.freshness==='fresh'),stale:count(r=>r.freshness==='stale'),comparable:count(r=>r.comparison==='comparable'),gemrateReference:count(r=>r.gemrate==='reference-published'),gemrateNotInReceivedSet:count(r=>r.gemrate==='not-in-received-set'),gemrateSetSpecificationReview:count(r=>r.gemrate==='received-set-specification-review')},psaOnlyIds:psaOnly.filter(id=>!ids.includes(id)),normalSweepPreserved:true,newOfficialObservations:0,newReferenceAdoption:0,note:'Exact two URL results only; median/specified mode comparisons are separate. Linked stale is not unlinked. Existing official acquisition policy stays enforced. Source dates are not generation times.'};
}
function build(root=ROOT){const read=(f,fallback={})=>{try{return JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));}catch{return fallback;}};const config=read('work/priority-search-profiles.json');if(!config.popFocusProfileIds?.length)return null;const report=read('data/priority-search-profile-audit.json'),cards=read('data/pokemon-cards.json',[]),queue=read('work/card-completion-queue.json');const result=summarize({profiles:(report.profiles||[]).map(p=>p.urlOnly),focusIds:config.popFocusProfileIds,cards,population:read('data/psa-population-summary.json'),coverage:read('data/psa-pop-coverage.json'),gem:read('data/gemrate-reference-summary.json'),receivedSets:read('work/gemrate-received-scope.json').sets,psaOnly:Object.entries(queue.cards||{}).filter(([id,r])=>r.m?.length===1&&r.m[0]==='psaOfficial').map(([id])=>id)});
 result.officialAcquisition=require('./psa_access_policy').decision(require('./psa_access_policy').read(root));fs.writeFileSync(path.join(root,'work/pop-focus-targets.json'),JSON.stringify(result));report.popFocus={...result,rows:undefined,ids:undefined,psaOnlyIds:undefined,psaOnlyCount:result.psaOnlyIds.length};fs.writeFileSync(path.join(root,'data/priority-search-profile-audit.json'),JSON.stringify(report));return result;}
function prioritize(rows,focus,cards,population){
 const result=rows.map(r=>({...r})),byId=new Map(cards.map(c=>[c.id,c]));
 for(const id of [...(focus?.ids||[]),...(focus?.psaOnlyIds||[])]){
  const exact=focus.ids.includes(id),card=byId.get(id);if(!card)continue;
  const official=population.cards?.[id],pending=result.find(r=>r.cardId===id);
  if(!pending&&!official?.u)continue;
  const identity=require('./build_psa_linkage_queue').psaIdentity(card);
  const row=pending||{cardId:id,name:card.name,setCode:identity.setCode,cardNo:identity.cardNumber,sourceSetUrl:official.u};
  row.priority=exact?1e14:1e13+1;row.focused=exact||row.focused;row.popFocusTier=exact?'exact-user-urls':'only-pop-missing';
  row.needsRefresh=Boolean(official);row.originalObservedAt=official?.f||null;
  row.reason=[...(Array.isArray(row.reason)?row.reason:[]),exact?'新重点2URLのPOP確認・停止方針と通常巡回枠は維持':'必須不足がPOPのみ・保存原票再照合を優先'];
  if(!pending)result.push(row);
 }
 return result.sort((a,b)=>b.priority-a.priority);
}
module.exports={build,summarize,prioritize};if(require.main===module)console.log(JSON.stringify(build()?.counts));
