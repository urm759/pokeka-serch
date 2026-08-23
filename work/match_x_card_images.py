from __future__ import annotations

import argparse
import io
import json
import re
import ssl
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps


SIGNATURE_SIZE = (48, 48)


def fetch_image(url: str) -> Image.Image:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    context = ssl._create_unverified_context() if ".r2.dev/" in url else None
    with urllib.request.urlopen(request, timeout=20, context=context) as response:
        return Image.open(io.BytesIO(response.read())).convert("RGB")


def card_view(image: Image.Image) -> Image.Image:
    fitted = ImageOps.fit(image.convert("RGB"), (240, 336), method=Image.Resampling.LANCZOS)
    # The PSA badge and price sheet border sit outside this stable artwork area.
    return fitted.crop((24, 34, 211, 262))


def signature(image: Image.Image) -> np.ndarray:
    view = card_view(image)
    rgb = np.asarray(view.resize(SIGNATURE_SIZE, Image.Resampling.LANCZOS), dtype=np.float32) / 255.0
    gray_image = view.convert("L").filter(ImageFilter.GaussianBlur(0.7))
    gray = np.asarray(gray_image.resize(SIGNATURE_SIZE, Image.Resampling.LANCZOS), dtype=np.float32) / 255.0
    gray = (gray - gray.mean()) / max(float(gray.std()), 0.05)
    gx = np.diff(gray, axis=1, append=gray[:, -1:])
    gy = np.diff(gray, axis=0, append=gray[-1:, :])
    color = np.asarray(Image.fromarray((rgb * 255).astype(np.uint8)).resize((12, 12), Image.Resampling.BILINEAR), dtype=np.float32) / 255.0
    return np.concatenate((gray.ravel(), gx.ravel(), gy.ravel(), color.ravel())).astype(np.float16)


def fetch_signature(card: dict) -> tuple[str, np.ndarray] | None:
    try:
        return card["id"], signature(fetch_image(card["img"]))
    except Exception:
        return None


def build_cache(cards_path: Path, output_path: Path, workers: int) -> None:
    cards = json.loads(cards_path.read_text(encoding="utf-8"))
    candidates = [
        card for card in cards
        if card.get("img")
        and int(card.get("snkPsa10Price") or 0) > 0
        and not any(word in card.get("name", "") for word in ("未開封", "英語版", "中国語版", "韓国語版"))
    ]
    ids: list[str] = []
    signatures: list[np.ndarray] = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(fetch_signature, card) for card in candidates]
        for index, future in enumerate(as_completed(futures), 1):
            result = future.result()
            if result:
                card_id, card_signature = result
                ids.append(card_id)
                signatures.append(card_signature)
            if index % 250 == 0:
                print(json.dumps({"processed": index, "downloaded": len(ids)}, ensure_ascii=False), flush=True)
    if not signatures:
        raise RuntimeError("No reference images could be downloaded")
    np.savez_compressed(output_path, ids=np.asarray(ids), signatures=np.stack(signatures))
    print(json.dumps({"candidates": len(candidates), "saved": len(ids), "output": str(output_path)}, ensure_ascii=False))


def base_name(name: str) -> str:
    return re.split(r"\s+(?:SAR|SR|HR|UR|AR|CHR|CSR|SA|RRR|RR|MUR|MA|P|S)\b|[:\[]", name, maxsplit=1)[0].strip()


def match_signature(
    ids: np.ndarray,
    references: np.ndarray,
    target: np.ndarray,
    limit: int,
    allowed: np.ndarray | None = None,
) -> list[dict]:
    distances = np.mean((references - target) ** 2, axis=1)
    if allowed is not None:
        distances = np.where(allowed, distances, np.inf)
    indexes = [index for index in np.argsort(distances) if np.isfinite(distances[index])][:limit]
    return [{"cardId": str(ids[index]), "distance": round(float(distances[index]), 6)} for index in indexes]


def match_image(cache_path: Path, image_path: Path, limit: int) -> list[dict]:
    cache = np.load(cache_path)
    return match_signature(cache["ids"], cache["signatures"].astype(np.float32), signature(Image.open(image_path)).astype(np.float32), limit)


def batch_match(cache_path: Path, directories: list[Path], output_path: Path, limit: int) -> None:
    cache = np.load(cache_path)
    ids = cache["ids"]
    references = cache["signatures"].astype(np.float32)
    results = []
    for directory in directories:
        for image_path in sorted(directory.glob("*_card.jpg")):
            matches = match_signature(ids, references, signature(Image.open(image_path)).astype(np.float32), limit)
            results.append({"image": str(image_path), "matches": matches})
    output_path.write_text(json.dumps(results, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"images": len(results), "output": str(output_path)}, ensure_ascii=False))


def benchmark(cache_path: Path, targets_path: Path, cards_path: Path | None) -> None:
    cache = np.load(cache_path)
    ids = cache["ids"]
    references = cache["signatures"].astype(np.float32)
    targets = json.loads(targets_path.read_text(encoding="utf-8"))
    cards = json.loads(cards_path.read_text(encoding="utf-8")) if cards_path else []
    names = {card["id"]: card.get("name", "") for card in cards}
    ranks = []
    for target in targets:
        query = base_name(names.get(target["cardId"], ""))
        allowed = np.asarray([names.get(str(card_id), "").startswith(query) for card_id in ids]) if query else None
        matches = match_signature(ids, references, signature(Image.open(target["image"])).astype(np.float32), 20, allowed)
        rank = next((index + 1 for index, match in enumerate(matches) if match["cardId"] == target["cardId"]), None)
        ranks.append({"image": target["image"], "cardId": target["cardId"], "rank": rank, "top": matches[0]})
    summary = {
        "targets": len(ranks),
        "top1": sum(row["rank"] == 1 for row in ranks),
        "top5": sum(row["rank"] is not None and row["rank"] <= 5 for row in ranks),
        "top20": sum(row["rank"] is not None for row in ranks),
        "misses": [row for row in ranks if row["rank"] is None],
    }
    print(json.dumps(summary, ensure_ascii=False))


def query_match(cache_path: Path, cards_path: Path, queries_path: Path, output_path: Path) -> None:
    cache = np.load(cache_path)
    ids = cache["ids"]
    references = cache["signatures"].astype(np.float32)
    cards = json.loads(cards_path.read_text(encoding="utf-8"))
    names = {card["id"]: card.get("name", "") for card in cards}
    queries = json.loads(queries_path.read_text(encoding="utf-8"))
    results = []
    for query in queries:
        needle = query["query"]
        if query.get("mode") == "contains":
            allowed = np.asarray([needle in names.get(str(card_id), "") for card_id in ids])
        else:
            allowed = np.asarray([names.get(str(card_id), "").startswith(needle) for card_id in ids])
        matches = match_signature(
            ids,
            references,
            signature(Image.open(query["image"])).astype(np.float32),
            int(query.get("limit", 10)),
            allowed,
        )
        results.append({**query, "matches": [{**match, "name": names.get(match["cardId"], "")} for match in matches]})
    output_path.write_text(json.dumps(results, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"queries": len(results), "output": str(output_path)}, ensure_ascii=False))


def build_review_sheets(matches_path: Path, cards_path: Path, output_dir: Path) -> None:
    rows = json.loads(matches_path.read_text(encoding="utf-8"))
    cards = json.loads(cards_path.read_text(encoding="utf-8"))
    cards_by_id = {card["id"]: card for card in cards}
    output_dir.mkdir(parents=True, exist_ok=True)
    for index, row in enumerate(rows, 1):
        panels = [("X image", Image.open(row["image"]).convert("RGB"))]
        for match in row["matches"][:5]:
            card = cards_by_id.get(match["cardId"], {})
            try:
                panels.append((f'{match["cardId"]} {card.get("name", "")}', fetch_image(card["img"])))
            except Exception:
                continue
        panel_width, image_height, label_height = 280, 392, 84
        sheet = Image.new("RGB", (panel_width * len(panels), image_height + label_height), "#10141c")
        for column, (label, panel) in enumerate(panels):
            fitted = ImageOps.contain(panel, (panel_width - 16, image_height - 16), Image.Resampling.LANCZOS)
            x = column * panel_width + (panel_width - fitted.width) // 2
            sheet.paste(fitted, (x, 8))
            ImageDraw.Draw(sheet).text((column * panel_width + 8, image_height + 4), label[:46], fill="white")
        sheet.save(output_dir / f"{index:03d}.jpg", quality=90)
    print(json.dumps({"reviews": len(rows), "output": str(output_dir)}, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    build = subparsers.add_parser("build")
    build.add_argument("cards", type=Path)
    build.add_argument("output", type=Path)
    build.add_argument("--workers", type=int, default=20)
    match = subparsers.add_parser("match")
    match.add_argument("cache", type=Path)
    match.add_argument("image", type=Path)
    match.add_argument("--limit", type=int, default=5)
    batch = subparsers.add_parser("batch")
    batch.add_argument("cache", type=Path)
    batch.add_argument("output", type=Path)
    batch.add_argument("directories", nargs="+", type=Path)
    batch.add_argument("--limit", type=int, default=5)
    test = subparsers.add_parser("benchmark")
    test.add_argument("cache", type=Path)
    test.add_argument("targets", type=Path)
    test.add_argument("--cards", type=Path)
    query = subparsers.add_parser("query")
    query.add_argument("cache", type=Path)
    query.add_argument("cards", type=Path)
    query.add_argument("queries", type=Path)
    query.add_argument("output", type=Path)
    review = subparsers.add_parser("review")
    review.add_argument("matches", type=Path)
    review.add_argument("cards", type=Path)
    review.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.command == "build":
        build_cache(args.cards, args.output, args.workers)
    elif args.command == "match":
        print(json.dumps(match_image(args.cache, args.image, args.limit), ensure_ascii=False))
    elif args.command == "batch":
        batch_match(args.cache, args.directories, args.output, args.limit)
    elif args.command == "query":
        query_match(args.cache, args.cards, args.queries, args.output)
    elif args.command == "review":
        build_review_sheets(args.matches, args.cards, args.output)
    else:
        benchmark(args.cache, args.targets, args.cards)


if __name__ == "__main__":
    main()
