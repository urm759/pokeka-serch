const assert = require('node:assert/strict');
const {matchRows,checkCoverage} = require('./gemrate_promotion_review');
const {reportHold} = require('./gemrate_promotion_pr');
assert.doesNotThrow(() => checkCoverage(20,40));
assert.throws(() => checkCoverage(20,41), /21枚/);
assert.throws(() => checkCoverage(19,19), /20枚/);
assert.throws(() => checkCoverage(50,165), /83枚/);
assert.doesNotThrow(() => checkCoverage(46,63));
const context = {grader:'PSA',language:'Japanese',set:'Pokemon Japanese Example',year:2019,
  pageUrl:'https://www.gemrate.com/item-details?grader=psa&category=tcg-cards&set_name=Pokemon+Japanese+Example&year=2019',
  sourceUpdatedDate:'2026-11-01',retrievedAt:'2026-11-02T00:00:00Z',contextProof:'sha256:'+'a'.repeat(64)};
const header = 'Card #,Name,Parallel,Gems,Total\n';
const rows = ['1,Pikachu,Base,10,15','2,Pikachu Error,Base,10,15','3,Pikachu,Reverse Holo,10,15','4,Unmatched,Art Rare,10,15'];
const check = input => matchRows(Buffer.from(header+input.join('\n')),context,{setCode:'EX',denominator:10},[],{},[]);
assert.equal(check(rows).eligible,2);
assert.equal(check(rows).matched,0);
assert.throws(() => check([...rows,rows[0]]), /重複/);
const comments = [];
const fake = (cmd,args,cwd,input) => {
  assert.equal(cmd,'gh');
  if (args[1] === 'list') return JSON.stringify([{number:124,state:'OPEN'}]);
  if (args[0] === 'api') return comments.join('\n');
  assert.deepEqual(args.slice(0,3), ['issue','comment','124']);
  comments.push(input);
};
for (let i=0;i<2;i++) reportHold('.', {setCode:'MC'}, '対象165行中50枚', 'same', fake);
assert.equal(comments.length,1);
assert.match(comments[0],/対象165行中50枚/);
console.log('PASS threshold boundaries, prospective denominator, error prints, duplicate CSV and one monitor comment');
