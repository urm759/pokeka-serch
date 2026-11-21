const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { designRecord, documents, manifest, output, patch, save } = require('./ai_pipeline');
const { digest, git, inspect, safeText } = require('./ai_pipeline_gate');
const { validate } = require('./ai_pipeline_schema');

const labels = { pass: '合格', unresolved: '未解決', decision: '要判断', incomplete: '未完了', stopped: '中断' };

function decide(d) {
  const design = d.design.design;
  if (design?.needs_user_decision.required) return { status: 'decision', round: 0 };
  if ([1, 2].some(r => d['verify-' + r].gate?.accepted === false)) return { status: 'stopped', round: 0 };
  const round = d['verify-2'].gate?.accepted ? 2 : d['verify-1'].gate?.accepted ? 1 : 0;
  if (!round) return { status: 'incomplete', round };
  const review = d['review-' + round].review;
  const tests = d['verify-' + round].tests;
  if (!review || !tests) return { status: 'incomplete', round };
  if (review.verdict === 'blocked') return { status: 'decision', round };
  if (round === 1 && review.verdict === 'changes_required') return { status: 'incomplete', round };
  return { status: review.verdict === 'pass' && tests.passed ? 'pass' : 'unresolved', round };
}

const tidy = value => String(value ?? '').replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/[<>@]/g, c => ({ '<': '&lt;', '>': '&gt;', '@': '＠' })[c]);
const lines = (name, values) => values?.length ? '\n### ' + name + '\n' + values.map(x => '- ' + tidy(x)).join('\n') + '\n' : '';

function render(m, request, d, result) {
  const design = d.design.design;
  const attempted = prefix => Object.entries(d).filter(([stage, x]) => prefix.test(stage) && x.attempt).length;
  const elapsed = Math.max(0, Math.round((Date.now() - Date.parse(m.started_at)) / 1000));
  const rounds = [1, 2].map(round => {
    const g = d['verify-' + round].gate;
    const t = d['verify-' + round].tests;
    const i = d['implement-' + round].implementation;
    const r = d['review-' + round].review;
    if (!g && !t && !i && !r) return '';
    for (const [role, value] of [['gate', g], ['tests', t], ['implementation', i], ['review', r]]) {
      if (value) validate(role, value);
    }
    const failedTests = t?.checks.filter(x => x.exit_code) || [];
    return '\n## Round ' + round + '\n' + [
      '実装: ' + tidy(i?.summary || '記録なし'),
      '差分ゲート: ' + (g?.accepted ? '通過 · tree `' + tidy(g.tree) + '`' : tidy(g?.reason || '未確認')),
      '独立テスト: ' + (t ? (t.checks.length - failedTests.length) + '/' + t.checks.length + ' 成功' : '未確認'),
      'レビュー: ' + tidy(r?.verdict || '未確認')
    ].join('\n\n') + '\n'
      + lines('変更ファイル', g?.files) + lines('失敗テスト', failedTests.map(x => x.command + ' — ' + x.log))
      + lines('実装側のテスト報告', i?.tests) + lines('実測', i?.measurements) + lines('レビュー対象', i?.review_focus)
      + lines('合格条件', r?.criteria.map(c => c.id + ' · ' + c.status + ' · ' + c.evidence))
      + lines('指摘', r?.findings.map(f => f.id + ' · ' + f.severity + ' · ' + f.file + ':' + f.line + ' · ' + f.problem + ' · ' + f.fix))
      + lines('修正結果', i?.findings.map(f => f.id + ' · ' + f.status + ' · ' + f.reason))
      + lines('前回指摘の確認', r?.prior_findings.map(f => f.id + ' · ' + f.status + ' · ' + f.evidence))
      + lines('未確認', [...(i?.unverified || []), ...(r?.unverified || [])])
      + lines('改善案', [...(i?.suggestions || []), ...(r?.suggestions || [])])
      + lines('公開後に確認', r?.post_publish_checks);
  }).join('');
  const url = envLink();
  return [
    '# AI開発 · ' + labels[result.status],
    '実行: ' + m.mode + ' · 基準: `' + m.base_sha + '` · ' + elapsed + '秒',
    'AI起動ステップ到達: Claude ' + attempted(/^(design|review)/) + '/3 · Codex ' + attempted(/^implement/) + '/2',
    url && '[Actions実行・証跡](' + url + ')',
    '## 依頼\n' + tidy(request),
    '## 設計\n' + tidy(design?.summary || '設計記録なし'),
    lines('根拠', design?.rationale),
    lines('リスク', design?.risks),
    lines('公開後に確認', design?.post_publish_checks),
    design?.needs_user_decision.required ? '**要判断** ' + tidy(design.needs_user_decision.reason) : '',
    rounds,
    result.round ? '公開・マージは利用者が判断してください。' : '下書きPRの作成対象となる検証済み差分はありません。'
  ].filter(Boolean).join('\n\n');
}

function envLink() {
  const { GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: id } = process.env;
  return /^[\w.-]+\/[\w.-]+$/.test(repo || '') && /^\d+$/.test(id || '') ? 'https://github.com/' + repo + '/actions/runs/' + id : '';
}

function summarize(text) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
}

function report(candidate, exchangeRequest) {
  const m = manifest();
  const request = fs.readFileSync(exchangeRequest, 'utf8');
  if (digest(request) !== m.request_sha256) throw Error('Request checksum mismatch');
  const docs = documents();
  const result = decide(docs);
  const body = render(m, request, docs, result);
  save('summary.md', body);
  save('result.json', result);
  summarize(body);
  if (!result.round) return;
  const { tree, patchSha256 } = docs['verify-' + result.round].gate;
  const checked = inspect(candidate, patch(result.round), designRecord(), m.allow_data_changes);
  if (checked.tree !== tree || checked.patchSha256 !== patchSha256 || git(candidate, ['rev-parse', 'HEAD']).toString().trim() !== m.base_sha) {
    throw Error('Draft checkout differs from verified snapshot');
  }
  output('publishable', 'true');
}

function publish(candidate, metadataPath) {
  const m = manifest();
  const result = decide(documents());
  if (!result.round || (m.mode === 'stub' && process.env.GITHUB_REPOSITORY === 'urm759/pokeka-serch')) throw Error('Publication is not enabled for this result');
  if (process.env.GITHUB_ACTOR !== process.env.AI_OWNER || process.env.GITHUB_TRIGGERING_ACTOR !== process.env.AI_OWNER) throw Error('Owner verification failed');
  const token = process.env.GH_TOKEN;
  if (!token) throw Error('GitHub publication token missing');
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  if (metadata.status !== result.status || metadata.round !== result.round) throw Error('Result changed before draft creation');
  const { tree } = readGate(result.round);
  if (git(candidate, ['write-tree']).toString().trim() !== tree || git(candidate, ['rev-parse', 'HEAD']).toString().trim() !== m.base_sha) {
    throw Error('Staged tree does not match the verified patch');
  }
  git(candidate, ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
    'commit', '--no-gpg-sign', '-m', 'AI development run ' + m.run_id + ' round ' + result.round]);
  const auth = Buffer.from('x-access-token:' + token).toString('base64');
  const pushEnv = { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader', GIT_CONFIG_VALUE_0: 'AUTHORIZATION: basic ' + auth };
  delete pushEnv.GH_TOKEN;
  git(candidate, ['push', 'origin', 'HEAD:refs/heads/' + m.branch], { env: pushEnv });
  const repo = process.env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw Error('Invalid repository');
  const body = fs.readFileSync(path.join(path.dirname(metadataPath), 'summary.md'), 'utf8');
  const stagedSha = git(candidate, ['rev-parse', 'HEAD']).toString().trim();
  const pr = JSON.parse(execFileSync('gh', ['api', 'repos/' + repo + '/pulls', '--method', 'POST', '--input', '-'], {
    input: JSON.stringify({
      title: '[AI·' + labels[result.status] + '] 開発依頼 ' + m.run_id, head: m.branch, base: m.base_ref, draft: true,
      body: safeText(body) + '\n\n実装コミット: `' + stagedSha + '`\n'
    }), stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8'
  }));
  if (!pr.draft || pr.head?.sha !== stagedSha || !pr.html_url?.startsWith('https://github.com/' + repo + '/pull/')) {
    throw Error('Draft PR response did not match the verified commit');
  }
  summarize('\n[下書きPR](' + pr.html_url + ') · 実装コミット `' + stagedSha + '`');
  save('draft.json', { url: pr.html_url, commit: stagedSha, draft: true });
}

function readGate(round) {
  return documents()['verify-' + round].gate;
}

if (require.main === module) {
  const [action, candidate, file] = process.argv.slice(2);
  try {
    if (action === 'report') report(candidate, file);
    else if (action === 'publish') publish(candidate, file);
    else throw Error('Unknown report command');
  } catch {
    summarize('AI開発の取りまとめまたは下書きPR作成を完了できませんでした。認証、実行結果、既存の作業ブランチを確認してください。');
    process.exitCode = 1;
  }
}

module.exports = { decide, render };
