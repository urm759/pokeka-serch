function normalizeWidth(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToken(value) {
  return normalizeWidth(value).toUpperCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function extractBracket(value) {
  const matches = [...normalizeWidth(value).matchAll(/\[([^\]]+)\]/g)];
  return matches.length ? matches[matches.length - 1][1].trim() : "";
}

function parseSetAndNumber(value, model = "") {
  const bracket = extractBracket(value) || normalizeWidth(model);
  const tokens = bracket.split(/\s+/).filter(Boolean);
  const numberPattern = /^(?:NO\.)?\d+(?:-\d+)?(?:\/\d+)?$/i;
  const numberIndexWithDenominator = tokens.findIndex((token) => /\d+(?:-\d+)?\/\d+/i.test(token.replace(/[{}#]/g, "")));
  const numberIndex = numberIndexWithDenominator >= 0
    ? numberIndexWithDenominator
    : tokens.findIndex((token) => numberPattern.test(token.replace(/[{}#]/g, "")));
  if (numberIndex < 0) return { setCode: normalizeToken(model), cardNumber: "" };
  const cardNumber = normalizeWidth(tokens[numberIndex]).replace(/[{}#]/g, "").toUpperCase();
  const other = tokens.filter((_, index) => index !== numberIndex).find((token) => /[A-Za-z]/.test(token)) || model;
  return { setCode: normalizeToken(other), cardNumber: normalizeToken(cardNumber) };
}

function extractRarity(value, explicit = "") {
  if (explicit) return normalizeToken(explicit);
  const beforeBracket = normalizeWidth(value).split("[")[0];
  const matches = [...beforeBracket.matchAll(/(?:^|[\s:：])((?:SAR|SSR|CSR|CHR|BWR|MUR|AR|SR|HR|UR|RRR|RR|ACE|PROMO|PR|P|H|S|R|U|C|★|☆|◇|◆))(?:$|[\s:：])/gi)];
  return matches.length ? normalizeToken(matches[matches.length - 1][1]) : "";
}

function extractVariant(value, explicit = "") {
  const text = normalizeWidth(`${value} ${explicit}`);
  if (/マスターボールミラー|マスボ(?:ミラー)?/i.test(text)) return "master-ball-mirror";
  if (/モンスターボールミラー|モンボ(?:ミラー)?/i.test(text)) return "monster-ball-mirror";
  if (/SAR\s*仕様/i.test(text)) return "sar-style";
  if (/ミラー/i.test(text)) return "mirror";
  if (/旧裏/i.test(text)) return "old-back";
  if (/アンリミ/i.test(text)) return "unlimited";
  if (/未開封/i.test(text)) return "sealed";
  if (/エラー/i.test(text)) return /修正版/i.test(text) ? "error-corrected" : "error";
  if (/メタルカード/i.test(text)) return "metal";
  if (/(?:^|[^A-Z0-9])1ED(?:[^A-Z0-9]|$)/i.test(text)) return "first-edition";
  if (/プロモ|PROMO|(?:^|\s)[A-Z0-9-]+-P(?:\s|\]|$)/i.test(text)) return "promo";
  return normalizeToken(explicit).toLowerCase();
}

function extractLanguage(value) {
  const text = normalizeWidth(value);
  if (/韓国|KOREAN/i.test(text)) return "ko";
  if (/英語|ENGLISH/i.test(text)) return "en";
  if (/中国|CHINESE/i.test(text)) return "zh";
  if (/インドネシア|INDONESIAN/i.test(text)) return "id";
  return "ja";
}

function extractCardName(value) {
  let text = normalizeWidth(value).replace(/\[[^\]]+\].*$/, "");
  const rarity = extractRarity(text);
  if (rarity) {
    const rarityPattern = new RegExp(`(?:[\\s:：])${rarity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[\\s:：]|$)`, "i");
    text = text.replace(rarityPattern, " ");
  }
  return normalizeToken(text.replace(/(?:マスター|モンスター)ボールミラー|ミラー|1ED|旧裏|アンリミ|プロモ/gi, ""));
}

function canonicalIdentity(card) {
  const name = normalizeWidth(card?.name || "");
  const parsed = parseSetAndNumber(name, card?.model || "");
  const identity = {
    setCode: parsed.setCode,
    cardNumber: parsed.cardNumber,
    cardName: extractCardName(name),
    rarity: extractRarity(name, card?.rarity || ""),
    variant: extractVariant(name, card?.variant || ""),
    language: extractLanguage(`${name} ${card?.language || ""}`),
  };
  identity.reviewRequired = !identity.cardName || (!identity.setCode && !identity.cardNumber);
  // The full normalized label is the final guard against collapsing promo
  // distributions, alternate artwork or sealed/error products with the same number.
  identity.key = [identity.setCode, identity.cardNumber, identity.cardName, identity.rarity, identity.variant, identity.language, normalizeToken(name)].join("|");
  return identity;
}

// Existing shop-linkage API. Keep this stricter comparator stable because all
// collectors share it; canonicalIdentity above is only for catalog deduping.
function normalizeText(value) {
  return String(value || "").normalize("NFKC").toLowerCase()
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
  const baseName = normalizeText(source.replace(/\[[^\]]+\]/g, " ").replace(/[<{][^>}]+[>}]?/g, " ").replace(/[（(].*?[）)]/g, " ").replace(/(?:MUR|SAR|CSR|CHR|UR|HR|SR|AR|RRR|RR|PROMO|H|S|R|U|C)(?=\s|:|$)/gi, " ").replace(/(?:1\s*ED|1ST|マスターボールミラー|ミラー|エラー修正版|エラー版)/gi, " "));
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
  const nameCompatible = !left.baseName || !right.baseName || left.baseName === right.baseName || left.baseName.includes(right.baseName) || right.baseName.includes(left.baseName);
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

module.exports = {
  canonicalIdentity,
  compareIdentity,
  extractIdentity,
  extractLanguage,
  extractRarity,
  extractVariant,
  normalizeToken,
  normalizeWidth,
  normalizeCardNumber,
  normalizeSetCode,
  normalizeText,
  parseSetAndNumber,
  rarityFrom,
  variantFrom,
};
