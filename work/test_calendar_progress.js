const assert=require('node:assert/strict'),{summarize}=require('./calendar_progress');
const now=Date.parse('2026-10-13T00:00:00Z');
const samples=[{at:'2026-10-10T00:00:00Z',verified:true,confirmed:60,usableNet:1,durationMs:60000},{at:'2026-10-13T00:00:00Z',verified:true,confirmed:60,usableNet:2,durationMs:60000},{at:'2026-10-12T00:00:00Z',verified:false,confirmed:1000,durationMs:1}];
const s=summarize(samples,now);assert.equal(s.runningItemsPerMinute,60);assert.equal(s.confirmedPerCalendarDay,30);assert.equal(s.calendarDays,4);assert.equal(s.activeDays,2);assert.equal(s.usableNetPerCalendarDay,.75);assert.equal(s.completionEstimate,null);
assert.equal(summarize([],now).confirmedPerCalendarDay,null);assert.equal(summarize([{...samples[0],durationMs:null}],now).runningItemsPerMinute,null);
const cadence=require('./refresh_cadence').audit([{id:1,event:'schedule',created_at:'2026-10-10T00:00:00Z',updated_at:'2026-10-10T00:01:00Z',conclusion:'failure'}],{now,verifiedRuns:[{key:'priority',runId:1,recordedAt:'2026-10-10T00:01:00Z'},{key:'catchup',runId:2,recordedAt:'2026-10-10T03:01:00Z'}]});
assert.equal(cadence.successSampleCount,0);assert.equal(cadence.verifiedPublicationCadence.samples,2);assert.equal(cadence.verifiedPublicationCadence.latestMs,3*3600000);
console.log('PASS calendar days include inactive days; verified publication only, unknown runtime not zero, no unsupported ETA');
