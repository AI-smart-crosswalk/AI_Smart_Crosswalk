"""
========================================
Calibration Tool

This file calculates the adult height reference
for a camera from a video. It is used to tell
children from adults.

A person's height in pixels depends on where they
stand, so the video is split into a far band and a
near band. Most people are adults, so a high
percentile of the heights in each band is used.

Run:
    python calibrate.py --source samples/clip2.mp4            # print the value
    python calibrate.py --source samples/clip2.mp4 --write    # also save it in config.py
========================================
"""
from __future__ import annotations

import argparse
import re
from statistics import median

import cv2

import config
from detector import detect          # Loads the YOLO model once.


# ========================================
# Percentile Helper
# ========================================
def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    # Sort the values and pick the one at the requested percentile.
    s = sorted(values)
    k = max(0, min(len(s) - 1, int(round((pct / 100.0) * (len(s) - 1)))))
    return s[k]


# ========================================
# Collect Person Samples
# ========================================
def collect_samples(source, every_n: int) -> list[tuple[float, float]]:
    """Return (feet_y_norm, height_norm) for every full person box in the video."""
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise SystemExit(f"[ERROR] cannot open {source!r}")
    samples: list[tuple[float, float]] = []
    idx = -1
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        idx += 1
        # Analyze only 1 of every N frames.
        if idx % every_n:
            continue
        h, w = frame.shape[:2]
        mx, my = 0.02 * w, 0.02 * h
        for d in detect(frame):
            # Keep only people that are big enough.
            if d["classId"] != config.PERSON_CLASS_ID:
                continue
            x, y, bw, bh = d["x"], d["y"], d["width"], d["height"]
            if bh < config.MIN_PERSON_HEIGHT_PX:
                continue
            # Skip boxes that touch the frame border (the body is cut off).
            if x <= mx or y <= my or x + bw >= w - mx or y + bh >= h - my:
                continue
            samples.append(((y + bh) / h, bh / h))
    cap.release()
    return samples


# ========================================
# Calculate Height Reference
# ========================================
def fit_reference(samples: list[tuple[float, float]], pct: float = 70.0):
    """Return two (feet_y_norm, adult_height_norm) points: one far and one near."""
    if len(samples) < 12:
        raise SystemExit(f"[ERROR] only {len(samples)} samples - need a clip with more pedestrians")
    samples.sort(key=lambda s: s[0])                 # Sort from far to near.
    mid = len(samples) // 2
    bands = [samples[:mid], samples[mid:]]           # Far half and near half.
    ref = []
    for band in bands:
        fy = median(fy for fy, _ in band)
        hn = _percentile([hn for _, hn in band], pct)   # Adults are the taller part of the band.
        ref.append((round(fy, 4), round(hn, 4)))
    return ref


# ========================================
# Save Result In Config
# ========================================
def write_into_config(ref) -> None:
    path = config.__file__
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    # Replace the ADULT_HEIGHT_REF line with the new value.
    line = f"ADULT_HEIGHT_REF = {ref}"
    new, n = re.subn(r"^ADULT_HEIGHT_REF\s*=.*$", line, text, count=1, flags=re.M)
    if n == 0:
        raise SystemExit("[ERROR] could not find ADULT_HEIGHT_REF in config.py")
    with open(path, "w", encoding="utf-8") as f:
        f.write(new)
    print(f"[OK] wrote into {path}")


# ========================================
# Main
# ========================================
def main() -> None:
    # Read the command line options.
    ap = argparse.ArgumentParser(description="Calibrate ADULT_HEIGHT_REF from a video.")
    ap.add_argument("--source", required=True, help="video file path")
    ap.add_argument("--every", type=int, default=5, help="analyse 1 of every N frames (default 5)")
    ap.add_argument("--pct", type=float, default=70.0, help="adult height percentile per band (default 70)")
    ap.add_argument("--write", action="store_true", help="write the result into config.py")
    args = ap.parse_args()

    # Collect samples, calculate the reference, and print it.
    samples = collect_samples(args.source, max(1, args.every))
    ref = fit_reference(samples, args.pct)
    print(f"[INFO] {len(samples)} person samples")
    print(f"ADULT_HEIGHT_REF = {ref}")
    if args.write:
        write_into_config(ref)
    else:
        print("[hint] re-run with --write to save it into config.py")


if __name__ == "__main__":
    main()
