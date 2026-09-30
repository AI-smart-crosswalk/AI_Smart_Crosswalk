# [LIEL] End-to-end: a synthetic VIDEO file -> VideoProcessor -> alerts, with a colour-based
# stand-in for YOLO (dark rectangle = person, blue square = phone). No ultralytics needed.
import os
import tempfile
import unittest

import cv2
import numpy as np

import config
from alert_sender import NullAlertSender, build_payload
from risk_rules import EdgeZone, RiskEngine
from tracker import SimpleTracker
from video_processor import VideoProcessor

_saved_ref = None
_saved_meters = None


def setUpModule():
    """Child-calibration and metres OFF for these tests, regardless of what's committed in config.py."""
    global _saved_ref, _saved_meters
    _saved_ref = config.ADULT_HEIGHT_REF
    _saved_meters = config.METERS_PER_H
    config.ADULT_HEIGHT_REF = None
    config.METERS_PER_H = None


def tearDownModule():
    config.ADULT_HEIGHT_REF = _saved_ref
    config.METERS_PER_H = _saved_meters

W, H, FPS = 640, 480, 10
ZONE = EdgeZone([(0.0, 0.8), (1.0, 0.8), (1.0, 1.0), (0.0, 1.0)])      # zone line at y = 384
PERSON_H, PERSON_W = 80, 30
BG, PERSON_COLOR, PHONE_COLOR = (220, 220, 220), (50, 50, 50), (240, 30, 30)


def colour_detect(frame) -> list[dict]:
    """Fake YOLO: dark blobs are persons (class 0), blue blobs are cell phones (class 67)."""
    b, g, r = cv2.split(frame)
    blue = (b > 150) & (r < 100) & (g < 100)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    person = (gray < 110) & ~blue
    out = []
    for mask, class_id, label, min_area in ((person, 0, "person", 300), (blue, 67, "cell phone", 20)):
        n, _labels, stats, _c = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
        for i in range(1, n):
            x, y, w, h, area = stats[i]
            if area >= min_area:
                out.append({"classId": class_id, "label": label, "confidence": 0.9,
                            "x": float(x), "y": float(y), "width": float(w), "height": float(h)})
    return out


def write_video(path: str, frames) -> bool:
    writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"MJPG"), FPS, (W, H))
    if not writer.isOpened():
        return False
    for f in frames:
        writer.write(f)
    writer.release()
    return True


def scene(seconds: float, x_at, y_feet_at, phone: bool = False):
    """Frames of one person whose centre x and feet y are functions of time."""
    frames = []
    for i in range(int(seconds * FPS)):
        t = i / FPS
        img = np.full((H, W, 3), BG, np.uint8)
        x, yf = int(x_at(t)), int(y_feet_at(t))
        cv2.rectangle(img, (x - PERSON_W // 2, yf - PERSON_H), (x + PERSON_W // 2, yf), PERSON_COLOR, -1)
        if phone:                                           # a phone at chest height
            cx, cy = x + PERSON_W // 2 - 4, yf - int(0.65 * PERSON_H)
            cv2.rectangle(img, (cx - 5, cy - 5), (cx + 5, cy + 5), PHONE_COLOR, -1)
        frames.append(img)
    return frames


class VideoTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def run_clip(self, frames, every_n: int = 1):
        path = os.path.join(self.tmp.name, "clip.avi")
        if not write_video(path, frames):
            self.skipTest("OpenCV has no MJPG writer on this machine")
        sender = NullAlertSender()
        vp = VideoProcessor(source=path,
                            tracker=SimpleTracker(detect_fn=colour_detect),
                            engine=RiskEngine(zone=ZONE),
                            alert_sender=sender, show=False, every_n=every_n)
        summary = vp.run()
        return summary, sender.sent

    def test_walker_approaching_is_low_and_no_high(self):
        # feet from y=200 to y=470 in 4 s: 0.84 h/s (calm walk) -> normal crossing = all Low, no LEDs
        summary, sent = self.run_clip(scene(4.0, lambda t: 320, lambda t: 200 + 270 * t / 4.0))
        cases = [e.assessment.case_id for e in sent]
        self.assertIn("M1", cases)
        self.assertTrue(all(e.assessment.level == "Low" for e in sent))   # calm walk never lights LEDs
        self.assertLessEqual(len(sent), 4, f"too many alerts for one walker: {summary['events']}")

    def test_runner_gives_H1(self):
        # same 270 px in 1.0 s -> 3.4 h/s (running)
        _summary, sent = self.run_clip(scene(1.5, lambda t: 320, lambda t: 200 + 270 * min(t, 1.0)))
        self.assertIn("H1", [e.assessment.case_id for e in sent])
        self.assertTrue(any(e.assessment.danger for e in sent))

    def test_standing_at_edge_is_one_low_alert(self):
        # feet 24 px above the zone line = 0.3 h, not moving, for 3 s -> exactly one L4 (cooldown 10 s)
        _summary, sent = self.run_clip(scene(3.0, lambda t: 320, lambda t: 360))
        self.assertEqual([e.assessment.case_id for e in sent], ["L4"])
        payload = build_payload(sent[0])
        self.assertEqual(payload["severity"], "Low")
        self.assertFalse(payload["ledTriggered"])
        self.assertIsNone(payload["distanceFromCrosswalk"])          # no METERS_PER_H calibration
        self.assertNotIn("imageBase64", payload)                     # Low alerts carry no snapshot

    def test_standing_with_phone_is_L4_distracted(self):
        _summary, sent = self.run_clip(scene(3.0, lambda t: 320, lambda t: 360, phone=True))
        self.assertEqual(sent[0].assessment.case_id, "L4")
        self.assertTrue(sent[0].assessment.distracted)

    def test_parallel_walker_is_only_low(self):
        # feet fixed at y = 350 (0.4 h from the line), x sweeps 100 -> 540 in 4 s
        _summary, sent = self.run_clip(scene(4.0, lambda t: 100 + 110 * t, lambda t: 350))
        self.assertTrue(sent)
        self.assertTrue(all(e.assessment.level == "Low" for e in sent))
        self.assertIn("L1", [e.assessment.case_id for e in sent])

    def test_frame_skipping_and_summary(self):
        # at 10 fps, "1 of 3" (0.3 s apart) is too sparse for the tracker (max gap 0.5 s / 2),
        # so VideoProcessor clamps to "1 of 2" and warns -> 10 of 20 frames analysed
        summary, _sent = self.run_clip(scene(2.0, lambda t: 320, lambda t: 200 + 270 * t / 4.0), every_n=3)
        self.assertEqual(summary["framesRead"], 20)
        self.assertEqual(summary["framesAnalysed"], 10)
        for key in ("alerts", "byLevel", "byCase", "events"):
            self.assertIn(key, summary)


class TestPayload(unittest.TestCase):
    def test_medium_payload_flags_leds_and_maps_schema_fields(self):
        from alert_sender import RiskEvent
        from risk_rules import Assessment
        a = Assessment(track_id=3, level="Medium", case_id="M1", case_name="התקרבות רציפה לכביש",
                       reason="r", confidence=77, person_type="adult", distracted=False,
                       metadata={"distanceToEdgeH": 0.5, "approachSpeedHps": 1.0})
        ev = RiskEvent(assessment=a, crosswalk_id="cw_001", camera_id="cam_101", video_time=1.5,
                       frame_index=15, snapshot_base64="AAAA")
        p = build_payload(ev)
        self.assertEqual(p["severity"], "Medium")
        self.assertTrue(p["ledTriggered"])
        self.assertEqual(p["confidence"], 77)
        self.assertEqual(p["personType"], "adult")
        self.assertTrue(p["description"].startswith("M1 · "))
        self.assertEqual(p["imageBase64"], "AAAA")
        self.assertNotIn("imageBase64", build_payload(ev, include_image=False))
        old = config.METERS_PER_H
        try:
            config.METERS_PER_H = 1.4
            self.assertEqual(build_payload(ev)["distanceFromCrosswalk"], 0.7)
            self.assertEqual(build_payload(ev)["approachSpeed"], 1.4)
        finally:
            config.METERS_PER_H = old


if __name__ == "__main__":
    unittest.main()
