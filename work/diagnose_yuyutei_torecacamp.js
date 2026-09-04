const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const USER_AGENT = "PokecaBuyingGuide/1.0 (+read-only; low-rate)";

function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

async function fetchTimed(url, timeoutMs = 10000) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text();
    return { url, status: response.status, durationMs: Date.now() - startedAt, bytes: body.length, body };
  } catch (error) {
    return { url, status: null, durationMs: Date.now() - startedAt, bytes: 0, error: error.message, body: "" };
  }
}

function hasStateA(product) {
  return (product.variants || []).some((variant) => /(?:^|【\s*)状態A(?:\s*】|$)/.test(String(variant.title || variant.option1 || "")));
}

function titleCardNumber(title) {
  return (String(title || "").match(/(\d{1,4}(?:\s*[-/]\s*\d{1,4})?)\s*\/\s*\d{1,4}/) || [])[1] || "";
}

async function main() {
  const pages = String(process.env.DIAGNOSTIC_CAMP_PAGES || "1,2,25,26")
    .split(",").map(Number).filter((value) => Number.isInteger(value) && value > 0);
  const cards = read(path.join(ROOT, "data", "pokemon-cards.json"), []);
  const report = {
    checkedAt: new Date().toISOString(),
    cards: cards.length,
    pages: [],
    totals: { fetched: 0, parsed: 0, stateA: 0, numberedTitle: 0, withoutNumber: 0 },
  };
  for (const page of pages) {
    const url = `https://torecacamp-pokemon.com/collections/all/products.json?limit=250&page=${page}`;
    const fetchResult = await fetchTimed(url);
    let products = [];
    let parseError = null;
    const parseStartedAt = Date.now();
    try { products = JSON.parse(fetchResult.body).products || []; } catch (error) { parseError = error.message; }
    const stateA = products.filter(hasStateA);
    const numbered = stateA.filter((product) => titleCardNumber(product.title));
    const pageResult = {
      page,
      url,
      httpStatus: fetchResult.status,
      fetchMs: fetchResult.durationMs,
      bytes: fetchResult.bytes,
      parseMs: Date.now() - parseStartedAt,
      fetched: products.length,
      parsed: products.length,
      stateA: stateA.length,
      numberedTitle: numbered.length,
      withoutNumber: stateA.length - numbered.length,
      parseError,
      samples: stateA.slice(0, 5).map((product) => ({
        title: product.title,
        handle: product.handle,
        tags: product.tags,
        imageAlt: product.images?.[0]?.alt || null,
        variants: (product.variants || []).slice(0, 3).map((variant) => ({
          title: variant.title,
          sku: variant.sku,
          price: variant.price,
          available: variant.available,
        })),
      })),
    };
    report.pages.push(pageResult);
    for (const key of Object.keys(report.totals)) report.totals[key] += pageResult[key];
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
