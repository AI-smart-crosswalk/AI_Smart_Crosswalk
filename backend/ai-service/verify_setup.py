"""
========================================
Setup Check

This file checks that the AI tools are installed.
It loads the YOLO model and runs it on one test
image to confirm that OpenCV and Ultralytics work.
========================================
"""

import argparse
import sys

try:
    import cv2
    from ultralytics import YOLO
except ImportError as exc:
    # Show a clear message if a library is missing.
    print(f"[ERROR] Missing dependency: {exc.name}. "
          f"Did you activate the venv and run 'pip install -r requirements.txt'?")
    sys.exit(1)


# Online sample image. YOLO downloads it automatically.
DEFAULT_SAMPLE = "https://ultralytics.com/images/bus.jpg"


# ========================================
# Read Command Line Options
# ========================================
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="YOLOv8 installation smoke test.")
    parser.add_argument(
        "--image",
        default=DEFAULT_SAMPLE,
        help="Path or URL to a test image (defaults to Ultralytics' bus.jpg).",
    )
    parser.add_argument(
        "--model",
        default="yolov8n.pt",
        help="Model weights to load (default: yolov8n.pt).",
    )
    parser.add_argument(
        "--no-window",
        action="store_true",
        help="Skip opening a display window (useful on headless servers).",
    )
    return parser.parse_args()


# ========================================
# Main
# ========================================
def main() -> int:
    args = parse_args()

    # 1. Load the model (downloaded on first use).
    print(f"[INFO] Loading model '{args.model}' ...")
    try:
        model = YOLO(args.model)
    except Exception as exc:  # For example, a failed download or a broken file.
        print(f"[ERROR] Could not load model: {exc}")
        return 1

    # 2. Run the model on the test image.
    print(f"[INFO] Running inference on '{args.image}' ...")
    try:
        results = model(args.image)
    except Exception as exc:
        print(f"[ERROR] Inference failed: {exc}")
        return 1

    # 3. Print the detected objects (one result per image).
    result = results[0]
    names = result.names  # Maps class id to class name.
    print(f"[INFO] Detected {len(result.boxes)} object(s):")
    for box in result.boxes:
        class_id = int(box.cls[0])
        confidence = float(box.conf[0])
        print(f"    - {names[class_id]:<12} conf={confidence:.2f}")

    # 4. Show the image with the detected boxes (unless --no-window is used).
    if not args.no_window:
        annotated = result.plot()
        cv2.imshow("YOLOv8 Verification - press any key to close", annotated)
        cv2.waitKey(0)
        cv2.destroyAllWindows()

    print("[SUCCESS] Environment verified. YOLOv8 + OpenCV are working.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
