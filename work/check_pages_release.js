const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { validatePublishedHtml } = require('./verify_ui_publication');
const invariants = require('./post_publication_invariants');

const base = new URL('https://urm759.github.io/pokeka-serch/');
const checks = ['periodMeans', 'rawReference', 'listings', 'priceGap', 'buybackHolds', 'transitionLog'];
const lf = value => value.replace(/\r\n/g, '\n');

async function fromPages(relative) {
  const url = new URL(relative, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) throw Error('公開サイトの範囲外');
  url.searchParams.set('verify', String(Date.now()));
  const response = await fetch(url, {redirect:'error', signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw Error(relative + ' HTTP ' + response.status);
  return Buffer.from(await response.arrayBuffer());
}

async function verify(root, read = fromPages, recalculate = invariants.run) {
  const saved = file => fs.readFileSync(path.join(root, file), 'utf8');
  const html = (await read('index.html')).toString('utf8');
  try { validatePublishedHtml(html, saved('index.html')); }
  catch { throw Error('index.html の内容または読み込み先の版が公開コミットと違います'); }
  const manifestFile = 'data/ui/manifest.json';
  const manifest = JSON.parse((await read(manifestFile)).toString('utf8'));
  if (!isDeepStrictEqual(manifest, JSON.parse(saved(manifestFile)))) throw Error('UI manifest が公開コミットと違います');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)];
  let protectedScripts = 0;
  for (const [tag, src] of scripts) {
    const asset = new URL(src, base);
    if (asset.origin !== base.origin || !asset.pathname.startsWith(base.pathname)) throw Error('外部スクリプト ' + src);
    const file = asset.pathname.slice(base.pathname.length);
    const bytes = await read(src);
    const integrity = tag.match(/\bintegrity="([^"]+)"/)?.[1];
    if (file === 'app.js' && !integrity) throw Error('app.js の integrity がありません');
    if (integrity) {
      if ('sha384-' + crypto.createHash('sha384').update(bytes).digest('base64') !== integrity) throw Error('integrity 不一致 ' + file);
      protectedScripts++;
    }
    if (lf(bytes.toString('utf8')) !== lf(saved(file))) throw Error('公開版の内容が違います ' + file);
  }
  if (!scripts.some(([,src]) => new URL(src,base).pathname === base.pathname+'app.js')) throw Error('app.js がありません');
  const result = recalculate(root);
  for (const key of checks) {
    const c = result.checks[key];
    if (!c || c.error || c.mismatches !== 0 || !Number.isInteger(c.compared)) throw Error('独立検査 ' + key + ' ' + JSON.stringify(c));
  }
  if (result.status !== 'ok') throw Error('独立検査を完了できませんでした');
  return {revision:manifest.revision, scripts:scripts.length, protectedScripts, checks:result.checks};
}

if (require.main === module) verify(path.resolve(__dirname,'..')).then(result => console.log(JSON.stringify(result)))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = {verify};
