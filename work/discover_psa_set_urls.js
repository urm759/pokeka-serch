const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..");
const FILE = path.join(ROOT, "data/psa-set-discovery.json");
function candidates(html) {
  const urls = [...new Set([...String(html).matchAll(/(?:https:\/\/www\.psacard\.com)?\/pop\/tcg-cards\/\d{4}\/pokemon-japanese-[a-z0-9-]+\/\d+/gi)].map((m) => new URL(m[0], "https://www.psacard.com").href))];
  return urls.map((url) => ({ url, setCode: url.match(/pokemon-japanese-((?:sv|sm|xy|bw|s|m)\d[a-z0-9]*)-/i)?.[1]?.toUpperCase() || null, status: "候補・手動照合待ち", reason: "公式の実リンク。未取得POP・絵柄・年代の確認前に自動登録しない" }));
}
async function run() {
  let old = {}; try { old = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch {}
  if (old.manualWait && process.env.PSA_DISCOVERY_RETRY !== "1") { console.log(JSON.stringify({ status: "manual-wait", reason: old.stopReason, checkpoint: old.url, httpRequests: 0 })); return; }
  const url = "https://www.psacard.com/pop/tcg-cards/156940";
  const state = { ...old, attemptedAt: new Date().toISOString(), url, httpRequests: 1, candidates: old.candidates || [], stopReason: null };
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "PokekaDataCollector/1.0" } });
    state.httpStatus = response.status;
    if ([401, 403].includes(response.status)) { state.manualWait = true; throw new Error(`HTTP ${response.status}・正規認証確認待ち。回避しない`); }
    if (!response.ok) throw new Error(`HTTP ${response.status}・次回のみ再試行`);
    const html = await response.text();
    if (/cf-chl|just a moment|verify you are human/i.test(html)) { state.manualWait = true; throw new Error("認証確認待ち。回避しない"); }
    const found = candidates(html);
    if (!found.length) { state.manualWait = true; throw new Error("公開HTMLにセットリンクなし・形式／認証を確認。取得0件を成功扱いしない"); }
    state.candidates = found; state.lastSuccessAt = new Date().toISOString(); state.status = "候補取得・未確定";
  } catch (error) { state.stopReason = error.message; state.status = state.manualWait ? "manual-wait" : "retry-wait"; }
  state.endedAt = new Date().toISOString(); fs.writeFileSync(FILE, JSON.stringify(state)); console.log(JSON.stringify(state));
}
if (require.main === module) run();
module.exports = { candidates };
