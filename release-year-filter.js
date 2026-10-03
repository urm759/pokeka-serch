(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ReleaseYearFilter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function year(card, completion = {}) {
    const date = card.releaseDate || completion.rd;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date || "") && Number.isFinite(Date.parse(date))) return Number(date.slice(0, 4));
    const value = card.releaseYear ?? completion.ry;
    return value != null && Number.isInteger(Number(value)) && Number(value) >= 1996 && Number(value) <= 2100 ? Number(value) : null;
  }
  function matches(card, completion, enabled, includeUnknown) {
    if (!enabled) return true;
    const value = year(card, completion);
    return value == null ? Boolean(includeUnknown) : value >= 2020;
  }
  return { year, matches };
});
