const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Math.max(1024, Number(process.env.POKEDATA_RECEIVER_PORT || 8771));
const OUTPUT = path.join(__dirname, "pokedata-browser-captures.json");
const MAX_BYTES = 25 * 1024 * 1024;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value), "utf8");
  fs.renameSync(temporary, file);
}

function mergeCapture(payload) {
  if (!payload || !Array.isArray(payload.cards)) throw new Error("cards array is required");
  const current = readJson(OUTPUT, { version: 1, cards: [] });
  const byId = new Map((current.cards || []).map((card) => [Number(card.id), card]));
  for (const card of payload.cards) {
    if (!Number.isFinite(Number(card.id)) || !Array.isArray(card.rows)) continue;
    byId.set(Number(card.id), card);
  }
  const next = {
    version: 1,
    source: "PokeDATA authenticated Chrome transaction table",
    updatedAt: new Date().toISOString(),
    cards: [...byId.values()].sort((a, b) => Number(a.id) - Number(b.id)),
  };
  writeJson(OUTPUT, next);
  return next;
}

const page = `<!doctype html><html lang="ja"><meta charset="utf-8"><title>PokeDATA capture receiver</title>
<style>body{font:16px sans-serif;max-width:760px;margin:40px auto;padding:0 16px}textarea{width:100%;height:240px}button{padding:12px 24px}</style>
<h1>PokeDATA capture receiver</h1><form method="post" action="/capture"><textarea name="payload" aria-label="capture json"></textarea><p><button type="submit">保存</button></p></form></html>`;

const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(page);
    return;
  }
  if (request.method !== "POST" || request.url !== "/capture") {
    response.writeHead(404).end("not found");
    return;
  }
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BYTES) request.destroy();
  });
  request.on("end", () => {
    try {
      const params = new URLSearchParams(body);
      const saved = mergeCapture(JSON.parse(params.get("payload") || "{}"));
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end(`saved ${saved.cards.length} cards`);
    } catch (error) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end(`capture failed: ${error.message}`);
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`PokeDATA capture receiver: http://127.0.0.1:${PORT}/`);
});
