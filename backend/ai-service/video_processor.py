"""
========================================
Video Processor

This file runs the full analysis on one video:

    video --> frames --> YOLO (detector.py) --> tracker.py (who is who) -->
    risk_rules.py (which risk case) --> alert_sender.py (send alert)

Run:  python main.py --source path/to/clip.mp4            (see main.py for options)
========================================
"""
from __future__ import annotations

import base64
import math
import time
from collections import Counter
from dataclasses import replace

import cv2

import config
from alert_sender import RiskEvent, build_alert_sender
from risk_rules import LEVEL_RANK, PRIORITY, RiskEngine
from tracker import build_tracker


# ========================================
# Video Processor
# ========================================
class VideoProcessor:
    """Reads a video and runs detect, track, classify, and alert on its frames."""

    def __init__(self, source=config.VIDEO_SOURCE, tracker=None, engine=None, alert_sender=None,
                 show: bool = config.SHOW_WINDOW, every_n: int = config.PROCESS_EVERY_N_FRAMES,
                 crosswalk_id: str = config.CROSSWALK_ID, camera_id: str = config.CAMERA_ID):
        self.source = source
        # Tests can pass their own parts; otherwise create the default ones.
        self.tracker = tracker or build_tracker()
        self.engine = engine or RiskEngine()
        self.alerts = alert_sender or build_alert_sender()
        self.show = show
        self.every_n = max(1, int(every_n))
        self.crosswalk_id = crosswalk_id
        self.camera_id = camera_id

        self.cap: cv2.VideoCapture | None = None
        self.fps: float = 25.0
        # The current incident at this crosswalk (None if there is no incident).
        self._incident: dict | None = None
        self.events: list[RiskEvent] = []
        self.frames_read = 0
        self.frames_analysed = 0

    # ----------------------------------------
    # Open and Close the Video
    # ----------------------------------------
    def _open(self) -> bool:
        """Open the video source. Returns True on success."""
        self.cap = cv2.VideoCapture(self.source)
        if not self.cap.isOpened():
            print(f"[ERROR] Could not open video source: {self.source!r}")
            return False
        fps = self.cap.get(cv2.CAP_PROP_FPS)
        self.fps = fps if fps and fps > 0 else 25.0
        # Skipping too many frames would break the tracks,
        # so limit the frame step and print a warning.
        max_every = max(1, math.floor(config.TRACK_MAX_GAP_SECONDS * self.fps / 2))
        if self.every_n > max_every:
            print(f"[WARN] --every {self.every_n} is too sparse for {self.fps:.0f} fps; using {max_every}")
            self.every_n = max_every
        print(f"[INFO] Video source opened: {self.source!r} ({self.fps:.1f} fps, analysing 1 of {self.every_n} frames)")
        return True

    def _release(self) -> None:
        """Close the video and the window. Safe to call more than once."""
        if self.cap is not None:
            self.cap.release()
            self.cap = None
        if self.show:
            cv2.destroyAllWindows()

    @staticmethod
    def _resize(frame):
        """Make the frame smaller to PROCESS_WIDTH, keeping its shape."""
        if config.PROCESS_WIDTH is None:
            return frame
        h, w = frame.shape[:2]
        if w <= config.PROCESS_WIDTH:
            return frame
        scale = config.PROCESS_WIDTH / w
        return cv2.resize(frame, (config.PROCESS_WIDTH, int(h * scale)), interpolation=cv2.INTER_AREA)

    # ----------------------------------------
    # Alerts
    # ----------------------------------------
    @staticmethod
    def _severity(assessment) -> tuple[int, int]:
        """Higher = worse. Compare the level first, then the case priority."""
        return LEVEL_RANK[assessment.level], -PRIORITY.index(assessment.case_id)

    def _should_send(self, assessment, t: float) -> bool:
        """
        Send one alert per crosswalk incident (not per person):
          * no active incident             -> send and start an incident
          * a more severe level or case    -> send (the risk got worse)
          * otherwise                      -> do not send
        The incident ends after INCIDENT_QUIET_SECONDS without risk.
        """
        inc = self._incident
        # End the incident if it has been quiet long enough.
        if inc is not None and (t - inc["last"]) >= config.INCIDENT_QUIET_SECONDS:
            inc = self._incident = None
        severity = self._severity(assessment)
        # Start a new incident.
        if inc is None:
            self._incident = {"severity": severity, "last": t}
            return True
        inc["last"] = t
        # Send again only if the risk got worse.
        if severity > inc["severity"]:
            inc["severity"] = severity
            return True
        return False

    @staticmethod
    def _snapshot(frame) -> str | None:
        # Encode the frame as a JPEG image in base64.
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, config.SNAPSHOT_JPEG_QUALITY])
        return base64.b64encode(buf).decode("ascii") if ok else None

    def _handle_assessments(self, assessments, frame, t: float, frame_index: int) -> None:
        # Keep only risky results for people seen in enough frames.
        risky = [a for a in assessments if a.level is not None
                 and (a.track_id == -1 or a.metadata.get("frames", 0) >= config.MIN_FRAMES_FOR_ALERT)]
        if not risky:
            return
        for a in [max(risky, key=self._severity)]:       # Send at most one alert per frame (the worst).
            if not self._should_send(a, t):
                continue
            # Add an image only for Medium and High alerts.
            snapshot = self._snapshot(frame) if a.level in ("Medium", "High") else None
            event = RiskEvent(assessment=a, crosswalk_id=self.crosswalk_id, camera_id=self.camera_id,
                              video_time=t, frame_index=frame_index, snapshot_base64=snapshot)
            self.events.append(replace(event, snapshot_base64=None))   # Save the event without the image.
            who = "group" if a.track_id == -1 else f"person #{a.track_id}"
            # Print the alert in English (some consoles cannot print Hebrew).
            print(f"[{a.level.upper():6}] t={t:6.2f}s {who}: {a.case_id} {a.reason} "
                  f"(dist={a.metadata.get('distanceToEdgeH', a.metadata.get('minDistanceToEdgeH'))}h, "
                  f"approach={a.metadata.get('approachSpeedHps', '-')}h/s, conf={a.confidence})")
            self.alerts.send(event)          # Returns at once and does not block the loop.

    # ----------------------------------------
    # Drawing (only when show=True)
    # ----------------------------------------
    def _draw(self, frame, tracks, assessments) -> None:
        # Draw the crosswalk zone.
        h, w = frame.shape[:2]
        poly = self.engine.zone.pixel_polygon(w, h).astype(int).reshape((-1, 1, 2))
        overlay = frame.copy()
        cv2.fillPoly(overlay, [poly], (255, 200, 0))
        cv2.addWeighted(overlay, 0.2, frame, 0.8, 0, frame)
        cv2.polylines(frame, [poly], isClosed=True, color=(255, 200, 0), thickness=2)

        # Draw a box for each person, colored by risk level.
        verdict = {a.track_id: a for a in assessments if a.track_id != -1}
        colors = {None: (0, 200, 0), "Low": (0, 200, 200), "Medium": (0, 140, 255), "High": (0, 0, 255)}
        for tr in tracks:
            o = tr.last
            a = verdict.get(tr.track_id)
            color = colors[a.level if a else None]
            cv2.rectangle(frame, (int(o.x1), int(o.y1)), (int(o.x2), int(o.y2)), color, 2)
            caption = f"#{tr.track_id}" + (f" {a.case_id}" if a and a.case_id else "") + (" phone" if o.phone else "")
            cv2.putText(frame, caption, (int(o.x1) + 2, int(o.y1) - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2, cv2.LINE_AA)

        # Show a red banner at the top when there is a Medium or High alert.
        active = [a for a in assessments if a.level in ("Medium", "High")]
        if active:
            worst = max(active, key=lambda a: LEVEL_RANK[a.level])
            banner = f"ALERT: {worst.level.upper()} - {worst.case_id}"
            cv2.rectangle(frame, (0, 0), (w, 34), (0, 0, 255), -1)
            cv2.putText(frame, banner, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)

    # ----------------------------------------
    # Process One Frame
    # ----------------------------------------
    def _process_frame(self, frame, t: float, frame_index: int):
        """Detect, track, and classify one frame, then send any new alerts."""
        h, w = frame.shape[:2]
        tracks_now, _phones = self.tracker.process(t, frame)
        assessments = self.engine.evaluate(
            tracks_now, t, w, h,
            all_live_tracks=self.tracker.live_tracks,
            recently_died_near=self.tracker.recently_died_near,
        )
        self._handle_assessments(assessments, frame, t, frame_index)
        if self.show:
            self._draw(frame, tracks_now, assessments)
        return assessments

    # ----------------------------------------
    # Main Loop
    # ----------------------------------------
    def run(self) -> dict:
        """Process the whole video and return a summary."""
        if not self._open():
            return {"error": f"could not open {self.source!r}"}

        self.alerts.start()
        started = time.monotonic()
        live = isinstance(self.source, int)                    # A webcam gives frames in real time.
        frame_index = -1
        try:
            while True:
                ok, frame = self.cap.read()
                if not ok:
                    print("[INFO] No more frames (end of video or camera drop).")
                    break
                frame_index += 1
                self.frames_read += 1
                if frame_index % self.every_n:
                    continue                                   # Skip frames to save CPU.

                # Video file: time = frame / fps.
                # Webcam: use the real clock time.
                t = (time.monotonic() - started) if live else frame_index / self.fps
                frame = self._resize(frame)
                self._process_frame(frame, t, frame_index)
                self.frames_analysed += 1

                if self.show:
                    # Make only the displayed frame smaller so it fits the screen.
                    disp = frame
                    max_h = getattr(config, "SHOW_MAX_HEIGHT", None)
                    if max_h and disp.shape[0] > max_h:
                        scale = max_h / disp.shape[0]
                        disp = cv2.resize(disp, (int(disp.shape[1] * scale), max_h), interpolation=cv2.INTER_AREA)
                    cv2.imshow(config.WINDOW_NAME, disp)
                    # Stop when the user presses 'q'.
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        print("[INFO] 'q' pressed - shutting down.")
                        break
        except KeyboardInterrupt:
            print("\n[INFO] Interrupted by user (Ctrl+C).")
        finally:
            # Always send the queued alerts and close the video.
            self.alerts.stop()
            self._release()
        return self.summary(time.monotonic() - started)

    # ----------------------------------------
    # Summary
    # ----------------------------------------
    def summary(self, elapsed: float = 0.0) -> dict:
        # Count the alerts by case and by level.
        by_case = Counter(e.assessment.case_id for e in self.events)
        by_level = Counter(e.assessment.level for e in self.events)
        return {
            "source": str(self.source),
            "framesRead": self.frames_read,
            "framesAnalysed": self.frames_analysed,
            "elapsedSec": round(elapsed, 1),
            "alerts": len(self.events),
            "byLevel": dict(by_level),
            "byCase": dict(by_case),
            "events": [
                {"t": round(e.video_time, 2), "track": e.assessment.track_id, "case": e.assessment.case_id,
                 "level": e.assessment.level, "confidence": e.assessment.confidence,
                 "personType": e.assessment.person_type, "distracted": e.assessment.distracted}
                for e in self.events
            ],
        }
