// Read the mapping/block-scalar subset used by our checked-in workflows.
// Indentation determines ownership; property order and adjacent properties do
// not. Unsupported/missing/duplicate mappings fail explicitly, never as null[1].
function lines(text){const out=String(text).replace(/\r\n/g,'\n').split('\n');if(out.some(s=>/^\s*\t/.test(s)))throw Error('Workflow indentation contains tabs');return out;}
const significant=s=>s.trim()&&!/^\s*#/.test(s);
const indent=s=>s.match(/^ */)[0].length;
function entries(rows,start,end,parentIndent){
 const candidates=[];for(let i=start;i<end;i++)if(significant(rows[i])&&indent(rows[i])>parentIndent)candidates.push(i);
 if(!candidates.length)return [];
 const level=candidates.reduce((level,i)=>Math.min(level,indent(rows[i])),Infinity),result=[],seen=new Set();
 for(const i of candidates.filter(i=>indent(rows[i])===level)){
  const m=rows[i].trim().match(/^([A-Za-z_][\w-]*):(?:\s+(.*))?$/);if(!m)throw Error('Unsupported workflow mapping at line '+(i+1));
  if(seen.has(m[1]))throw Error('Duplicate workflow mapping '+m[1]);seen.add(m[1]);
  result.push({key:m[1],value:m[2]||'',start:i,end,indent:level});
 }
 for(let i=0;i<result.length-1;i++)result[i].end=result[i+1].start;
 return result;
}
function entry(rows,parent,key){return entries(rows,parent.start+1,parent.end,parent.indent).find(e=>e.key===key)||null;}
function jobProperty(text,id,property){
 const rows=lines(text),root={start:-1,end:rows.length,indent:-1},jobs=entry(rows,root,'jobs');if(!jobs)throw Error('Workflow jobs mapping missing');
 const job=entry(rows,jobs,id);if(!job)throw Error('Workflow job missing: '+id);
 const node=entry(rows,job,property);if(!node)return null;
 const value=node.value.trim();
 if(/^[>|][-+]?$/.test(value))return rows.slice(node.start+1,node.end).filter(s=>s.trim()).map(s=>s.trim()).join(value[0]==='>'?' ':'\n').trim();
 return value;
}
function runBlocks(text){
 const rows=lines(text),result=[];
 for(let i=0;i<rows.length;i++){
  const m=rows[i].match(/^( *)(?:- )?run:\s*(.*)$/);if(!m)continue;
  if(!/^[>|][-+]?$/.test(m[2].trim())){result.push(m[2]);continue;}
  const level=m[1].length;let end=i+1;while(end<rows.length&&(!significant(rows[end])||indent(rows[end])>level))end++;
  result.push(rows.slice(i+1,end).join('\n'));i=end-1;
 }return result;
}
function testCommands(text){return [...new Set(runBlocks(text).flatMap(block=>[...block.matchAll(/^\s*node\s+["']?(work\/test_[\w-]+\.js)\b/gm)].map(m=>m[1])))].sort();}
module.exports={jobProperty,runBlocks,testCommands};
