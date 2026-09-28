# PROVENANCE: [RACHE] Sprint 3 vision/alert_service.py (queue + background thread + payload builder),
#             restored from git history (branch feat/api-founation).
#             [LIEL] adapted: payload = Rachel's Sprint 4 alert schema (models/alert.js), URL = port 3000,
#             snapshot as imageBase64, retry once WITHOUT the image if the backend rejects (so a
#             Cloudinary problem never loses a safety event), NullAlertSender records events for tests.
"""
alert_sender.py
---------------
Background POST sender: the video loop must never wait for the network.
  sender.send(event)  -> returns immediately (queued)
  a daemon thread     -> POSTs to config.API_URL (Rachel's POST /api/alerts, which uploads the
                         image to Cloudinary, saves to MongoDB and pushes to the dashboard live)
"""
from __future__ import annotations

import queue
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

import requests

import config
from risk_rules import Assessment


@dataclass
class RiskEvent:
    """A verdict worth reporting, with the context the backend needs."""
    assessment: Assessment
    crosswalk_id: str
    camera_id: str
    video_time: float                      # seconds into the video
    frame_index: int
    snapshot_base64: str | None = None     # JPEG of the analysed frame
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


def build_payload(event: RiskEvent, include_image: bool = True) -> dict:
    """Map a RiskEvent onto Rachel's alert schema (backend/models/alert.js)."""
    a = event.assessment
    meters = config.METERS_PER_H
    dist_h = a.metadata.get("distanceToEdgeH")
    speed_h = a.metadata.get("approachSpeedHps")
    payload = {
        "eventId": event.event_id,
        "crosswalkId": event.crosswalk_id,
        "cameraId": event.camera_id,
        "description": f"{a.case_id} · {a.case_name}",
        "severity": a.level,
        "confidence": a.confidence,
        "personType": a.person_type,
        "distracted": a.distracted,
        # metres only when the camera is calibrated; otherwise null (never invent numbers)
        "distanceFromCrosswalk": round(dist_h * meters, 2) if (meters and dist_h is not None) else None,
        "approachSpeed": round(speed_h * meters, 2) if (meters and speed_h is not None) else None,
        "ledTriggered": a.danger,          # two thresholds: Low = log only, Medium/High = LEDs
        "timestamp": event.created_at.isoformat(),
    }
    if include_image and event.snapshot_base64:
        payload["imageBase64"] = event.snapshot_base64
    return payload


class AlertSender:
    """Background POST sender for risk events (Rachel's AlertService, adapted)."""

    _STOP = object()

    def __init__(self, url: str = config.API_URL, timeout: float = config.API_TIMEOUT_SECONDS,
                 max_queue: int = 100):
        self.url = url
        self.timeout = timeout
        self._queue: "queue.Queue" = queue.Queue(maxsize=max_queue)
        self._worker: threading.Thread | None = None
        self._session = requests.Session()
        if config.SENSOR_API_KEY:                  # backend protects POST /api/alerts with x-api-key
            self._session.headers["x-api-key"] = config.SENSOR_API_KEY
        else:
            print("[WARN] SENSOR_API_KEY is not set - the backend will reject alerts (401).")
        self.delivered = 0
        self.failed = 0

    # --- Lifecycle --------------------------------------------------------
    def start(self) -> None:
        if self._worker and self._worker.is_alive():
            return
        self._worker = threading.Thread(target=self._run, name="AlertWorker", daemon=True)
        self._worker.start()
        print(f"[INFO] AlertSender started -> {self.url}")

    def stop(self, drain: bool = True) -> None:
        if not self._worker:
            return
        if drain:
            self._queue.put(self._STOP)          # let queued alerts flush first
        self._worker.join(timeout=self.timeout * 3 + 1)
        self._session.close()
        print(f"[INFO] AlertSender stopped (delivered={self.delivered}, failed={self.failed}).")

    # --- Public API -------------------------------------------------------
    def send(self, event: RiskEvent) -> None:
        """Enqueue for asynchronous delivery. If the backend is backed up, drop rather than block."""
        try:
            self._queue.put_nowait(event)
        except queue.Full:
            print("[WARN] Alert queue full - dropping event (backend slow/down?).")

    # --- Internals --------------------------------------------------------
    def _run(self) -> None:
        while True:
            item = self._queue.get()
            try:
                if item is self._STOP:
                    return
                self._post(item)
            except Exception as exc:                       # never let one bad response kill the worker
                self.failed += 1
                print(f"[WARN] Alert worker error: {exc!r}")
            finally:
                self._queue.task_done()

    def _post(self, event: RiskEvent) -> None:
        a = event.assessment
        label = f"{a.level} {a.case_id} track={a.track_id} t={event.video_time:.1f}s"
        try:
            resp = self._session.post(self.url, json=build_payload(event), timeout=self.timeout)
            if resp.status_code >= 400 and event.snapshot_base64:
                # e.g. Cloudinary not configured on the backend: keep the EVENT, drop the image.
                print(f"[WARN] Backend rejected alert with image ({resp.status_code}): {resp.text[:160]} "
                      f"-> retrying without image")
                resp = self._session.post(self.url, json=build_payload(event, include_image=False),
                                          timeout=self.timeout)
            if resp.status_code >= 400:
                self.failed += 1
                print(f"[WARN] Backend rejected alert ({resp.status_code}): {resp.text[:200]}")
            else:
                self.delivered += 1
                print(f"[INFO] Alert delivered ({resp.status_code}): {label}")
        except requests.exceptions.ConnectionError:
            self.failed += 1
            print("[WARN] Alert failed: backend unreachable (is `npm start` running?).")
        except requests.exceptions.Timeout:
            self.failed += 1
            print(f"[WARN] Alert failed: request timed out after {self.timeout}s.")
        except requests.exceptions.RequestException as exc:
            self.failed += 1
            print(f"[WARN] Alert failed: {exc}")


class NullAlertSender:
    """No network. Records every event so tests and `--no-api` runs can inspect them."""

    def __init__(self):
        self.sent: list[RiskEvent] = []

    def start(self) -> None: ...
    def stop(self, drain: bool = True) -> None: ...

    def send(self, event: RiskEvent) -> None:
        self.sent.append(event)


def build_alert_sender(enabled: bool | None = None):
    """Factory: real sender if API is enabled, otherwise a recorder."""
    enabled = config.API_ENABLED if enabled is None else enabled
    return AlertSender() if enabled else NullAlertSender()
