const fs = require("fs");
const path = require("path");
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require("C:/Users/polar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright")); }

const profile = process.env.PSA_USER_DATA_DIR || path.join(process.env.LOCALAPPDATA || __dirname, "PokekaPSAChromeProfile");
const executablePath = process.env.CHROME_EXECUTABLE_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

(async () => {
  const context = await chromium.launchPersistentContext(profile, { headless: false, executablePath: fs.existsSync(executablePath) ? executablePath : undefined });
  const page = context.pages()[0] || await context.newPage();
  await page.goto("https://www.psacard.com/pop/tcg-cards/2025/pokemon-japanese-sv9-battle-partners/292980", { waitUntil: "domcontentloaded", timeout: 60000 });
  console.log("PSA専用Chromeでログインしてください。Population表が表示されたら、この画面を閉じて構いません。");
  await page.waitForTimeout(15 * 60 * 1000);
  await context.close();
})().catch((error) => { console.error(error); process.exit(1); });
