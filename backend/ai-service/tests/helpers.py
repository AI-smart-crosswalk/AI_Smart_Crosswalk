# [LIEL] Shared helpers for the AI-service tests. No YOLO here: everything is synthetic.
"""
Geometry used by all tests: a 1000x1000 frame and a bottom-strip edge zone whose
top line is at y = 800. With a person height of 100 px, one body height (1 h) is
100 px, so:   dist_h = (800 - y_feet) / 100.
    y_feet = 750  -> dist = 0.5 h  (at the edge)
    y_feet = 600  -> dist = 2.0 h
    y_feet = 850  -> dist = -0.5 h (inside the zone)
"""
import numpy as np

from risk_rules import EdgeZone, RiskEngine
from tracker import Observation, Track

FRAME_W = FRAME_H = 1000
ZONE_TOP = 800
BOTTOM_ZONE = EdgeZone([(0.0, ZONE_TOP / FRAME_H), (1.0, ZONE_TOP / FRAME_H), (1.0, 1.0), (0.0, 1.0)])


def engine() -> RiskEngine:
    return RiskEngine(zone=BOTTOM_ZONE)


def y_feet_for_dist(dist_h: float, h: float = 100.0) -> float:
    """Inverse of dist_h = (ZONE_TOP - y_feet) / h."""
    return ZONE_TOP - dist_h * h


def obs(t: float, x: float, dist_h: float, h: float = 100.0, w: float = 40.0,
        conf: float = 0.9, phone: bool = False, truncated: bool = False,
        y_feet: float | None = None) -> Observation:
    """One observation of a person whose feet are `dist_h` body heights above the zone line."""
    yf = y_feet if y_feet is not None else y_feet_for_dist(dist_h, h)
    return Observation(t=t, x1=x - w / 2, y1=yf - h, x2=x + w / 2, y2=yf, confidence=conf,
                       truncated=truncated, phone=phone)


def track(track_id: int, dists: list[float], t0: float = 0.0, dt: float = 0.5, x: float = 500.0,
          xs: list[float] | None = None, h: float = 100.0, phone: bool | list[bool] = False,
          truncated: bool | list[bool] = False) -> Track:
    """A track from a list of distances (one per observation), evenly spaced in time."""
    n = len(dists)
    phones = phone if isinstance(phone, list) else [phone] * n
    truncs = truncated if isinstance(truncated, list) else [truncated] * n
    xs = xs or [x] * n
    return Track(track_id=track_id, observations=[
        obs(t0 + i * dt, xs[i], dists[i], h=h, phone=phones[i], truncated=truncs[i]) for i in range(n)
    ])


def blank_frame(w: int = FRAME_W, h: int = FRAME_H):
    return np.zeros((h, w, 3), dtype=np.uint8)


def det(x: float, y_feet: float, h: float = 100.0, w: float = 40.0, conf: float = 0.9,
        class_id: int = 0, label: str = "person") -> dict:
    """A detector-style dict {classId, label, confidence, x, y, width, height} for a person."""
    return {"classId": class_id, "label": label, "confidence": conf,
            "x": x - w / 2, "y": y_feet - h, "width": w, "height": h}


def phone_det(x: float, y: float, size: float = 12.0, conf: float = 0.6) -> dict:
    return {"classId": 67, "label": "cell phone", "confidence": conf,
            "x": x - size / 2, "y": y - size / 2, "width": size, "height": size}


class ScriptedDetector:
    """
    Stand-in for YOLO: returns a pre-written list of detections per call, in order.
    Frame content is ignored. Lets the tracker tests script exactly what 'YOLO saw'.
    """

    def __init__(self, frames: list[list[dict]]):
        self.frames = frames
        self.calls = 0

    def __call__(self, frame) -> list[dict]:
        dets = self.frames[min(self.calls, len(self.frames) - 1)]
        self.calls += 1
        return dets
