function verify(run, jobs, publicExecution, pages) {
  const steps=(jobs.jobs || []).flatMap(j=>j.steps || []);
  const stages=['Refresh due purchase prices','Verify safety','Publish validated data'];
  const checked=stages.map(name=>({name,success:steps.some(s=>s.name.startsWith(name)&&s.conclusion==='success')}));
  return {runId:run.id,headSha:run.head_sha,runUrl:run.html_url,event:run.event,
    stages:checked,publicRunMatches:String(publicExecution.runId)===String(run.id),
    pagesRunId:pages?.id || null,pagesUrl:pages?.html_url || null,
    confirmed:run.event==='schedule'&&run.conclusion==='success'&&checked.every(s=>s.success)
      &&String(publicExecution.runId)===String(run.id)&&pages?.conclusion==='success',
    method:'取得/検証/保存pushの必須step成功＋公開JSONのrunId照合＋Pages成功。処理成功だけで公開済みにしない'};
}
module.exports={verify};
