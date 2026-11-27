const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const {review, FILES} = require('./gemrate_promotion_review');
const {atomicWrite, lock} = require('./acquisition_retry');
const repo = 'urm759/pokeka-serch';
const outputs = [...FILES, 'data/gemrate-collector-config.json','data/ui/manifest.json'];
const read = file => JSON.parse(fs.readFileSync(file,'utf8'));
const exec = (cmd,args,cwd,input) => cp.execFileSync(cmd,args,{
  cwd,input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:180000,maxBuffer:8e6
}).trim();

function checked(root,store,code) {
  try { return review(root,store,code); }
  catch (error) {
    const message = error.code ? '保存済みの受領ファイルまたは検証用の設定が読めません。' : error.message;
    const failure = new Error(message);
    failure.code = 'GEMRATE_REVIEW_HOLD';
    throw failure;
  }
}

function draft(root, store, set, state, save, signature) {
  const code = set.setCode, manualBranch = 'codex/gemrate-review-'+code.toLowerCase();
  const branch = manualBranch+'-'+signature.slice(0,12);
  const gh = (args,input) => exec('gh',args,root,input);
  checked(root,store,code);
  const prs = JSON.parse(gh(['pr','list','--repo',repo,'--base','main','--search','head:'+manualBranch,'--state','all','--json','url,state,headRefName','--limit','100']));
  const existing = prs.find(p => p.headRefName === branch || (p.state === 'OPEN' && (p.headRefName === manualBranch || p.headRefName.startsWith(manualBranch+'-'))));
  if (existing) return existing.url;
  // A failed push/PR call can be retried without force-updating a branch.
  const ref = 'refs/heads/'+branch;
  const remote = exec('git',['ls-remote','--heads','origin',ref],root).split(/\s/)[0];
  let proposal = state.prepared;
  if (remote && (!proposal || remote !== proposal.sha)) throw Error('既存の提案ブランチは手動確認が必要です');
  if (!remote) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(),'pokeka-gemrate-pr-'));
    const checkout = path.join(dir,'repo');
    let added = false;
    try {
      exec('git',['worktree','add','--detach',checkout,'origin/main'],root);
      added = true;
      if (exec('git',['config','--bool','extensions.worktreeConfig'],checkout) !== 'true') throw Error('作業コピー別の作者設定を確認できません');
      exec('git',['config','--worktree','user.name','urm759 (Codex)'],checkout);
      exec('git',['config','--worktree','user.email','301757673+urm759@users.noreply.github.com'],checkout);
      const result = checked(checkout,store,code);
      for (const [i,v] of [result.reviewed,result.collection].entries()) fs.writeFileSync(path.join(checkout,FILES[i]),JSON.stringify(v,null,2)+'\n');
      for (const file of ['build_gemrate_collector_config','build_ui_data','test_gemrate_multiset','test_ui_data']) {
        exec(process.execPath,['work/'+file+'.js'],checkout);
      }
      exec('git',['add','--',...outputs],checkout);
      const changes = exec('git',['diff','--cached','--name-only'],checkout).split(/\r?\n/);
      if (changes.some(f => !outputs.includes(f)) || !FILES.every(f => changes.includes(f))) throw Error('提案の変更範囲が不一致');
      exec('git',['commit','-m','Review GemRate reference scope for '+code],checkout);
      const {latest, inboxCount, legacyCount, targetReceipts} = result;
      proposal = {sha:exec('git',['rev-parse','HEAD'],checkout),
        body:`${code} の受領 ${targetReceipts} 件を照合しました。最新原票は ${latest.date}、全${latest.rows}行。対象仕様の${latest.eligible}行中${latest.matched}枚が1対1に対応し、重複0件。全受領で20枚以上・対象の半数以上を確認しました。採用仕様は ${latest.parallels.join('・')}。\n\n設定変更後の自動受領は ${inboxCount} 件成功。初期手動原票 ${legacyCount} 件は従来の証跡とバックアップを照合しました。収集設定と UI manifest を再生成し、セット照合と UI テストを通しました。`};
      state.prepared = proposal;
      save();
      exec('git',['push','origin','HEAD:'+ref],checkout);
    } finally {
      if (added) exec('git',['worktree','remove','--force',checkout],root);
      fs.rmdirSync(dir);
    }
  }
  const url = gh(['pr','create','--repo',repo,'--draft','--base','main','--head',branch,'--title','GemRate '+code+' を確認済みに移す','--body-file','-'],proposal.body);
  return url;
}

function reportHold(root,set,reason,signature,command=exec) {
  const issues = JSON.parse(command('gh',['issue','list','--repo',repo,'--label','monitor-alert','--state','all','--json','number,state','--limit','100'],root));
  const issue = issues.find(i => i.state === 'OPEN') || issues[0];
  if (!issue) throw Error('monitor-alert の通知先Issueを確認できません');
  const marker = '<!-- gemrate-review-hold:'+set.setCode+':'+signature+' -->';
  const comments = command('gh',['api','--paginate','repos/'+repo+'/issues/'+issue.number+'/comments?per_page=100','--jq','.[].body'],root);
  if (!comments.includes(marker)) {
    command('gh',['issue','comment',String(issue.number),'--repo',repo,'--body-file','-'],root,
      'GemRate '+set.setCode+' は確認済みへの移行を保留しました。'+reason+'\n'+marker);
  }
  return issue.number;
}

function run(root,store,receivedStatus={}) {
  const release = lock(path.join(store,'.gemrate-promotion.lock'));
  try {
    const ledger = path.join(store,'gemrate-promotion-state.json');
    const state = fs.existsSync(ledger) ? read(ledger) : {};
    const save = () => atomicWrite(ledger,state);
    const collection = read(path.join(root,FILES[1])).sets;
    const receipts = read(path.join(store,'manifest.json')).files;
    if (receivedStatus.browser === 'review' || receivedStatus.inbox === 'review') {
      const reason = '今回のブラウザ受領またはCSV取り込みに未確認の原票があります。全件確認を通過するまで下書き作成を保留します。';
      const key = 'inbox-receipts';
      if (!state.inboxHold) { reportHold(root,{setCode:'受領'},reason,key); state.inboxHold = true; save(); }
      return;
    }
    if (state.inboxHold) { delete state.inboxHold; save(); }
    const errors = [];
    for (const set of collection.filter(s => s.setCode !== 'S6A')) {
      if (!/^[A-Z0-9-]+$/.test(set.setCode)) throw Error('収集セット記号を確認できません');
      const received = receipts.filter(r => r.kind === 'list' && r.context?.set === set.set && r.context.year === set.year);
      if (!received.length) continue;
      const record = state[set.setCode] ||= {};
      const signature = crypto.createHash('sha256').update(JSON.stringify([set,received.map(r => r.sha256).sort()])).digest('hex');
      const input = crypto.createHash('sha256').update(JSON.stringify([signature, receipts.map(r => r.sha256),set.denominator,
        read(path.join(root,FILES[0]))])).digest('hex');
      if (record.checked === signature && (record.pr || record.heldInput === input)) continue;
      try { record.pr = draft(root,store,set,record,save,signature); }
      catch (error) {
        // Operational errors remain retryable. Only a definite review failure opens a hold.
        if (error.code !== 'GEMRATE_REVIEW_HOLD') { errors.push(set.setCode); continue; }
        record.reason = error.message; save();
        const reasonKey = crypto.createHash('sha256').update(signature+error.message).digest('hex');
        record.issue = reportHold(root,set,error.message,reasonKey);
        delete record.pr;
        record.heldInput = input;
      }
      record.checked = signature;
      save();
    }
    if (errors.length) throw Error('下書きの作成・送信を再試行するセット '+errors.join(', '));
  } finally { release(); }
}
module.exports = {run,reportHold};
