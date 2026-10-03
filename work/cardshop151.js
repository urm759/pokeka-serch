const norm = (v) => String(v || "").normalize("NFKC").toLowerCase().replace(/[＆&]/g, "and").replace(/[\s:：・【】{}\[\]（）()_-]/g, "");
const number = (v) => {
  const m = String(v || "").normalize("NFKC").match(/(\d{1,3})\s*\/\s*(\d{1,3}|(?:XY|SM|SV|BW|S)-P)/i);
  return m ? `${Number(m[1])}/${/^\d+$/.test(m[2]) ? Number(m[2]) : m[2].toUpperCase()}` : null;
};
const name = (v) => norm(String(v || "").split("[")[0].replace(/\b(?:SAR|MUR|BWR|SSR|CSR|CHR|SR|HR|UR|RRR|RR|AR|R|H|SA)\b/gi, "").replace(/マスターボールミラー|モンスターボールミラー|ミラー/g, "").replace(/プロモ$/, ""));
const spec = (v) => /マスターボール/.test(v) ? "master" : /モンスターボール/.test(v) ? "monster" : /ミラー/.test(v) ? "mirror" : /\bSA\b/i.test(v) ? "sa" : "base";

function resolve(row, cards) {
  if (row.type !== "PSA10" || row.genre !== "ポケモンカード") return { status: "対象外", reason: "ポケモンPSA10以外" };
  if (/セット|未開封|BOX|英語|韓国|中国|ゴッホ/i.test(row.name)) return { status: "確認待ち", reason: "言語・単品仕様の確認が必要" };
  const serial = number(row.listNo);
  if (!serial) return { status: "確認待ち", reason: "カード番号を確認できない" };
  const candidates = cards.filter((c) => number(c.model || c.name) === serial && name(c.name) === name(row.name));
  // Missing variant/rarity is not permission to select the cheaper normal artwork.
  const explicitVariant = spec(row.name);
  const compatible = explicitVariant === "base" ? candidates : candidates.filter((c) => spec(c.name) === explicitVariant);
  if (compatible.length !== 1 || compatible[0].language !== "ja" || compatible[0].identityReviewRequired) {
    return { status: "確認待ち", reason: compatible.length > 1 ? "同番号・仕様候補が複数" : "日本語・セット・仕様が一意に確定できない", candidates: compatible.map((c) => c.id) };
  }
  const card = compatible[0];
  return { status: "一致", cardId: card.id, method: "unique-number-name-spec-ja", evidence: {
    number: serial, name: row.name, language: "ja", catalogSet: card.setCode,
    sourceSetExplicit: false, sourceRarityExplicit: false, catalogIdentity: card.identityKey,
  } };
}

async function fetchItems(shop, fetchJson, cards) {
  const payload = await fetchJson("https://cardshop151.com/api/items", shop.name);
  if (payload.mode !== "live" || !Array.isArray(payload.items) || payload.items.length < 2) throw new Error("CardShop151: 一覧形式変更・取得急減。過去データを保持");
  const psa = payload.items.filter((r) => r.type === "PSA10" && r.genre === "ポケモンカード");
  if (!psa.length) throw new Error("CardShop151: ポケモンPSA10取得0件");
  const items = psa.map((row) => {
    const match = resolve(row, cards);
    const price = row.displayPrice;
    return { shopItemId: row.id, name: `${row.name} ${row.listNo}`, number: row.listNo,
      price: Number.isFinite(price) && price > 0 ? price : null,
      active: !row.acceptStopped && Number.isFinite(price) && price > 0,
      itemUrl: shop.url, imageUrl: row.imageUrl || null, fulfilment: "store",
      sourceUpdatedAt: null, observedAt: new Date().toISOString(), verifiedCardId: match.cardId || null,
      identityStatus: match.status, mismatchReason: match.reason || null, candidateIds: match.candidates || [],
      matchMethod: match.method || null, identityEvidence: match.evidence || null, strictIdentity: true };
  });
  return { pages: 1, items, sourceTotal: payload.items.length, psa10Total: payload.items.filter((r) => r.type === "PSA10").length,
    pagination: "公開画面が使用する/api/itemsの全件応答。ページ送りなし" };
}
module.exports = { resolve, fetchItems };
