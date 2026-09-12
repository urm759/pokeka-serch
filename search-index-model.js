(function attachSearchIndexModel(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CardSearchIndexModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSearchIndexModel() {
  function normalize(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[‐‑‒–—―ー−]/g, "-")
      .replace(/[\[\]【】()（）{}「」『』・,:：／/\\]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function compact(value) {
    return normalize(value).replace(/[^0-9a-z\u3040-\u30ff\u3400-\u9fff]+/gi, "");
  }

  function numberKey(value) {
    const normalized = String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");
    const match = normalized.match(/(\d{1,3})\/(\d{1,3})/);
    return match ? `${Number(match[1])}/${Number(match[2])}` : "";
  }

  function queryParts(value) {
    const normalized = normalize(value);
    const compacted = compact(value);
    const number = numberKey(value);
    const rawNormalized = String(value || "").normalize("NFKC").toLowerCase().replace(/[‐‑‒–—―ー−]/g, "-");
    const setCandidate = rawNormalized
      .replace(/\d{1,3}\s*\/\s*\d{1,3}.*/, "")
      .split(" ")
      .filter(Boolean)
      .at(-1) || "";
    return { normalized, compacted, number, setCandidate: compact(setCandidate) };
  }

  function rankEntry(entry, query) {
    const parts = typeof query === "string" ? queryParts(query) : query;
    if (!parts.compacted) return 0;
    const text = String(entry.k || compact(`${entry.n || ""} ${(entry.a || []).join(" ")} ${entry.s || ""} ${entry.no || ""} ${entry.id || ""}`));
    const name = String(entry.nn || entry.k || compact(entry.n || ""));
    const setCode = String(entry.sk || compact(entry.s || ""));
    const cardNumber = String(entry.nok || numberKey(entry.no || ""));
    const exactNumber = Boolean(parts.number && cardNumber === parts.number);
    const exactSet = Boolean(!parts.setCandidate || setCode === parts.setCandidate || setCode.includes(parts.setCandidate));
    if (exactNumber && exactSet) return 1000 + (name.includes(parts.compacted) ? 50 : 0);
    if (exactNumber) return 850;
    if (name === parts.compacted) return 800;
    if (text.startsWith(parts.compacted)) return 700;
    if (text.includes(parts.compacted)) return 500;
    const tokens = parts.normalized.split(" ").map(compact).filter(Boolean);
    return tokens.length && tokens.every((token) => text.includes(token)) ? 350 : -1;
  }

  function search(entries, query, options = {}) {
    const parts = queryParts(query);
    const limit = Math.max(1, Number(options.limit || 250));
    const exactIdentity = parts.number && parts.setCandidate
      ? `${parts.setCandidate}|${parts.number}`
      : "";
    if (exactIdentity) {
      const exactMatches = (Array.isArray(entries) ? entries : []).filter((entry) => entry.x === exactIdentity);
      if (exactMatches.length) return exactMatches.slice(0, limit);
    }
    const ranked = (Array.isArray(entries) ? entries : [])
      .map((entry) => ({ entry, score: rankEntry(entry, parts) }))
      .filter((item) => item.score >= 0)
      .sort((left, right) => right.score - left.score || String(left.entry.n || "").localeCompare(String(right.entry.n || ""), "ja"));
    const exact = ranked.filter((item) => item.score >= 1000);
    return (exact.length ? exact : ranked)
      .slice(0, limit)
      .map((item) => item.entry);
  }

  return { compact, normalize, numberKey, queryParts, rankEntry, search };
});
