function fairBatch(rows, size, isFocused, maxShare = 0.4) {
  const count = Math.max(0, Math.floor(size));
  if (!count) return [];
  const focused = rows.filter(isFocused), normal = rows.filter((r) => !isFocused(r));
  // Reserve ordinary work while it exists; spare capacity may serve focused work.
  const quota = Math.floor(count * Math.min(0.5, Math.max(0, maxShare)));
  const chosen = [...focused.slice(0, quota), ...normal.slice(0, count - quota)];
  if (chosen.length < count) {
    const used = new Set(chosen);
    chosen.push(...rows.filter((r) => !used.has(r)).slice(0, count - chosen.length));
  }
  return chosen;
}
module.exports = { fairBatch };
