function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[・･\s_()[\]{}<>「」『』【】:：/\\]/g, "");
}

function normalizeSetCode(value) {
  return String(value || "").normalize("NFKC").toUpperCase().replace(/[^A-Z0-9+-]/g, "");
}

function normalizeCardNumber(value) {
  const normalized = String(value || "").normalize("NFKC").toUpperCase().replace(/\s/g, "");
  const standard = normalized.match(/(\d{1,4}(?:-\d{1,4})?)\/(\d{1,4})/);
  if (standard) return `${standard[1]}/${standard[2]}`;
  const promo = normalized.match(/(\d{1,4})[\s/-]*([A-Z0-9]+-P)/);
  if (promo) return `${promo[1]}-${promo[2]}`;
  const catalog = normalized.match(/#(\d{1,4})/);
  return catalog ? `#${catalog[1]}` : "";
}

function rarityFrom(value) {
  const source = String(value || "").normalize("NFKC").toUpperCase();
  const rarities = ["MUR", "SAR", "CSR", "CHR", "UR", "HR", "SR", "AR", "RRR", "RR", "PROMO", "H", "S", "R", "U", "C"];
  return rarities.find((rarity) => new RegExp(`(?:^|[^A-Z])${rarity}(?:[^A-Z]|$)`).test(source)) || "";
}

function variantFrom(value) {
  const source = String(value || "").normalize("NFKC").toLowerCase();
  const variants = [];
  if (/マスターボール|master\s*ball/.test(source)) variants.push("masterball");
  else if (/ミラー|mirror/.test(source)) variants.push("mirror");
  if (/(?:^|[^a-z])sa(?:[^a-z]|$)|スペシャルアート/.test(source)) variants.push("sa");
  if (/1\s*ed|1st/.test(source)) variants.push("1ed");
  if (/プロモ|promo|[a-z0-9]+-p/.test(source)) variants.push("promo");
  if (/v-?union/.test(source)) variants.push("vunion");
  return variants.sort().join("+");
}

function extractIdentity(input) {
  const source = typeof input === "object" && input ? `${input.name || input.title || ""} ${input.model || ""}` : String(input || "");
  const bracket = source.match(/\[\s*([A-Za-z0-9+-]+)\s+(\d{1,4}(?:-\d{1,4})?\/\d{1,4})\s*\]/);
  const reversePromo = source.match(/\[\s*(\d{1,4})\s+([A-Za-z0-9]+-P)\s*\]/i);
  const braces = source.match(/[<{]\s*(\d{1,4}(?:-\d{1,4})?\/\d{1,4})\s*[>}]\s*\[\s*([A-Za-z0-9+-]+)\s*\]/);
  const setCode = normalizeSetCode(reversePromo?.[2] || bracket?.[1] || braces?.[2] || input?.setCode || "");
  const cardNumber = normalizeCardNumber(reversePromo ? `${reversePromo[1]}-${reversePromo[2]}` : bracket?.[2] || braces?.[1] || input?.cardNo || input?.model || source);
  const rarity = rarityFrom(input?.rarity || source);
  const variant = variantFrom(`${input?.variant || ""} ${source}`);
  const setTitle = normalizeText((source.match(/[（(](?:拡張パック|強化拡張パック|ハイクラスパック|プロモーションカード|スターター|構築済み)[「"]?([^」")]+)[」"]?[）)]/) || [])[1]);
  const baseName = normalizeText(source
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[<{][^>}]+[>}]?/g, " ")
    .replace(/[（(].*?[）)]/g, " ")
    .replace(/(?:MUR|SAR|CSR|CHR|UR|HR|SR|AR|RRR|RR|PROMO|H|S|R|U|C)(?=\s|:|$)/gi, " ")
    .replace(/(?:1\s*ED|1ST|マスターボールミラー|ミラー|エラー修正版|エラー版)/gi, " "));
  const strictKey = setCode && cardNumber ? [setCode, cardNumber, rarity, variant].join("|") : "";
  return { setCode, cardNumber, baseName, rarity, setTitle, variant, strictKey };
}

function compareIdentity(leftInput, rightInput) {
  const left = extractIdentity(leftInput);
  const right = extractIdentity(rightInput);
  const reasons = [];
  if (left.setCode && right.setCode && left.setCode !== right.setCode) reasons.push("セット番号違い");
  if (left.cardNumber && right.cardNumber && left.cardNumber !== right.cardNumber) reasons.push("カード番号違い");
  if (left.rarity && right.rarity && left.rarity !== right.rarity) reasons.push("レアリティ違い");
  if (left.variant && right.variant && left.variant !== right.variant) reasons.push("絵柄・仕様違い");
  const nameCompatible = !left.baseName || !right.baseName
    || left.baseName === right.baseName
    || left.baseName.includes(right.baseName)
    || right.baseName.includes(left.baseName);
  if (!nameCompatible) reasons.push("カード名違い");
  const hardMismatch = reasons.some((reason) => reason.includes("番号違い") || reason.includes("仕様違い"));
  let score = 0;
  if (left.setCode && left.setCode === right.setCode) score += 35;
  if (left.cardNumber && left.cardNumber === right.cardNumber) score += 45;
  if (nameCompatible) score += 10;
  if (!left.rarity || !right.rarity || left.rarity === right.rarity) score += 5;
  if (!left.variant || !right.variant || left.variant === right.variant) score += 5;
  return { left, right, score: hardMismatch ? 0 : score, hardMismatch, nameCompatible, reasons };
}

module.exports = { compareIdentity, extractIdentity, normalizeCardNumber, normalizeSetCode, normalizeText, rarityFrom, variantFrom };
