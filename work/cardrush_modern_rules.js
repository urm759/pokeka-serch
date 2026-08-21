function extractSetCode(card) {
  const source = String(card?.name || card || "");
  return (
    (source.match(/\[\s*([A-Za-z0-9-]+)\s+\d{1,4}(?:\/\d{1,4})?\s*\]/) || [])[1] ||
    String(card?.model || "").trim()
  ).toUpperCase();
}

function isModernSetCode(setCode) {
  const code = String(setCode || "").toUpperCase();
  if (/^SV[A-Z0-9-]*$/.test(code)) return true;
  if (/^SM[A-Z0-9-]*$/.test(code)) return true;
  if (/^S[A-Z0-9-]+$/.test(code)) return true;
  if (/^M(?:\d|-[A-Z]|A$|B|C$)/.test(code)) return true;
  if (/^MMB$/.test(code)) return true;
  if (/^CL(?:F|K|L)$/.test(code)) return true;
  if (/^CP\d+$/.test(code)) return true;
  if (/^XY$|^XY-P$|^XY-BEST$/.test(code)) return true;
  const xy = code.match(/^XY(\d+)$/);
  return xy ? Number(xy[1]) >= 6 : false;
}

function isModernCard(card) {
  return isModernSetCode(extractSetCode(card));
}

function coverage(cards) {
  const modern = (cards || []).filter(isModernCard);
  const linked = modern.filter((card) => Boolean(card.cardrushUrl));
  return {
    total: modern.length,
    linked: linked.length,
    missing: modern.length - linked.length,
    rate: modern.length ? (linked.length / modern.length) * 100 : 0,
  };
}

module.exports = { extractSetCode, isModernSetCode, isModernCard, coverage };
