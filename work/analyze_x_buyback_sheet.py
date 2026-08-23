from __future__ import annotations

import json
import math
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


PRICE_FONT_PATHS = [
    Path(r"C:\Windows\Fonts\arialbd.ttf"),
    Path(r"C:\Windows\Fonts\meiryob.ttc"),
    Path(r"C:\Windows\Fonts\YuGothB.ttc"),
]
TEMPLATE_SIZE = (30, 34)


@dataclass
class Cell:
    index: int
    row: int
    col: int
    bbox: dict[str, int]
    card_bbox: dict[str, int]
    price_bbox: dict[str, int]
    card_path: str
    price_path: str
    price_text: str
    price_value: Optional[int]
    price_confidence: float
    match_confidence: float = 0.0
    status: str = "card-match-required"


def runs(mask: np.ndarray, min_length: int, max_gap: int = 0) -> list[tuple[int, int]]:
    values = mask.astype(bool).copy()
    if max_gap > 0:
        false_runs = []
        start = None
        for i, value in enumerate(values):
            if not value and start is None:
                start = i
            if start is not None and (value or i == len(values) - 1):
                end = i if value else i + 1
                false_runs.append((start, end))
                start = None
        for start, end in false_runs:
            if start > 0 and end < len(values) and end - start <= max_gap:
                values[start:end] = True

    found = []
    start = None
    for i, value in enumerate(values):
        if value and start is None:
            start = i
        if start is not None and (not value or i == len(values) - 1):
            end = i if not value else i + 1
            if end - start >= min_length:
                found.append((start, end))
            start = None
    return found


def smooth(values: np.ndarray, size: int) -> np.ndarray:
    return np.convolve(values, np.ones(size) / size, mode="same")


def detect_rows(rgb: np.ndarray) -> list[tuple[int, int]]:
    height, width = rgb.shape[:2]
    gray = rgb.mean(axis=2)
    bright_ratio = (gray > 85).mean(axis=1)
    candidates = runs(smooth(bright_ratio, 7) > 0.30, max(40, round(height * 0.10)), max_gap=8)
    return [(start, end) for start, end in candidates if end - start >= height * 0.10]


def detect_columns(rgb: np.ndarray, row: tuple[int, int]) -> list[tuple[int, int]]:
    height, width = rgb.shape[:2]
    y1, y2 = row
    gray = rgb[y1:y2].mean(axis=2)
    bright_ratio = (gray > 85).mean(axis=0)
    candidates = runs(smooth(bright_ratio, 5) > 0.30, max(45, round(width * 0.07)), max_gap=3)
    return [(start, end) for start, end in candidates if end - start >= width * 0.07]


def price_region(height: int, rows_found: list[tuple[int, int]], row_index: int) -> tuple[int, int]:
    y1, y2 = rows_found[row_index]
    row_height = y2 - y1
    if row_height >= height * 0.25:
        band_height = max(45, round(row_height * 0.17))
        return y2 - band_height, y2
    next_start = rows_found[row_index + 1][0] if row_index + 1 < len(rows_found) else height
    return y2, min(next_start, y2 + max(45, round(height * 0.042)))


def connected_components(mask: np.ndarray) -> list[tuple[int, int, int, int, int]]:
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=np.uint8)
    boxes = []
    for y in range(height):
        for x in range(width):
            if not mask[y, x] or seen[y, x]:
                continue
            stack = [(x, y)]
            seen[y, x] = 1
            xs = []
            ys = []
            while stack:
                cx, cy = stack.pop()
                xs.append(cx)
                ys.append(cy)
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < width and 0 <= ny < height and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = 1
                        stack.append((nx, ny))
            boxes.append((min(xs), min(ys), max(xs) + 1, max(ys) + 1, len(xs)))
    return boxes


def normalize_glyph(mask: np.ndarray) -> np.ndarray:
    if not mask.any():
        return np.zeros(TEMPLATE_SIZE[::-1], dtype=np.uint8)
    ys, xs = np.where(mask)
    crop = Image.fromarray((mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1] * 255).astype(np.uint8))
    fit = ImageOps.contain(crop, TEMPLATE_SIZE, method=Image.Resampling.LANCZOS)
    canvas = Image.new("L", TEMPLATE_SIZE, 0)
    canvas.paste(fit, ((TEMPLATE_SIZE[0] - fit.width) // 2, (TEMPLATE_SIZE[1] - fit.height) // 2))
    return np.asarray(canvas, dtype=np.uint8)


def build_templates() -> dict[str, list[np.ndarray]]:
    templates = {character: [] for character in "0123456789"}
    for font_path in PRICE_FONT_PATHS:
        if not font_path.exists():
            continue
        for size in (20, 24, 28, 32, 36):
            try:
                font = ImageFont.truetype(str(font_path), size=size)
            except OSError:
                continue
            for digit in templates:
                canvas = Image.new("L", (64, 64), 0)
                ImageDraw.Draw(canvas).text((5, -2), digit, font=font, fill=255, stroke_width=1)
                templates[digit].append(normalize_glyph(np.asarray(canvas) > 80))
    return templates


TEMPLATES = build_templates()


def classify_digit(mask: np.ndarray) -> tuple[str, float]:
    sample = normalize_glyph(mask).astype(np.float32) / 255
    scores = {}
    for digit, templates in TEMPLATES.items():
        best_score = -1.0
        for template in templates:
            target = template.astype(np.float32) / 255
            score = 1.0 - float(np.mean(np.abs(sample - target)))
            if score > best_score:
                best_score = score
        scores[digit] = best_score
    return max(scores.items(), key=lambda item: item[1])


def ocr_price(image: Image.Image) -> tuple[str, Optional[int], float]:
    rgb = np.asarray(image.convert("RGB"))
    gray = rgb.mean(axis=2)
    edge_samples = np.concatenate((gray[:3].ravel(), gray[-3:].ravel(), gray[:, :3].ravel(), gray[:, -3:].ravel()))
    dark_background = float(np.median(edge_samples)) < 125
    mask = gray > 155 if dark_background else gray < 165
    boxes = []
    for x1, y1, x2, y2, area in connected_components(mask):
        width = x2 - x1
        height = y2 - y1
        if area < 20 or width < 3 or height < max(10, image.height * 0.22):
            continue
        if height > image.height * 0.95 or width > image.width * 0.35:
            continue
        boxes.append((x1, y1, x2, y2, area))
    boxes.sort(key=lambda box: box[0])

    digits = []
    scores = []
    for index, (x1, y1, x2, y2, _area) in enumerate(boxes):
        width = x2 - x1
        height = y2 - y1
        if width <= max(4, image.width * 0.035) and height < image.height * 0.45:
            continue
        if dark_background and index == 0 and width >= image.width * 0.10:
            continue
        digit, score = classify_digit(mask[y1:y2, x1:x2])
        if score >= 0.60:
            digits.append(digit)
            scores.append(score)
    text = "".join(digits)
    value = int(text) if text.isdigit() else None
    confidence = float(np.mean(scores)) if scores else 0.0
    if value is None or value < 100 or value > 100_000_000:
        return text, None, confidence * 0.5
    return text, value, confidence


def layout_confidence(rows_found: list[tuple[int, int]], columns: list[list[tuple[int, int]]]) -> float:
    if not rows_found or not columns:
        return 0.0
    counts = [len(row) for row in columns]
    dominant = max(set(counts), key=counts.count)
    consistency = counts.count(dominant) / len(counts)
    widths = [end - start for row in columns for start, end in row]
    width_score = max(0.0, 1.0 - float(np.std(widths)) / max(1.0, float(np.mean(widths))))
    return round(min(1.0, consistency * 0.6 + width_score * 0.4), 3)


def analyze(input_path: Path, out_dir: Path) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    cards_dir = out_dir / "cards"
    prices_dir = out_dir / "prices"
    cards_dir.mkdir(exist_ok=True)
    prices_dir.mkdir(exist_ok=True)

    image = Image.open(input_path).convert("RGB")
    rgb = np.asarray(image)
    rows_found = detect_rows(rgb)
    columns = [detect_columns(rgb, row) for row in rows_found]
    cells = []
    index = 1
    for row_index, ((y1, y2), row_columns) in enumerate(zip(rows_found, columns)):
        py1, py2 = price_region(image.height, rows_found, row_index)
        for col_index, (x1, x2) in enumerate(row_columns):
            card = image.crop((x1, y1, x2, py1))
            price = image.crop((x1, py1, x2, py2))
            price_text, price_value, price_confidence = ocr_price(price)
            card_name = f"r{row_index + 1:02d}_c{col_index + 1:02d}_card.jpg"
            price_name = f"r{row_index + 1:02d}_c{col_index + 1:02d}_price.png"
            card.save(cards_dir / card_name, quality=90)
            price.save(prices_dir / price_name)
            cells.append(Cell(
                index=index,
                row=row_index + 1,
                col=col_index + 1,
                bbox={"x": x1, "y": y1, "w": x2 - x1, "h": py2 - y1},
                card_bbox={"x": x1, "y": y1, "w": x2 - x1, "h": py1 - y1},
                price_bbox={"x": x1, "y": py1, "w": x2 - x1, "h": py2 - py1},
                card_path=f"cards/{card_name}",
                price_path=f"prices/{price_name}",
                price_text=price_text,
                price_value=price_value,
                price_confidence=round(price_confidence, 3),
            ))
            index += 1

    confidence = layout_confidence(rows_found, columns)
    manifest = {
        "schemaVersion": 1,
        "input": str(input_path),
        "imageSize": {"width": image.width, "height": image.height},
        "layout": {
            "mode": "adaptive-grid",
            "rows": len(rows_found),
            "columnsByRow": [len(row) for row in columns],
            "confidence": confidence,
            "autoEligible": confidence >= 0.92,
        },
        "cellCount": len(cells),
        "priceRecognized": sum(cell.price_value is not None for cell in cells),
        "autoRegistered": 0,
        "cells": [asdict(cell) for cell in cells],
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    make_contact_sheet(image, cells, out_dir)
    return manifest


def make_contact_sheet(source: Image.Image, cells: list[Cell], out_dir: Path) -> None:
    cols = 5
    tile_w = 220
    tile_h = 300
    rows = math.ceil(len(cells) / cols)
    sheet = Image.new("RGB", (cols * tile_w, rows * tile_h), (20, 24, 32))
    draw = ImageDraw.Draw(sheet)
    for offset, cell in enumerate(cells):
        x = (offset % cols) * tile_w
        y = (offset // cols) * tile_h
        box = cell.bbox
        crop = source.crop((box["x"], box["y"], box["x"] + box["w"], box["y"] + box["h"]))
        fit = ImageOps.contain(crop, (tile_w - 12, tile_h - 38))
        sheet.paste(fit, (x + (tile_w - fit.width) // 2, y + 4))
        label = f"#{cell.index} R{cell.row}C{cell.col} price={cell.price_value or '?'}"
        draw.text((x + 6, y + tile_h - 28), label, fill=(240, 240, 240))
    sheet.save(out_dir / "contact-sheet.jpg", quality=88)


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("usage: analyze_x_buyback_sheet.py INPUT_IMAGE OUTPUT_DIR")
    manifest = analyze(Path(sys.argv[1]), Path(sys.argv[2]))
    print(json.dumps({
        "rows": manifest["layout"]["rows"],
        "columnsByRow": manifest["layout"]["columnsByRow"],
        "layoutConfidence": manifest["layout"]["confidence"],
        "cells": manifest["cellCount"],
        "priceRecognized": manifest["priceRecognized"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
