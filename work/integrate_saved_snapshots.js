const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const stable=value=>JSON.stringify(value??null,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
function merge(base,ours,theirs,location='') {
  if(stable(ours)===stable(theirs) || stable(base)===stable(theirs))return ours;
  if(stable(base)===stable(ours))return theirs;
  if([base,ours,theirs].every(v=>v && typeof v==='object'&&!Array.isArray(v))) {
    const result={};
    for(const key of new Set([...Object.keys(base),...Object.keys(ours),...Object.keys(theirs)])) {
      const value=merge(base[key],ours[key],theirs[key],location+'/'+key);
      if(value!==undefined)result[key]=value;
    }
    return result;
  }
  throw new Error('Concurrent value conflict; preserved Git stages: '+location);
}
function mergeRows(base,ours,theirs,key) {
  const maps=[base,ours,theirs].map(rows=>{
    const result=Object.fromEntries(rows.map(row=>[row[key],row]));
    if(Object.keys(result).length!==rows.length)throw new Error('Duplicate snapshot identity');
    return result;
  });
  return Object.values(merge(...maps));
}
function mergeHistory(base,ours,theirs) {
  const byDate=history=>Object.fromEntries(Object.entries(history.stocks).map(([id,values])=>[id,Object.fromEntries(history.dates.map((date,i)=>[date,values[i]??null]))]));
  const values=merge(byDate(base),byDate(ours),byDate(theirs));
  const dates=[...new Set([...base.dates,...ours.dates,...theirs.dates])].sort();
  return {dates,stocks:Object.fromEntries(Object.entries(values).map(([id,v])=>[id,dates.map(date=>v[date]??null)]))};
}
function run() {
  const read=(stage,file)=>JSON.parse(execFileSync('git',['show',`:${stage}:${file}`],{encoding:'utf8',maxBuffer:50*1024*1024}));
  const output=[];
  for(const [file,key] of [['data/pokemon-cards.json','id'],['work/hareruya2_catalog.json','cardId']]) {
    const rows=[1,2,3].map(stage=>read(stage,file));
    output.push([file,mergeRows(...rows,key)]);
  }
  const file='work/hareruya2_stock_history.json';
  output.push([file,mergeHistory(...[1,2,3].map(stage=>read(stage,file)))]);
  // Validate every source before writing any merged snapshot; unresolved values require human review.
  for(const [file,data] of output)fs.writeFileSync(file,JSON.stringify(data));
  console.log(JSON.stringify(output.map(([file,data])=>({file,records:Array.isArray(data)?data.length:Object.keys(data.stocks).length}))));
}
if(require.main===module)run();
module.exports={merge,mergeRows,mergeHistory};
