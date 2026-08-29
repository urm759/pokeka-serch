from __future__ import annotations

import argparse
import hashlib
from datetime import datetime, timezone, timedelta
import io
import json
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

from match_x_card_images import match_signature, signature


def read_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def fetch_image(url: str, cache_path: Path) -> Image.Image:
    if not cache_path.exists():
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=30) as response:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_bytes(response.read())
    return Image.open(cache_path).convert("RGB")


def crop_box(image: Image.Image, box: dict) -> Image.Image:
    x, y = int(box["x"]), int(box["y"])
    return image.crop((x, y, x + int(box["w"]), y + int(box["h"])))


def load_cache(path: Path):
    cache = np.load(path)
    return cache["ids"], cache["signatures"].astype(np.float32)


def match_unique(ids: np.ndarray, references: np.ndarray, target: np.ndarray, limit: int = 5, exclude_index: int | None = None) -> list[dict]:
    distances = np.mean((references - target) ** 2, axis=1)
    if exclude_index is not None:
        distances[exclude_index] = np.inf
    best = {}
    for index in np.argsort(distances):
        if not np.isfinite(distances[index]):
            continue
        card_id = str(ids[index])
        if card_id not in best:
            best[card_id] = {"cardId": card_id, "distance": round(float(distances[index]), 6)}
        if len(best) >= limit:
            break
    return list(best.values())


def build_templates(capture_path: Path, image_dir: Path, output_path: Path) -> None:
    capture = read_json(capture_path, {"posts": []})
    ids, signatures, sources = [], [], []
    for post in capture.get("posts", []):
        for index, item in enumerate(post.get("items", [])):
            card_id = str(item.get("verifiedCardId") or "")
            box = item.get("bbox")
            image_index = int(item.get("imageIndex") or 0)
            images = post.get("images") or []
            url = item.get("imageUrl") or (images[image_index] if image_index < len(images) else "")
            if not card_id or not box or not url:
                continue
            digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]
            image = fetch_image(url, image_dir / f"{digest}.jpg")
            ids.append(card_id)
            signatures.append(signature(crop_box(image, box)))
            sources.append(f"{post['postId']}:{index}")
    np.savez_compressed(output_path, ids=np.asarray(ids), signatures=np.stack(signatures), sources=np.asarray(sources))
    duplicate_ids = {card_id for card_id in ids if ids.count(card_id) > 1}
    tested = correct = 0
    for index, card_id in enumerate(ids):
        if card_id not in duplicate_ids:
            continue
        tested += 1
        matches = match_unique(np.asarray(ids), np.stack(signatures).astype(np.float32), signatures[index].astype(np.float32), 3, index)
        correct += int(bool(matches) and matches[0]["cardId"] == card_id)
    print(json.dumps({
        "templates": len(ids),
        "uniqueCards": len(set(ids)),
        "duplicateHoldouts": tested,
        "holdoutTop1": correct,
        "holdoutTop1Rate": round(correct / tested, 4) if tested else None,
        "output": str(output_path),
    }, ensure_ascii=False))


def calibrate(cache_path: Path, capture_path: Path, image_dir: Path) -> None:
    ids, references = load_cache(cache_path)
    capture = read_json(capture_path, {"posts": []})
    rows = []
    for post in capture.get("posts", []):
        for index, item in enumerate(post.get("items", [])):
            card_id = str(item.get("verifiedCardId") or "")
            box = item.get("bbox")
            image_index = int(item.get("imageIndex") or 0)
            images = post.get("images") or []
            url = item.get("imageUrl") or (images[image_index] if image_index < len(images) else "")
            if not card_id or not box or not url:
                continue
            digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]
            image = fetch_image(url, image_dir / f"{post['postId']}-{digest}.jpg")
            matches = match_signature(ids, references, signature(crop_box(image, box)).astype(np.float32), 5)
            rank = next((rank for rank, match in enumerate(matches, 1) if match["cardId"] == card_id), None)
            rows.append({
                "sourceKey": f"{post['postId']}:{index}",
                "cardId": card_id,
                "rank": rank,
                "topDistance": matches[0]["distance"],
                "correctDistance": next((match["distance"] for match in matches if match["cardId"] == card_id), None),
                "margin": round(matches[1]["distance"] - matches[0]["distance"], 6) if len(matches) > 1 else None,
            })
    top1 = [row for row in rows if row["rank"] == 1]
    print(json.dumps({
        "reviewed": len(rows),
        "top1": len(top1),
        "top1Rate": round(len(top1) / len(rows), 4) if rows else 0,
        "top1DistanceP95": round(float(np.quantile([row["topDistance"] for row in top1], 0.95)), 6) if top1 else None,
        "top1MarginP05": round(float(np.quantile([row["margin"] for row in top1], 0.05)), 6) if top1 else None,
        "rows": rows,
    }, ensure_ascii=False))


def resolve(cache_path: Path, cards_path: Path, processing_dir: Path, output_path: Path, max_distance: float, min_margin: float) -> None:
    ids, references = load_cache(cache_path)
    cards = read_json(cards_path, [])
    names = {str(card["id"]): card.get("name", "") for card in cards}
    rows = []
    for manifest_path in sorted(processing_dir.glob("*/manifest.json")):
        manifest = read_json(manifest_path, {})
        if not manifest.get("layout", {}).get("autoEligible"):
            continue
        source = manifest_path.parent.name
        post_id, image_index = source.rsplit("-", 1)
        for cell in manifest.get("cells", []):
            price = cell.get("price_value")
            if not price or float(cell.get("price_confidence") or 0) < 0.85:
                continue
            image_path = manifest_path.parent / cell["card_path"]
            matches = match_unique(ids, references, signature(Image.open(image_path)).astype(np.float32), 5)
            margin = matches[1]["distance"] - matches[0]["distance"] if len(matches) > 1 else 0
            accepted = matches[0]["distance"] <= max_distance and margin >= min_margin
            rows.append({
                "postId": post_id,
                "imageIndex": int(image_index),
                "cellIndex": int(cell["index"]),
                "price": int(price),
                "priceConfidence": cell.get("price_confidence"),
                "accepted": accepted,
                "matchMethod": "image-exact" if accepted else "",
                "cardId": matches[0]["cardId"] if accepted else "",
                "candidateCardId": matches[0]["cardId"],
                "candidateName": names.get(matches[0]["cardId"], ""),
                "distance": matches[0]["distance"],
                "margin": round(float(margin), 6),
                "matches": [{**match, "name": names.get(match["cardId"], "")} for match in matches],
                "bbox": cell.get("card_bbox"),
            })
    recurring = {}
    for row in rows:
        if row["distance"] >= 0.75 or row["margin"] <= 0.015:
            continue
        recurring.setdefault(row["candidateCardId"], []).append(row)
    for group in recurring.values():
        if len({row["postId"] for row in group}) < 2:
            continue
        for row in group:
            row["accepted"] = True
            row["cardId"] = row["candidateCardId"]
            row["matchMethod"] = "cross-post-repeat"
    output_path.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"examined": len(rows), "accepted": sum(row["accepted"] for row in rows), "output": str(output_path)}, ensure_ascii=False))


def twitter_jst_date(post_id: str) -> str:
    milliseconds = (int(post_id) >> 22) + 1288834974657
    instant = datetime.fromtimestamp(milliseconds / 1000, timezone.utc).astimezone(timezone(timedelta(hours=9)))
    return instant.strftime("%Y-%m-%d")


def apply_resolutions(resolved_path: Path, capture_path: Path) -> None:
    all_rows = read_json(resolved_path, [])
    rows = [row for row in all_rows if row.get("accepted") and row.get("cardId")]
    capture = read_json(capture_path, {"posts": []})
    posts_by_id = {str(post.get("postId")): post for post in capture.get("posts", [])}
    added_rows = 0
    added_posts = 0
    for post_id in sorted({str(row["postId"]) for row in rows}):
        existing = posts_by_id.get(post_id)
        if existing and existing.get("reviewComplete", True) and not any(item.get("matchMethod") for item in existing.get("items", [])):
            continue
        analyzed = [row for row in all_rows if str(row.get("postId")) == post_id]
        targets = sorted(
            [row for row in rows if str(row["postId"]) == post_id],
            key=lambda row: (int(row["imageIndex"]), int(row["cellIndex"])),
        )
        post = {
            "shopId": "laurier-akiba",
            "postId": post_id,
            "date": twitter_jst_date(post_id),
            "url": f"https://x.com/laurier_akiba/status/{post_id}",
            "images": [],
            "items": [{
                "name": row["candidateName"],
                "price": int(row["price"]),
                "verifiedCardId": row["cardId"],
                "imageIndex": int(row["imageIndex"]),
                "cellIndex": int(row["cellIndex"]),
                "matchConfidence": 1 if row["matchMethod"] == "image-exact" else 0.99,
                "priceConfidence": row.get("priceConfidence"),
                "bbox": row.get("bbox"),
                "matchMethod": row["matchMethod"],
            } for row in targets],
            "reviewComplete": len(targets) == len(analyzed),
            "analyzedCells": len(analyzed),
            "unresolvedCells": len(analyzed) - len(targets),
        }
        if existing:
            capture["posts"][capture["posts"].index(existing)] = post
        else:
            capture.setdefault("posts", []).append(post)
            added_posts += 1
        posts_by_id[post_id] = post
        added_rows += len(targets)
    capture["posts"].sort(key=lambda post: (post.get("date", ""), str(post.get("postId", ""))))
    capture_path.write_text(json.dumps(capture, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"addedPosts": added_posts, "addedRows": added_rows, "captureRows": sum(len(post.get("items", [])) for post in capture["posts"])}, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    calibration = sub.add_parser("calibrate")
    calibration.add_argument("cache", type=Path)
    calibration.add_argument("capture", type=Path)
    calibration.add_argument("image_dir", type=Path)
    templates = sub.add_parser("build-templates")
    templates.add_argument("capture", type=Path)
    templates.add_argument("image_dir", type=Path)
    templates.add_argument("output", type=Path)
    resolver = sub.add_parser("resolve")
    resolver.add_argument("cache", type=Path)
    resolver.add_argument("cards", type=Path)
    resolver.add_argument("processing_dir", type=Path)
    resolver.add_argument("output", type=Path)
    resolver.add_argument("--max-distance", type=float, default=0.18)
    resolver.add_argument("--min-margin", type=float, default=0.01)
    apply_command = sub.add_parser("apply")
    apply_command.add_argument("resolved", type=Path)
    apply_command.add_argument("capture", type=Path)
    args = parser.parse_args()
    if args.command == "calibrate":
        calibrate(args.cache, args.capture, args.image_dir)
    elif args.command == "build-templates":
        build_templates(args.capture, args.image_dir, args.output)
    elif args.command == "apply":
        apply_resolutions(args.resolved, args.capture)
    else:
        resolve(args.cache, args.cards, args.processing_dir, args.output, args.max_distance, args.min_margin)


if __name__ == "__main__":
    main()
