const assert=require('node:assert/strict'),fs=require('node:fs'),{validatePublishedHtml}=require('./verify_ui_publication');
const html=fs.readFileSync('index.html','utf8');
validatePublishedHtml(html,html);
validatePublishedHtml(html.replace(/\r?\n/g,'\r\n'),html);
assert.throws(()=>validatePublishedHtml(html.replace(/app\.js\?v=[^" ]+/,'app.js?v=old-version'),html));
assert.throws(()=>validatePublishedHtml(html.replace('value="obs200"','value="removed"'),html));
assert.throws(()=>validatePublishedHtml(html.replace('efficiencyMinInput','unexpectedMissingInput'),html));
console.log('PASS published HTML: exact version and cache URLs, existing features, CRLF; old/partial HTML rejected');
