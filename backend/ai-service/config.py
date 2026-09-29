"""
========================================
AI Service Configuration

This file holds all the settings of the AI service:
the YOLO model, object classes, crosswalk zone,
video processing, tracking, risk rules, and alerts.
The numbers are starting values for tuning.
========================================
"""

import os

# ----------------------------------------
# Model
# ----------------------------------------
MODEL_PATH = "yolov8n.pt"     # Small and fast model. Use yolov8s.pt for better accuracy.
CONFIDENCE_THRESHOLD = 0.5  # Ignore detections below this confidence.

# ----------------------------------------
# Object Classes (COCO class ids)
# ----------------------------------------
PERSON_CLASS_ID = 0
VEHICLE_CLASS_IDS = {2, 3, 5, 7}   # car, motorcycle, bus, truck
PHONE_CLASS_ID = 67                # Cell phone (used by the phone rule).
# Bicycles and motorcycles that move toward the crossing.
BICYCLE_CLASS_ID = 1
WHEELED_CLASS_IDS = {BICYCLE_CLASS_ID, 3}
# The detector keeps only these classes.
TARGET_CLASS_IDS = {PERSON_CLASS_ID, PHONE_CLASS_ID} | VEHICLE_CLASS_IDS | WHEELED_CLASS_IDS

# ----------------------------------------
# Crosswalk Zone (normalized 0-1 points)
# ----------------------------------------
ROI_POLYGON_NORM = [
    (0.25, 0.45),   # top-left
    (0.75, 0.45),   # top-right
    (0.92, 0.95),   # bottom-right
    (0.08, 0.95),   # bottom-left
]
ROI_ANCHOR = "bottom_center"       # "bottom_center" (feet) or "center"

# ----------------------------------------
# Alert Settings
# ----------------------------------------
ALERT_COOLDOWN_SECONDS = 1.0

# Ids of the demo crosswalk and camera in the database.
CROSSWALK_ID = "66f1a0000000000000000001"
CAMERA_ID = "66f1b0000000000000000001"


# ----------------------------------------
# Video Source
# ----------------------------------------
VIDEO_SOURCE = "samples/clip1.mp4"   # Video file path, or a webcam number. CLI: --source
PROCESS_WIDTH = 960                  # Resize frames to this width before YOLO.
PROCESS_EVERY_N_FRAMES = 3           # Analyze 1 of every N frames to save CPU.
SHOW_WINDOW = False                  # True = show a window with boxes. CLI: --show
WINDOW_NAME = "Smart Crosswalk - Video Analysis"
SHOW_MAX_HEIGHT = 720               # Max window height in pixels (display only).

# ----------------------------------------
# Tracking (gives each person a stable id)
# ----------------------------------------
TRACKER = "simple"                     # "simple" = built-in matcher, "yolo" = ByteTrack.
TRACK_MAX_GAP_SECONDS = 0.5          # A person missing longer than this gets a new track.
TRACK_MATCH_SPEED_H_PER_S = 6.0      # Max movement per second, in body heights.
TRACK_MIN_GATE_PX = 20               # Minimum match distance in pixels.
TRACK_SIZE_RATIO = (0.6, 1.7)        # Allowed box height change between matches.
TRUNCATION_MARGIN = 0.02             # A box this close to the frame border is cut off.
MIN_PERSON_HEIGHT_PX = 40            # Ignore smaller boxes (too noisy).
DUPLICATE_IOU = 0.7                  # Two boxes overlapping more than this are one person.

# ----------------------------------------
# Risk Rules
# Distances are measured in body heights (h).
# dist > 0: outside the zone, dist <= 0: inside the zone.
# ----------------------------------------
RISK_WINDOW_SECONDS = 2.0            # Motion is measured over the last N seconds.
MIN_WINDOW_SECONDS = 0.5             # Minimum history needed before judging motion.
RECENT_SECONDS = 0.5                 # "Standing" is checked on the last 0.5 seconds.
STEP_LOOKBACK_SECONDS = 0.5          # "Stepping down" is checked on the last 0.5 seconds.
MIN_MOVE_H = 0.1                     # Smaller movement is noise, not real movement.
EDGE_JITTER = 0.1                    # Feet within 0.1 h of the edge count as "on the edge".
NEAR = 0.5                           # "At the edge" distance.
NEAR_APPROACH = 1.2                  # "Very close" distance for approaching people.
FAR = 1.5                            # The phone rule works only within this distance.
MOVING_MIN = 0.15                    # Below this speed (h/s) a person is standing.
BRISK_MIN = 1.5                      # At or above this speed (h/s) = fast walking.
RUN_MIN = 2.0                        # At or above this speed (h/s) = running.
TTE_MEDIUM = 2.0                     # Time to reach the edge (s) for an early warning.
PARALLEL_RATIO = 0.3                 # Below this ratio the person walks along the road.
PHONE_MAX_DIST = 0.35                # Max phone distance from the chest (h) = holding a phone.
PHONE_MIN_FRACTION = 0.5             # Phone must be seen in at least 50% of the frames.
PHONE_MIN_FRAMES = 2
CHILD_HEIGHT_RATIO = 0.8             # Shorter than 0.8 x adult height = child.
ADULT_HEIGHT_REF = [(0.7345, 0.1671), (0.8926, 0.3643)]
GROUP_MIN = 3                        # Minimum people for the group rule.
SUDDEN_MAX_AGE_SECONDS = 0.6         # A new track near the edge = sudden appearance.
METERS_PER_H = 1.7                   # Meters per body height. None = send null distances.

# ----------------------------------------
# Wheeled Object Rules (bicycle / motorcycle)
# ----------------------------------------
WHEELED_MOVING_MIN = 0.5            # Below this speed (h/s) the object is stopped.
WHEELED_FAST = 2.5                  # At or above this speed (h/s) = fast (High risk).
WHEELED_NEAR = 2.5                 # Check only objects within this distance (h).
WHEELED_MIN_HEIGHT_PX = 30         # Ignore very small boxes.

# ----------------------------------------
# Backend Alerts
# ----------------------------------------
# The backend URL for alerts. Set the API_URL env var to use another server.
API_URL = os.environ.get("API_URL", "http://localhost:3000/api/alerts")
API_TIMEOUT_SECONDS = 5


# ========================================
# Read Backend Env Value
# ========================================
def _read_backend_env(name: str) -> str:
    """Read one value from the backend .env file."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
    try:
        with open(path, encoding="utf-8") as f:
            # Find the line that starts with the name and return its value.
            for line in f:
                line = line.strip()
                if line.startswith(f"{name}="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return ""


# API key sent with every alert. The env var is used first, then the .env file.
SENSOR_API_KEY = os.environ.get("SENSOR_API_KEY") or _read_backend_env("SENSOR_API_KEY")
API_ENABLED = True                   # False = analyze only, do not send alerts.
MIN_FRAMES_FOR_ALERT = 3             # A person must be seen in 3 frames before an alert.
INCIDENT_QUIET_SECONDS = 3.0         # One alert per incident. The incident ends after this quiet time.
SNAPSHOT_JPEG_QUALITY = 70
