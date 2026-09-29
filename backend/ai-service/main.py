"""
========================================
Video Analysis Entry Point

This file runs the risk analysis on a video
from the command line and prints a summary.

    python main.py --source samples/clip1.mp4              # analyze and send alerts
    python main.py --source samples/clip1.mp4 --no-api     # analyze only, print results
    python main.py --source 0 --show                       # webcam with a window ('q' quits)
========================================
"""
import argparse
import json
import os
import sys

import config


# ========================================
# Read Command Line Options
# ========================================
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Smart Crosswalk - video risk analysis (12 cases).")
    parser.add_argument("--source", default=None,
                        help="Video file path, or a webcam index (e.g. 0). Overrides config.VIDEO_SOURCE.")
    parser.add_argument("--show", action="store_true", help="Open a window with boxes and the edge zone.")
    parser.add_argument("--no-api", action="store_true", help="Do not POST alerts; just print them.")
    parser.add_argument("--every", type=int, default=config.PROCESS_EVERY_N_FRAMES,
                        help="Analyse 1 of every N frames (default from config).")
    parser.add_argument("--crosswalk", default=config.CROSSWALK_ID, help="crosswalkId for the alerts.")
    parser.add_argument("--camera", default=config.CAMERA_ID, help="cameraId for the alerts.")
    parser.add_argument("--tracker", choices=["simple", "yolo"], default=config.TRACKER,
                        help="simple = built-in matcher, yolo = ultralytics ByteTrack.")
    return parser.parse_args()


# ========================================
# Resolve Video Source
# ========================================
def resolve_source(raw):
    """A number ('0') means a webcam. Anything else is a file path."""
    if raw is None:
        raw = config.VIDEO_SOURCE
    if isinstance(raw, int):
        return raw
    if str(raw).isdigit():
        return int(raw)
    # Relative paths are resolved from this folder.
    if not os.path.isabs(raw):
        raw = os.path.join(os.path.dirname(os.path.abspath(__file__)), raw)
    return raw


# ========================================
# Main
# ========================================
def main() -> int:
    # Print in UTF-8 because the summary contains Hebrew text.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
    args = parse_args()
    config.TRACKER = args.tracker
    source = resolve_source(args.source)
    # Stop if the video file does not exist.
    if not isinstance(source, int) and not os.path.isfile(source):
        print(f"[ERROR] Video file not found: {source}")
        return 1

    # Import here so that `--help` works without loading YOLO.
    from alert_sender import build_alert_sender
    from video_processor import VideoProcessor

    # Create the video processor.
    try:
        processor = VideoProcessor(
            source=source,
            alert_sender=build_alert_sender(enabled=not args.no_api),
            show=args.show,
            every_n=args.every,
            crosswalk_id=args.crosswalk,
            camera_id=args.camera,
        )
    except Exception as exc:
        print(f"[ERROR] Failed to initialize: {exc}")     # Usually the model failed to load.
        return 1

    # Run the analysis and print the summary as JSON.
    summary = processor.run()
    print("\n[SUMMARY]")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if "error" not in summary else 1


if __name__ == "__main__":
    sys.exit(main())
