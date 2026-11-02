const assert=require('node:assert/strict'),{create}=require('../keyed-card-renderer');
const container={children:[],get firstElementChild(){return this.children[0]||null},insertBefore(n,c){n.remove();this.children.splice(c?this.children.indexOf(c):this.children.length,0,n);n.parentNode=this;}};
function parse(text){
 const input=JSON.parse(text),node={children:[],parentNode:null,querySelectorAll:()=>node.children,remove(){if(this.parentNode){this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);this.parentNode=null;}},get nextElementSibling(){return this.parentNode?.children[this.parentNode.children.indexOf(this)+1]||null;}};
 node.children=input.map(r=>({tagName:'DETAILS',id:r.id||'',open:r.open||false,parentElement:node,children:[{tagName:'SUMMARY',textContent:r.label}]}));return node;
}
const commit=create(parse),row=(n,main=false)=>[{id:'same',html:JSON.stringify([{label:'旧公式値・根拠'},{id:'main',label:'計算内訳',open:main},{label:'遅延データ '+n}])}];
commit(container,row(0));container.children[0].children[0].open=true;
commit(container,row(1));assert.equal(container.children[0].children[0].open,true,'lazy summary change must not close an open small disclosure');
container.children[0].children[0].open=false;commit(container,row(2));assert.equal(container.children[0].children[0].open,false,'closed state also persists');
commit(container,row(3,true));assert.equal(container.children[0].children[1].open,true,'explicit model open is not overwritten by old DOM state');
const repeated=JSON.stringify([{label:'same'},{label:'same'}]);commit(container,[{id:'same',html:repeated}]);container.children[0].children[0].open=true;
commit(container,[{id:'same',html:JSON.stringify([{label:'same'},{label:'same'},{label:'new'}])}]);assert.equal(container.children[0].children[0].open,false,'ambiguous duplicates must not transfer state to another disclosure');
commit(container,[{id:'other',html:JSON.stringify([{label:'旧公式値・根拠'}])}]);assert.equal(container.children[0].children[0].open,false,'another card never inherits disclosure state');
console.log('PASS nested disclosure open/closed retention, app-controlled transitions, ambiguous labels and card isolation');
const {replaceContent}=require('../keyed-card-renderer');
let writes=0;
const advisory=parse(JSON.stringify([{label:'旧公式値・根拠'}]));
Object.defineProperty(advisory,'innerHTML',{set(text){writes++;advisory.children=parse(text).children;for(const d of advisory.children)d.parentElement=advisory;}});
advisory.children[0].open=true;
assert(replaceContent(advisory,JSON.stringify([{label:'旧公式値・根拠'},{label:'new'}])));
assert.equal(advisory.children[0].open,true,'direct async reference replacement retains native state');
const writesBefore=writes;
assert.equal(replaceContent(advisory,JSON.stringify([{label:'旧公式値・根拠'},{label:'new'}])),false);
assert.equal(writes,writesBefore,'open attribute serialization never causes repeated replacement');
const lateContainer={...container,children:[]},lateCommit=create(parse);
lateCommit(lateContainer,[{id:'late',html:'[]'}]);const inserted=parse(JSON.stringify([{label:'旧公式値・根拠'}])).children[0];inserted.parentElement=lateContainer.children[0];inserted.open=true;lateContainer.children[0].children.push(inserted);
lateCommit(lateContainer,[{id:'late',html:JSON.stringify([{label:'旧公式値・根拠'}])}]);assert.equal(lateContainer.children[0].children[0].open,true,'async-inserted details also survive the next whole-card repaint');
