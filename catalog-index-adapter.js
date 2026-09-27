(function (root) {
  function fromSearchAndCompletion(searchRows, completionCards) {
    return searchRows.map((entry) => {
      const completion = completionCards[entry.id] || {};
      const bracket = String(entry.n || "").match(/\[([^\]]+)\]/)?.[1] || "";
      const model = bracket && !bracket.includes("/") ? bracket : entry.no;
      return {
        id: entry.id, name: entry.n, model, setCode: entry.s || null,
        cardNumber: String(entry.no || "").replace(/[^0-9A-Za-z]/g, ""),
        language: entry.j, chunk: entry.c, status: completion.s || null,
        siteNew: Number(Boolean(completion.n)), isNew: Number(Boolean(completion.n)),
        recentRelease: Number(Boolean(completion.rr)), relisted: Number(Boolean(completion.rl)),
        releaseDate: completion.rd || null, releaseYear: completion.ry || null,
      };
    });
  }
  const api = { fromSearchAndCompletion };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CatalogIndexAdapter = api;
})(typeof window !== "undefined" ? window : globalThis);
