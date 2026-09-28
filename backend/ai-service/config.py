# PROVENANCE: [RACHE] your config, trimmed for images-only. [LIEL] video / tracking / risk-rule
#             settings added in the section at the bottom (the risk rules run HERE, in the AI service).
# ============================================================
# SANDBOX FILE - TRIMMED for images-only (was your vision/config.py).
# REMOVED (video/drawing, not needed for images): VIDEO_SOURCE, PROCESS_WIDTH,
#   COLOR_PERSON/VEHICLE/ROI/DANGER, WINDOW_NAME.
# KEPT: model, confidence, class ids, ROI, alert/API ids.
# NOTE (Option B): danger now runs in the BACKEND, so ROI / cooldown / API ids
#   really belong to the backend's danger+alert layer. Kept here for now;
#   move them to the backend when you wire the rules. The AI service itself
#   only needs MODEL_PATH + CONFIDENCE_THRESHOLD + the class allow-list.
# ============================================================

import os

# --- Model (AI service needs this) ---
MODEL_PATH = "yolov8n.pt"     # lightweight model; swap for yolov8s.pt for accuracy
CONFIDENCE_THRESHOLD = 0.5  # ignore detections below this confidence

# --- Classes of interest (the detector's allow-list) ---
# NOTE: the final allow-list = the union of classes your DANGER EVENTS reference
# (still to define). cell phone (67) is included because distraction is a scenario.
PERSON_CLASS_ID = 0
VEHICLE_CLASS_IDS = {2, 3, 5, 7}   # car, motorcycle, bus, truck
PHONE_CLASS_ID = 67                # cell phone (for distraction rule)
# Wheeled approachers coming toward the crossing (treated like fast pedestrians, not cross-traffic).
# bicycle (1) + motorcycle (3). e-scooter is not its own COCO class (reads as person/motorcycle).
BICYCLE_CLASS_ID = 1
WHEELED_CLASS_IDS = {BICYCLE_CLASS_ID, 3}
TARGET_CLASS_IDS = {PERSON_CLASS_ID, PHONE_CLASS_ID} | VEHICLE_CLASS_IDS | WHEELED_CLASS_IDS

# --- ROI (belongs to the backend danger layer under Option B) ---
ROI_POLYGON_NORM = [
    (0.25, 0.45),   # top-left
    (0.75, 0.45),   # top-right
    (0.92, 0.95),   # bottom-right
    (0.08, 0.95),   # bottom-left
]
ROI_ANCHOR = "bottom_center"       # "bottom_center" (feet) or "center"

# --- Alert debounce (belongs to the backend under Option B) ---
ALERT_COOLDOWN_SECONDS = 1.0

# --- Alert identity (belongs to the backend under Option B) ---
# _id values of the demo crosswalk / camera created by backend/seed.js (dummy-data.json)
CROSSWALK_ID = "66f1a0000000000000000001"
CAMERA_ID = "66f1b0000000000000000001"


# ============================================================
# [LIEL] Sprint 4 point 1 - VIDEO analysis + 12-case risk classification.
# Decision (lecturer, 13.9): no live cameras yet, analyse a VIDEO FILE; a video
# is a sequence of frames. The risk "brain" runs HERE in the AI service
# (video_processor.py -> tracker.py -> risk_rules.py -> alert_sender.py) and
# sends a READY alert to Rachel's existing POST /api/alerts.
# Every number below is a starting point for tuning, not a measured truth.
# ============================================================

# --- Video source (video_processor.py) ---
VIDEO_SOURCE = "samples/clip1.mp4"   # file path, or an int webcam index. CLI: python main.py --source ...
PROCESS_WIDTH = 960                  # downscale frames to this width before YOLO (Rachel's Sprint 3 value)
PROCESS_EVERY_N_FRAMES = 3           # analyse 1 of every N frames (CPU inference ~100-200 ms/frame)
SHOW_WINDOW = False                  # True = draw boxes/zone and open a window (needs a desktop). CLI: --show
WINDOW_NAME = "Smart Crosswalk - Video Analysis"
SHOW_MAX_HEIGHT = 720               # cap the displayed window height (px) so tall videos fit the screen (display only, not processing)

# --- Tracking (tracker.py): give every person a stable id across frames ---
TRACKER = "simple"                     # "simple" = our matcher (no extra deps) | "yolo" = ultralytics ByteTrack
TRACK_MAX_GAP_SECONDS = 0.5          # a person missing longer than this is a NEW track
TRACK_MATCH_SPEED_H_PER_S = 6.0      # matching gate: max plausible movement per second, in body heights (running ~2-4)
TRACK_MIN_GATE_PX = 20               # ...but never tighter than this many pixels (tiny boxes / jitter)
TRACK_SIZE_RATIO = (0.6, 1.7)        # box-height ratio between consecutive matches must stay in this range
TRUNCATION_MARGIN = 0.02             # box touching a frame border (within 2% of frame) => 'truncated'
MIN_PERSON_HEIGHT_PX = 40            # smaller boxes are ignored (jitter would look like motion)
DUPLICATE_IOU = 0.7                  # two person boxes overlapping more than this = one person

# --- Risk rules (risk_rules.py). Distances are in units of BODY HEIGHT h ---
# The edge zone = config.ROI_POLYGON_NORM above (Rachel's polygon, per-camera calibration later).
# dist > 0 : outside the zone (on the sidewalk), dist <= 0 : inside the zone (at/over the curb).
RISK_WINDOW_SECONDS = 2.0            # kinematics are measured over the last N seconds of a track
MIN_WINDOW_SECONDS = 0.5             # need at least this much history before judging motion (jitter at 25 fps)
RECENT_SECONDS = 0.5                 # "standing" is decided on the last 0.5 s, so LEDs stop when the person stops
STEP_LOOKBACK_SECONDS = 0.5          # "stepping down" looks at the last 0.5 s, not at a single frame pair
MIN_MOVE_H = 0.1                     # net displacement below this (h) is box jitter, not movement
EDGE_JITTER = 0.1                    # feet within +-0.1 h of the curb line still count as "on the line"
NEAR = 0.5                           # "at the edge" (static rules)                         ~0.5 body height
NEAR_APPROACH = 1.2                  # "very close" for M1 continuous approach              ~1.2 body heights
FAR = 1.5                            # phone rule (M2) only matters within this distance
MOVING_MIN = 0.15                    # below this (h/s) a person is "standing" (box jitter is ~0.05 h/s)
BRISK_MIN = 1.5                      # at/above this (h/s) = brisk (faster than a calm walk) but not yet a run
RUN_MIN = 2.0                        # at/above this speed (h/s) = running / bursting (H1)
TTE_MEDIUM = 2.0                     # time-to-edge (s) at walking pace => early-warning even if not yet "very close"
PARALLEL_RATIO = 0.3                 # |approach| < 0.3 * speed => moving parallel to the road
PHONE_MAX_DIST = 0.35                # phone centre within 0.35 h of the chest point => "holding a phone"
PHONE_MIN_FRACTION = 0.5             # phone seen in >= 50% of the window frames (and >= PHONE_MIN_FRAMES)
PHONE_MIN_FRAMES = 2
CHILD_HEIGHT_RATIO = 0.8             # h < 0.8 x adult reference height => child (1.4 m / 1.75 m)
ADULT_HEIGHT_REF = [(0.7345, 0.1671), (0.8926, 0.3643)]
GROUP_MIN = 3                        # group rule: at least this many people approaching together
SUDDEN_MAX_AGE_SECONDS = 0.6         # sudden-appearance: track younger than this AND already near AND approaching
METERS_PER_H = 1.7                   # metres per body-height unit (~ a typical adult, rough). None => metre fields sent as null

# --- Wheeled approacher rules (bicycle / motorcycle heading toward the crossing) ---
WHEELED_MOVING_MIN = 0.5            # h/s: below this a wheeled object is basically stopped (ignore)
WHEELED_FAST = 2.5                  # h/s: at/above this a wheeled approacher is "fast" -> High
WHEELED_NEAR = 2.5                 # h: only assess wheeled objects within this distance of the edge
WHEELED_MIN_HEIGHT_PX = 30         # ignore tiny wheeled boxes (far-away jitter)

# --- Alerts to the Node backend (alert_sender.py, port of Rachel's Sprint 3 alert_service.py) ---
# Where alerts are POSTed. Defaults to localhost; set the API_URL env var to point at the
# deployed Render backend so the live web dashboard sees the alerts (see below).
API_URL = os.environ.get("API_URL", "http://localhost:3000/api/alerts")
API_TIMEOUT_SECONDS = 5


def _read_backend_env(name: str) -> str:
    """Read one value from backend/.env (no python-dotenv dependency)."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith(f"{name}="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return ""


# Sent as the x-api-key header on every alert (backend: middleware/apiKeyMiddleware.js).
# Env var wins; otherwise the same value is read from backend/.env.
SENSOR_API_KEY = os.environ.get("SENSOR_API_KEY") or _read_backend_env("SENSOR_API_KEY")
API_ENABLED = True                   # False = analyse only, print events, no HTTP
MIN_FRAMES_FOR_ALERT = 3             # a person must be seen in >= 3 analysed frames before any alert (motion + phone need history)
INCIDENT_QUIET_SECONDS = 3.0         # one alert per crosswalk incident; it ends after this long with no risky person (then a new alert can fire)
SNAPSHOT_JPEG_QUALITY = 70
