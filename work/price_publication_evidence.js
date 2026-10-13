function verify(run, jobs, publicExecution, pages) {
  const steps=(jobs.jobs || []).flatMap(j=>j.steps || []);
  const stages=['Refresh due purchase prices','Verify safety','Publish validated data'];
  const checked=stages.map(name=>({name,success:steps.some(s=>s.name.startsWith(name)&&s.conclusion==='success')}));
  const failures=steps.filter(s=>s.conclusion==='failure');
  const sourceFailures=(publicExecution.runs||[]).filter(r=>r.processStatus==='failed');
  const partial=run.conclusion==='failure'&&failures.length>0&&failures.every(s=>s.name==='Report independent acquisition failures without hiding them')
    &&sourceFailures.length>0&&sourceFailures.every(r=>r.failureClass==='source-acquisition');
  return {runId:run.id,headSha:run.head_sha,runUrl:run.html_url,event:run.event,
    stages:checked,publicRunMatches:String(publicExecution.runId)===String(run.id),
    pagesRunId:pages?.id || null,pagesUrl:pages?.html_url || null,
    partial,
    confirmed:run.event==='schedule'&&(run.conclusion==='success'||partial)&&checked.every(s=>s.success)
      &&String(publicExecution.runId)===String(run.id)&&pages?.conclusion==='success',
    method:'取得/検証/保存pushの必須step成功＋公開JSONのrunId照合＋Pages成功。独立取得元だけの失敗報告は部分公開と明記。計算/検証/保存失敗は成功扱いにしない'};
}
module.exports={verify};
