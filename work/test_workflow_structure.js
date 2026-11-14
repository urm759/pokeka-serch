const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{jobProperty,testCommands}=require('./workflow_structure');
const actual=fs.readFileSync(path.join(__dirname,'../.github/workflows/watch-data-health.yml'),'utf8'),expression=jobProperty(actual,'catchup','if');assert(expression?.includes('github.event_name'));
const fields={outputs:"    outputs:\n      published_receipt_run_id: ${{ steps.publication.outputs.id }}\n",env:"    env:\n      EXAMPLE: value\n",if:'    if: >-\n      github.event_name != \'workflow_run\' ||\n      github.event.workflow_run.head_branch == \'main\'\n',concurrency:'    concurrency:\n      group: shared\n',steps:'    steps:\n      - run: node work/test_fixture.js\n        if: false\n'};
for(const order of [['outputs','if','concurrency','steps'],['env','concurrency','outputs','if','steps'],['steps','if','outputs','env'],['if','outputs','concurrency','steps']]){
 const text='jobs:\n  catchup:\n'+order.map(k=>fields[k]).join('')+'  neighbor:\n    if: false\n    steps:\n      - run: node work/test_other.js\n';
 for(const value of [text,text.replace(/\n/g,'\r\n')])assert.equal(jobProperty(value,'catchup','if'),"github.event_name != 'workflow_run' || github.event.workflow_run.head_branch == 'main'");
}
assert.equal(jobProperty('jobs:\n  catchup:\n    outputs:\n      if: false\n    steps:\n      - if: false\n        run: echo ok\n  neighbor:\n    if: true\n','catchup','if'),null,'nested and neighboring if do not replace a missing job gate');
assert.throws(()=>jobProperty('jobs:\n  catchup:\n    if: true\n    if: false\n','catchup','if'),/Duplicate/);
assert.throws(()=>jobProperty('jobs:\n  other:\n    if: true\n','catchup','if'),/job missing/);
assert.deepEqual(testCommands('jobs:\n  a:\n    steps:\n      - run: |\n          # node work/test_comment.js\n          echo "node work/test_echo.js"\n          node --check work/test_syntax_only.js\n          node work/test_actual.js\n      - run: node work/test_inline.js\n'),['work/test_actual.js','work/test_inline.js']);
console.log('PASS job ownership, outputs/env/concurrency reordering, folded conditions, nested/neighbor isolation, CRLF, duplicate/missing gate and executable test inventory');
