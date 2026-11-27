const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {verify} = require('./check_pages_release');
const root = path.resolve(__dirname, '..');
const read = file => Buffer.from(fs.readFileSync(path.join(root, file.split('?')[0]), 'utf8').replace(/\r\n/g,'\n'));
const checks = Object.fromEntries(['periodMeans','rawReference','listings','priceGap','buybackHolds','transitionLog'].map(k => [k,{mismatches:0,compared:2}]));
const good = () => ({checks, status:'ok'});
async function main() {
  const result = await verify(root,read,good);
  assert(result.protectedScripts > 0 && result.scripts >= result.protectedScripts);
  await assert.rejects(verify(root, f => f.includes('app.js?') ? Buffer.concat([read(f),Buffer.from(' ')]) : read(f),good), /integrity 不一致/);
  await assert.rejects(verify(root, f => f === 'data/ui/manifest.json' ? Buffer.from('{}') : read(f),good), /manifest/);
  await assert.rejects(verify(root,read,() => ({checks:{...checks, transitionLog:{mismatches:1,compared:1}},status:'alert'})), /transitionLog/);
  console.log('PASS published release, changed script bytes, manifest mismatch and offline invariant failure');
}
main().catch(error => { console.error(error); process.exitCode=1; });
