const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const b=require('./build_psa_history'),ROOT=path.join(__dirname,'..');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function certify(row,card,official,identity,now=Date.now()){
  if(row.captureVersion<2||!row.completeSnapshot)return {reason:'legacy-specification-not-proven'};
  if(!Number.isInteger(row.ten)||!Number.isInteger(row.total)||row.ten<0||row.total<=0||row.total<row.ten)return {reason:'invalid-counts'};
  const at=b.observationTime(row.fetchedAt),end=b.observationTime(official?.f);
  if(at==null||end==null||at>end||at>now||at<now-400*86400000)return {reason:'date-out-of-range'};
  if(row.url!==official.u||!/^https:\/\/www\.psacard\.com\/(?:pop\/tcg-cards\/|spec\/psa\/\d+)/.test(row.url)||/pokemon-asia/i.test(row.url)||b.cleanName(row.name)!==b.cleanName(official.n))return {reason:'source-or-label-mismatch'};
  const cardKey=b.cardIdentity(card);if(!cardKey||row.set!==cardKey.set||row.no!==cardKey.no)return {reason:'set-number-mismatch'};
  if(!b.namesCompatible(official.e,row)||!b.variantsCompatible(card.name,official.e,row))return {reason:'specification-mismatch'};
  const store={identities:{},sources:{}};b.reconcileHistory(store,card.id,[],row,cardKey);
  if(store.identities[card.id]!==identity)return {reason:'mapping-changed'};
  return {point:b.appendObservation([],row,identity)[0]};
}
function run(root=ROOT){
  const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
  const catalog=read('data/pokemon-cards.json'),population=read('data/psa-population-summary.json');
  const histories=new Map(),groups=new Map(),targets=new Map();
  for(const card of catalog){
    const o=population.cards?.[card.id];if(!o||population.specificationHeld?.[card.id])continue;
    if(!histories.has(o.sh))histories.set(o.sh,read('data/psa-history/'+o.sh+'.json'));
    const identity=histories.get(o.sh).identities?.[card.id],key=b.cardIdentity(card);if(!identity||!key)continue;
    const k=`${key.set}|${key.no}|${o.u}|${b.cleanName(o.n)}`;if(!targets.has(k))targets.set(k,[]);targets.get(k).push({card,o,identity});
  }
  const commits=cp.execFileSync('git',['log','-40','--format=%H','--','data/psa-official-populations.json'],{cwd:root,encoding:'utf8'}).trim().split(/\s+/).filter(Boolean);
  const blobs=new Set(),audit={at:new Date().toISOString(),snapshots:0,rowsExamined:0,reasons:{},newPoints:0,recoveredObservationDays:0,cardsRecovered:0,conflicts:[],sources:[],llmCalls:0,codexCalls:0};
  for(const commit of commits){
    const file='data/psa-official-populations.json',blob=cp.execFileSync('git',['rev-parse',`${commit}:${file}`],{cwd:root,encoding:'utf8'}).trim();
    if(blobs.has(blob))continue;blobs.add(blob);
    const raw=cp.execFileSync('git',['show',`${commit}:${file}`],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
    audit.snapshots++;audit.sources.push({commit,file,blob,sha256:hash(raw.replace(/\r\n/g,'\n'))});
    for(const row of b.compactRows(JSON.parse(raw))){
      audit.rowsExamined++;const k=`${row.set}|${row.no}|${row.url}|${b.cleanName(row.name)}`;
      for(const t of targets.get(k)||[]){
        const certified=certify(row,t.card,t.o,t.identity);if(!certified.point){audit.reasons[certified.reason]=(audit.reasons[certified.reason]||0)+1;continue;}
        const sh=t.o.sh;if(!groups.has(sh)){
          const f=path.join(root,'data/psa-pop-recovered',sh+'.json');groups.set(sh,fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):{version:1,cards:{}});
        }
        const group=groups.get(sh),c=group.cards[t.card.id]||={identity:t.identity,sourceUrl:t.o.u,points:[]};
        if(c.identity!==t.identity||c.sourceUrl!==t.o.u){audit.reasons['saved-recovery-mapping-changed']=(audit.reasons['saved-recovery-mapping-changed']||0)+1;continue;}
        const known=[...(histories.get(sh).cards[t.card.id]||[]),...c.points].find(p=>p[3]?.observedAt===row.fetchedAt);
        if(known){if(known[1]!==row.ten||known[2]!==row.total)audit.conflicts.push({id:t.card.id,at:row.fetchedAt,commit});continue;}
        const point=certified.point;point[3].recovery={commit,file,blob,rowHash:hash(JSON.stringify(row))};c.points.push(point);
        audit.newPoints++;
      }
    }
  }
  fs.mkdirSync(path.join(root,'data/psa-pop-recovered'),{recursive:true});
  const conflicted=new Set(audit.conflicts.map(x=>x.id+'|'+x.at));
  for(const [sh,group]of groups){
    for(const[id,c]of Object.entries(group.cards)){
      const existingDays=new Set((histories.get(sh).cards[id]||[]).filter(p=>b.observationTime(p[3]?.observedAt)!=null&&p[3]?.specificationIdentity===c.identity&&p[3]?.sourceUrl===c.sourceUrl).map(p=>p[0]));
      const byDay=new Map();
      for(const p of c.points.filter(p=>!conflicted.has(id+'|'+p[3].observedAt)).sort((a,b)=>Date.parse(a[3].observedAt)-Date.parse(b[3].observedAt))){
        if(!existingDays.has(p[0]))byDay.set(p[0],p);
      }
      c.points=[...byDay.values()];audit.recoveredObservationDays+=c.points.length;
      if(c.points.length)audit.cardsRecovered++;
    }
    fs.writeFileSync(path.join(root,'data/psa-pop-recovered',sh+'.json'),JSON.stringify(group));
  }
  audit.note='保存済みGit原票40版以内を調査。原取得日時/完全仕様/現行の正規紐付けが一致する実測のみ回収。newPointsは前回回収ファイル以降の原票点、recoveredObservationDaysは同日を重複除外した回収済み観測日総数。新規HTTP/POP取得0、金融/GOの入力へは接続しない。旧仕様根拠不明と衝突は不採用。';
  fs.writeFileSync(path.join(root,'data/psa-pop-recovery-audit.json'),JSON.stringify(audit));
  console.log(JSON.stringify({...audit,sources:undefined,conflicts:audit.conflicts.length}));return audit;
}
if(require.main===module)run();module.exports={certify,run};
