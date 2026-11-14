const fs=require('node:fs'),path=require('node:path');
function ids(root,source){
 const read=f=>fs.existsSync(path.join(root,f))?JSON.parse(fs.readFileSync(path.join(root,f),'utf8')):{};
 if(source==='torecacamp'){
  const file='work/camp-fixed-cohort.json';
  if(fs.existsSync(path.join(root,file))){const r=read(file);if(r.version!==1||r.source!==source||r.ids?.length!==144||new Set(r.ids).size!==144)throw Error('Camp fixed cohort changed or invalid');return r.ids;}
 }
 const history=read('work/priority-freshness-history.json');
 if(source==='torecacamp'&&!history.sources?.[source]?.cohort){const summary=read('data/torecacamp-stock-summary.json');return (history.sources?.hareruya2?.cohort||[]).filter(id=>summary.cards?.[id]);}
 return history.sources?.[source]?.cohort||[];
}
module.exports={ids};
