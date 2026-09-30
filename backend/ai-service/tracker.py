"""
========================================
Object Tracker

This file gives every detected person a stable id
across video frames. This lets the risk rules measure
the direction, speed, and time to the edge of each person.
YOLO alone does not know that a person in two frames
is the same person.

There are two trackers with the same interface:
  * SimpleTracker: a built-in matcher (default, config.TRACKER = "simple").
  * YoloTracker:   the ByteTrack tracker of Ultralytics (config.TRACKER = "yolo").
========================================
"""
from __future__ import annotations

from dataclasses import dataclass, field
from statistics import median

import config


# ========================================
# Observation
# ========================================
@dataclass
class Observation:
    """One object in one analyzed frame."""
    t: float                 # Video time in seconds.
    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float
    truncated: bool          # The box touches the frame border, so the height is not full.
    phone: bool              # The person holds a phone in this frame.
    kind: str = "person"     # "person" or "wheeled" (bicycle / motorcycle).

    @property
    def width(self) -> float:
        return self.x2 - self.x1

    @property
    def height(self) -> float:
        return self.y2 - self.y1

    @property
    def anchor(self) -> tuple[float, float]:
        """Bottom center of the box = where the feet touch the ground."""
        return (self.x1 + self.x2) / 2.0, self.y2

    @property
    def chest(self) -> tuple[float, float]:
        """Chest point (35% down from the top of the box), used for the phone rule."""
        return (self.x1 + self.x2) / 2.0, self.y1 + 0.35 * self.height


# ========================================
# Track
# ========================================
@dataclass
class Track:
    """One object (person or wheeled) followed over time."""
    track_id: int
    observations: list[Observation] = field(default_factory=list)
    kind: str = "person"     # "person" or "wheeled".

    @property
    def born_at(self) -> float:
        return self.observations[0].t

    @property
    def last(self) -> Observation:
        return self.observations[-1]

    def age(self, t: float) -> float:
        return t - self.born_at

    @property
    def h_ref(self) -> float:
        """
        Body height in pixels: the median height of the full (not cut off) boxes.
        If every box is cut off, all boxes are used.
        """
        good = [o.height for o in self.observations if not o.truncated]
        return float(median(good if good else [o.height for o in self.observations]))

    def window(self, t: float, seconds: float) -> list[Observation]:
        """Observations from the last `seconds` of video time."""
        return [o for o in self.observations if o.t >= t - seconds]

    def trim(self, t: float) -> None:
        """
        Remove old observations so memory does not keep growing.
        The first observation is always kept (born_at and rule H4 need it).
        """
        keep_from = t - max(config.RISK_WINDOW_SECONDS, 2 * config.TRACK_MAX_GAP_SECONDS) - 1.0
        if len(self.observations) > 2 and self.observations[1].t < keep_from:
            first = self.observations[0]
            self.observations = [first] + [o for o in self.observations[1:] if o.t >= keep_from]


# ========================================
# Detection Helpers
# ========================================
def is_truncated(det: dict, frame_w: int, frame_h: int, margin: float = config.TRUNCATION_MARGIN) -> bool:
    """True if the box touches any border of the frame (within `margin` of the frame size)."""
    mx, my = margin * frame_w, margin * frame_h
    return (det["x"] <= mx or det["y"] <= my
            or det["x"] + det["width"] >= frame_w - mx
            or det["y"] + det["height"] >= frame_h - my)


def iou(a: dict, b: dict) -> float:
    """How much two boxes overlap (intersection over union, 0 to 1)."""
    ax2, ay2 = a["x"] + a["width"], a["y"] + a["height"]
    bx2, by2 = b["x"] + b["width"], b["y"] + b["height"]
    iw = max(0.0, min(ax2, bx2) - max(a["x"], b["x"]))
    ih = max(0.0, min(ay2, by2) - max(a["y"], b["y"]))
    inter = iw * ih
    union = a["width"] * a["height"] + b["width"] * b["height"] - inter
    return inter / union if union > 0 else 0.0


def suppress_duplicates(persons: list[dict], iou_threshold: float = config.DUPLICATE_IOU) -> list[dict]:
    """YOLO sometimes returns two boxes for one person. Keep the more confident one."""
    kept: list[dict] = []
    for det in sorted(persons, key=lambda d: d["confidence"], reverse=True):
        if all(iou(det, k) < iou_threshold for k in kept):
            kept.append(det)
    return kept


def assign_phones(persons: list[dict], phones: list[dict],
                  max_dist_h: float = config.PHONE_MAX_DIST) -> set[int]:
    """
    Decide which people hold a phone in this frame.
    Each phone is given to one person only (the nearest one).
    A phone counts if it is near the chest, or inside the upper 60% of the person's box.
    Returns the indexes of the people who hold a phone.
    """
    # Find all close (person, phone) pairs.
    candidates = []                                   # (distance_in_h, person_index, phone_index)
    for pi, p in enumerate(persons):
        h = p["height"] or 1.0
        cx, cy = p["x"] + p["width"] / 2.0, p["y"] + 0.35 * h
        for qi, q in enumerate(phones):
            qx, qy = q["x"] + q["width"] / 2.0, q["y"] + q["height"] / 2.0
            d = ((qx - cx) ** 2 + (qy - cy) ** 2) ** 0.5 / h
            inside_upper = (p["x"] <= qx <= p["x"] + p["width"]) and (p["y"] <= qy <= p["y"] + 0.6 * h)
            if d < max_dist_h or inside_upper:
                candidates.append((d, pi, qi))
    # Give each phone to the closest person first.
    holders: set[int] = set()
    used_phones: set[int] = set()
    for d, pi, qi in sorted(candidates):
        if pi in holders or qi in used_phones:
            continue
        holders.add(pi)
        used_phones.add(qi)
    return holders


def split_detections(detections: list[dict]) -> tuple[list[dict], list[dict], list[dict]]:
    """Split the detections into (persons, phones, wheeled). Other vehicles are ignored."""
    persons = [d for d in detections if d["classId"] == config.PERSON_CLASS_ID]
    phones = [d for d in detections if d["classId"] == config.PHONE_CLASS_ID]
    wheeled = [d for d in detections if d["classId"] in config.WHEELED_CLASS_IDS]
    return persons, phones, wheeled


# ========================================
# Simple Tracker
# ========================================
class SimpleTracker:
    """
    Matches boxes from frame to frame. For every track, it predicts where the
    person should be now and matches the closest new box with a similar size.
    New boxes start new tracks. Tracks not seen for TRACK_MAX_GAP_SECONDS are removed.
    """

    def __init__(self, detect_fn=None):
        # Tests pass a fake detector; otherwise use the YOLO detector.
        if detect_fn is None:
            from detector import detect as detect_fn       # Import here because it loads YOLO.
        self.detect = detect_fn
        self._tracks: dict[int, Track] = {}
        self._next_id = 1
        self._dead: list[tuple[float, tuple[float, float], float]] = []   # (t_death, anchor, h_ref)

    # ----------------------------------------
    # Public Methods
    # ----------------------------------------
    @property
    def live_tracks(self) -> list[Track]:
        return list(self._tracks.values())

    def process(self, t: float, frame) -> tuple[list[Track], list[dict]]:
        """
        Detect and match one frame. Returns (tracks seen in this frame, phone detections).
        """
        frame_h, frame_w = frame.shape[:2]
        persons, phones, wheeled = split_detections(self.detect(frame))
        print(f"[DEBUG] t={t:.2f}s persons={len(persons)} phones={len(phones)}")
        # Remove small and duplicate person boxes, then find phone holders.
        persons = [p for p in persons if p["height"] >= config.MIN_PERSON_HEIGHT_PX]
        persons = suppress_duplicates(persons)
        holders = assign_phones(persons, phones)

        # Create an observation for each person.
        observations = [
            Observation(
                t=t, x1=p["x"], y1=p["y"], x2=p["x"] + p["width"], y2=p["y"] + p["height"],
                confidence=p["confidence"],
                truncated=is_truncated(p, frame_w, frame_h),
                phone=(i in holders),
            )
            for i, p in enumerate(persons)
        ]

        # Track bicycles and motorcycles too, with kind="wheeled".
        wheeled = [w for w in wheeled if w["height"] >= config.WHEELED_MIN_HEIGHT_PX]
        wheeled = suppress_duplicates(wheeled)
        observations += [
            Observation(
                t=t, x1=w["x"], y1=w["y"], x2=w["x"] + w["width"], y2=w["y"] + w["height"],
                confidence=w["confidence"],
                truncated=is_truncated(w, frame_w, frame_h),
                phone=False, kind="wheeled",
            )
            for w in wheeled
        ]

        # Remove old tracks, then match the new observations.
        self._expire(t)
        seen = self._match(t, observations)
        return seen, phones

    def recently_died_near(self, t: float, anchor: tuple[float, float], h_ref: float) -> bool:
        """
        True if a track ended a moment ago near `anchor`. This stops the risk rules
        from treating a person who was seen again as a "sudden appearance" (H4).
        """
        horizon = 2.0 * config.TRACK_MAX_GAP_SECONDS
        for t_death, dead_anchor, dead_h in self._dead:
            if t - t_death > horizon:
                continue
            dist = ((anchor[0] - dead_anchor[0]) ** 2 + (anchor[1] - dead_anchor[1]) ** 2) ** 0.5
            if dist <= 3.0 * max(h_ref, dead_h):
                return True
        return False

    # ----------------------------------------
    # Internal Methods
    # ----------------------------------------
    def _expire(self, t: float) -> None:
        """Remove tracks that were not seen for TRACK_MAX_GAP_SECONDS."""
        for tid in [tid for tid, tr in self._tracks.items() if t - tr.last.t > config.TRACK_MAX_GAP_SECONDS]:
            tr = self._tracks.pop(tid)
            self._dead.append((tr.last.t, tr.last.anchor, tr.h_ref))
        self._dead = [d for d in self._dead if t - d[0] <= 4.0 * config.TRACK_MAX_GAP_SECONDS]

    @staticmethod
    def _predict(track: Track, t: float) -> tuple[float, float]:
        """Predict where the feet will be at time t, using the last speed."""
        obs = track.observations
        ax, ay = obs[-1].anchor
        if len(obs) < 2:
            return ax, ay
        px, py = obs[-2].anchor
        dt_prev = obs[-1].t - obs[-2].t
        if dt_prev <= 0:
            return ax, ay
        dt = t - obs[-1].t
        return ax + (ax - px) / dt_prev * dt, ay + (ay - py) / dt_prev * dt

    def _match(self, t: float, observations: list[Observation]) -> list[Track]:
        """Match tracks to observations, closest pairs first."""
        # Find all possible (track, observation) pairs.
        pairs = []                                                   # (cost, track_id, obs_index)
        for tid, tr in self._tracks.items():
            dt = max(t - tr.last.t, 1e-6)
            h_ref = tr.h_ref
            gate_px = max(config.TRACK_MATCH_SPEED_H_PER_S * dt * h_ref, config.TRACK_MIN_GATE_PX)
            pred = self._predict(tr, t)
            for oi, ob in enumerate(observations):
                if tr.kind != ob.kind:
                    continue                              # Do not match a person with a wheeled object.
                # Skip boxes with a very different size.
                if not (ob.truncated or tr.last.truncated):
                    ratio = ob.height / tr.last.height if tr.last.height > 0 else 1.0
                    lo, hi = config.TRACK_SIZE_RATIO
                    if not (lo <= ratio <= hi):
                        continue
                # Keep the pair only if the box is close to the predicted position.
                ax, ay = ob.anchor
                dist_px = ((ax - pred[0]) ** 2 + (ay - pred[1]) ** 2) ** 0.5
                if dist_px <= gate_px:
                    pairs.append((dist_px / h_ref, tid, oi))

        matched_tracks: set[int] = set()
        matched_obs: set[int] = set()
        seen: list[Track] = []
        # Add each observation to its matched track.
        for _cost, tid, oi in sorted(pairs):
            if tid in matched_tracks or oi in matched_obs:
                continue
            self._tracks[tid].observations.append(observations[oi])
            self._tracks[tid].trim(t)
            matched_tracks.add(tid)
            matched_obs.add(oi)
            seen.append(self._tracks[tid])

        # Start a new track for every observation that was not matched.
        for oi, ob in enumerate(observations):
            if oi in matched_obs:
                continue
            tr = Track(track_id=self._next_id, observations=[ob], kind=ob.kind)
            self._next_id += 1
            self._tracks[tr.track_id] = tr
            seen.append(tr)
        return seen


# ========================================
# YOLO Tracker (optional)
# ========================================
class YoloTracker:
    """
    Uses the ByteTrack tracker of Ultralytics, which gives the ids by itself.
    Same interface as SimpleTracker. It is not covered by the unit tests.
    """

    def __init__(self, model=None, tracker_cfg: str = "bytetrack.yaml"):
        if model is None:
            from detector import model                        # The YOLO model loaded by the detector.
        self.model = model
        self.tracker_cfg = tracker_cfg
        self._tracks: dict[int, Track] = {}
        self._dead: list[tuple[float, tuple[float, float], float]] = []

    @property
    def live_tracks(self) -> list[Track]:
        return list(self._tracks.values())

    def process(self, t: float, frame) -> tuple[list[Track], list[dict]]:
        frame_h, frame_w = frame.shape[:2]
        # Run YOLO with tracking on the frame.
        results = self.model.track(frame, persist=True, verbose=False, tracker=self.tracker_cfg,
                                   conf=config.CONFIDENCE_THRESHOLD,
                                   classes=sorted(config.TARGET_CLASS_IDS))[0]
        persons, phones, ids = [], [], []
        wheeled, wheeled_ids = [], []
        # Split the boxes into persons, phones, and wheeled objects.
        for box in results.boxes:
            class_id = int(box.cls[0])
            x1, y1, x2, y2 = (float(v) for v in box.xyxy[0])
            det = {"classId": class_id, "confidence": float(box.conf[0]),
                   "x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1}
            if class_id == config.PERSON_CLASS_ID and box.id is not None:
                persons.append(det)
                ids.append(int(box.id[0]))
            elif class_id == config.PHONE_CLASS_ID:
                phones.append(det)
            elif class_id in config.WHEELED_CLASS_IDS and box.id is not None:
                wheeled.append(det)
                wheeled_ids.append(int(box.id[0]))
        holders = assign_phones(persons, phones)

        seen: list[Track] = []
        # Add each person to its track.
        for i, (p, tid) in enumerate(zip(persons, ids)):
            if p["height"] < config.MIN_PERSON_HEIGHT_PX:
                continue
            ob = Observation(t=t, x1=p["x"], y1=p["y"], x2=p["x"] + p["width"], y2=p["y"] + p["height"],
                             confidence=p["confidence"], truncated=is_truncated(p, frame_w, frame_h),
                             phone=(i in holders))
            tr = self._tracks.setdefault(tid, Track(track_id=tid))
            tr.observations.append(ob)
            tr.trim(t)
            seen.append(tr)

        # Add each wheeled object to its track.
        for w, tid in zip(wheeled, wheeled_ids):
            if w["height"] < config.WHEELED_MIN_HEIGHT_PX:
                continue
            ob = Observation(t=t, x1=w["x"], y1=w["y"], x2=w["x"] + w["width"], y2=w["y"] + w["height"],
                             confidence=w["confidence"], truncated=is_truncated(w, frame_w, frame_h),
                             phone=False, kind="wheeled")
            tr = self._tracks.setdefault(tid, Track(track_id=tid, kind="wheeled"))
            tr.observations.append(ob)
            tr.trim(t)
            seen.append(tr)

        # Remove tracks that were not seen for too long.
        for tid in [tid for tid, tr in self._tracks.items() if t - tr.last.t > config.TRACK_MAX_GAP_SECONDS]:
            tr = self._tracks.pop(tid)
            self._dead.append((tr.last.t, tr.last.anchor, tr.h_ref))
        self._dead = [d for d in self._dead if t - d[0] <= 4.0 * config.TRACK_MAX_GAP_SECONDS]
        return seen, phones

    def recently_died_near(self, t: float, anchor: tuple[float, float], h_ref: float) -> bool:
        return SimpleTracker.recently_died_near(self, t, anchor, h_ref)   # Same logic as SimpleTracker.


# ========================================
# Build Tracker
# ========================================
def build_tracker(detect_fn=None):
    """Create the tracker chosen in config.TRACKER."""
    if config.TRACKER == "yolo":
        return YoloTracker()
    return SimpleTracker(detect_fn=detect_fn)
