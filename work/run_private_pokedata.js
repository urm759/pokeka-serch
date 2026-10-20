const fs = require('node:fs'), path = require('node:path');
const access = require('./overseas_access_policy'), api = require('./pokedata_official_api');
const retry = require('./acquisition_retry'), analysis = require('./private_overseas_analysis');
async function run(root, options = {}) {
  if(access.cancelled(root))return {status:'cancelled',httpRequests:0,acquired:0,checkpointPreserved:true};
  const started = Date.now(), file = access.privatePath(root, 'api/queue.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const release = retry.lock(file + '.lock');
  try {
    let state = { cards: {} };
    if (fs.existsSync(file)) state = JSON.parse(fs.readFileSync(file, 'utf8'));
    const receipt = { startedAt: new Date().toISOString(), attempted: 0, acquired: 0, newAcquired: 0, specificationHeld: 0, httpRequests: 0,
      llmCalls: 0, codexCalls: 0, status: 'permission-wait', publication: 'private-only' };
    if (access.allowed(root)) {
      const configFile = access.privatePath(root, 'api/config.json');
      const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};
      if (!(Number.isInteger(config.approvedCredits) && config.approvedCredits > 0)) receipt.status = 'budget-approval-wait';
      else if (!process.env.POKEDATA_API_TOKEN && !options.token) receipt.status = 'authentication-wait';
      else {
        const meta = analysis.metadata(root), targets = JSON.parse(fs.readFileSync(path.join(root, 'work/search-profile-targets.json'), 'utf8'));
        const wanted = new Set((targets.profiles || []).flatMap(p => (p.prospects || []).map(c => c.id)));
        const candidates = meta.mappings.filter(m => !state.cards[m.localCardId]?.held
          && (!state.cards[m.localCardId]?.lastSuccessAt || Date.now() - Date.parse(state.cards[m.localCardId].lastSuccessAt) >= 86400000));
        // One in five positions is reserved for ordinary exploration, not repeated current candidates.
        const priority = candidates.filter(m => wanted.has(m.localCardId)), ordinary = candidates.filter(m => !wanted.has(m.localCardId));
        for (const list of [priority, ordinary]) list.sort((a, b) => (Date.parse(state.cards[a.localCardId]?.lastAttemptAt) || 0) - (Date.parse(state.cards[b.localCardId]?.lastAttemptAt) || 0) || a.localCardId.localeCompare(b.localCardId));
        const queue = [];
        while (priority.length || ordinary.length) {
          queue.push(...priority.splice(0, 4), ...ordinary.splice(0, 1));
          if (!priority.length) queue.push(...ordinary.splice(0));
        }
        const timeBudget = Math.min(300000, Math.max(1000, Number(config.timeBudgetMs) || 60000));
        receipt.status = queue.length ? 'time-budget' : 'no-eligible-targets';
        for (const mapping of queue) {
          if (Date.now() - started >= timeBudget) break;
          const old = state.cards[mapping.localCardId] || {};
          receipt.attempted++;
          try {
            const response = await api.request(root, 'pricing', { id: mapping.providerId, asset_type: 'CARD' },
              { approvedCredits: config.approvedCredits, token: options.token, fetcher: options.fetcher, onRequest: () => { receipt.httpRequests++; } });
            if (!analysis.verifyPayload(response.payload, mapping)) {
              receipt.specificationHeld++;
              state.cards[mapping.localCardId] = { ...old, held: true, reason: '公式APIと保存済み仕様の不一致', lastAttemptAt: response.capturedAt, privateFile: response.privateFile };
            } else {
              const normalized = api.pricing(response.payload, { capturedAt: response.capturedAt, fx: config.fx });
              normalized.identity = mapping.identity;
              normalized.localCardId = mapping.localCardId;
              normalized.sourceUrl = mapping.sourceUrl;
              const saved = access.privatePath(root, 'prices/' + mapping.localCardId + '.json');
              fs.mkdirSync(path.dirname(saved), { recursive: true }); retry.atomicWrite(saved, normalized);
              receipt.acquired++;
              if (!old.lastSuccessAt) receipt.newAcquired++;
              state.cards[mapping.localCardId] = { ...old, lastAttemptAt: response.capturedAt, lastSuccessAt: response.capturedAt, privateFile: response.privateFile, held: false };
            }
          } catch (error) {
            const classified = retry.classify(error);
            // Persist only known classifications, never tokens, request headers or arbitrary API errors.
            state.cards[mapping.localCardId] = { ...old, lastAttemptAt: new Date().toISOString(), reason: classified.kind };
            receipt.status = classified.kind + '-wait';
            retry.atomicWrite(file, { ...state, lastRun: receipt });
            if (classified.scope === 'source' || /budget|exhausted|waiting/.test(error.message)) break;
          }
          retry.atomicWrite(file, { ...state, lastRun: receipt });
        }
      }
    }
    receipt.endedAt = new Date().toISOString(); receipt.durationMs = Date.now() - started;
    state.lastRun = receipt; retry.atomicWrite(file, state);
    // Analysis/publication is local only; no public builder imports the private output.
    analysis.build(root);
    return receipt;
  } finally { release(); }
}
if (require.main === module) run(path.resolve(__dirname, '..')).then(r => console.log(JSON.stringify({ status: r.status, httpRequests: r.httpRequests, privateCheckpointSaved: r.status!=='cancelled' }))).catch(() => { console.error('Private PokeDATA processing failed; inspect local checkpoint'); process.exitCode = 1; });
module.exports = { run };
