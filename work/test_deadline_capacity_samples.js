const assert = require('node:assert/strict');
const { measuredDeadlineRun } = require('./refresh_capacity');
const now = Date.parse('2026-10-11T00:00:00Z');
const r = {sourceId:'hareruya2',mode:'deadline-price-refresh',startedAt:'2026-10-10T00:00:00Z',refreshedCount:100,durationMs:300000};
assert.equal(measuredDeadlineRun([r,{...r,mode:'completion-backfill',refreshedCount:7,durationMs:13000}],r.sourceId,now).refreshedCount,100);
assert.equal(measuredDeadlineRun([{...r,mode:'completion-backfill'}],r.sourceId,now),null);
assert.equal(measuredDeadlineRun([{...r,startedAt:'2026-10-12T00:00:00Z'}],r.sourceId,now),null);
assert.equal(measuredDeadlineRun([{...r,startedAt:'2026-09-01T00:00:00Z'}],r.sourceId,now),null);
assert.equal(measuredDeadlineRun([r,{...r,refreshedCount:200},{...r,refreshedCount:300}],r.sourceId,now).refreshedCount,200);
console.log('Deadline capacity sample isolation passed');
const {deadlineCoverage}=require('./coverage_capacity');
const start={atMs:now},after=h=>now+h*3600000;
const pairs=[
  {start,end:{id:'on-time',atMs:after(4),pushedAt:after(5),verifiedAt:after(6)}},
  {start,end:{id:'uncertain',atMs:after(4),pushedAt:after(5),verifiedAt:after(7)}},
  {start,end:{id:'late',atMs:after(4),pushedAt:after(6.1),verifiedAt:after(7)}},
];
assert.deepEqual(deadlineCoverage(pairs,now,6),{compared:3,confirmedOnTime:1,confirmedLate:1,publicationTimeUncertain:1,distinctCards:3,onTimeLowerBoundPct:1/3*100});
const {startBeforeDeadline}=require('./coverage_capacity');
const requestAt=h=>new Date(after(h)).toISOString();
assert.deepEqual(startBeforeDeadline([
  pairs[0],
  {start,end:{atMs:after(7),requestStartedAt:requestAt(6)}},
  {start,end:{atMs:after(7),requestStartedAt:requestAt(6.1)}},
  {start,end:{atMs:after(7)}},
  {start,end:{atMs:after(7),requestStartedAt:requestAt(8)}},
],now,6),{confirmedBeforeOrAt:2,confirmedLate:1,unknown:2,compared:5,lowerBoundPct:40});
