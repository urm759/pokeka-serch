const assert=require('node:assert/strict'),{probe}=require('./probe_gemrate_public');
(async()=>{
  let calls=0;
  const blocked=await probe(async()=>{calls++;return new Response('denied',{status:403});});
  assert.equal(calls,1);assert.equal(blocked.status,'access-held');assert.equal(blocked.sourceSucceeded,false);assert.equal(blocked.retries,0);
  const page=await probe(async()=>new Response('Updated: 2026-10-23 <button id="csv_download"></button><script>grid.exportDataAsCsv();</script>'));
  assert.equal(page.clientCsvExport,true);assert.equal(page.directCsvLinkPresent,false);assert.equal(page.populationImported,0);
  assert.equal(page.status,'public-page-received-csv-not-verified');
  assert.equal((await probe(async()=>new Response('cf-chl-test',{status:200}))).status,'access-held');
  assert.equal((await probe(async()=>new Response('slow',{status:429,headers:{'retry-after':'3600'}}))).retryAfter,'3600');
  assert.equal((await probe(async()=>{throw new Error('offline');})).status,'transport-failure');
  assert(!JSON.stringify(page).includes('<script>'));assert.equal(page.rawPublished,false);
  console.log('PASS one-request probe, access/rate stop, no invented CSV endpoint, metrics only');
})().catch(e=>{console.error(e);process.exitCode=1;});
