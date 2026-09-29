"""
========================================
Alert Sender

This file sends risk alerts to the backend.
Alerts are sent from a background thread,
so the video loop never waits for the network.
========================================
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


# ========================================
# Risk Event
# ========================================
@dataclass
class RiskEvent:
    """A risk result to report, with the data the backend needs."""
    assessment: Assessment
    crosswalk_id: str
    camera_id: str
    video_time: float                      # Seconds from the start of the video.
    frame_index: int
    snapshot_base64: str | None = None     # JPEG image of the frame.
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


# ========================================
# Build Alert Payload
# ========================================
def build_payload(event: RiskEvent, include_image: bool = True) -> dict:
    """Convert a RiskEvent to the alert format of the backend."""
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
        # Use meters only if the camera is calibrated, otherwise send null.
        "distanceFromCrosswalk": round(dist_h * meters, 2) if (meters and dist_h is not None) else None,
        "approachSpeed": round(speed_h * meters, 2) if (meters and speed_h is not None) else None,
        "ledTriggered": a.danger,          # Low = log only, Medium/High = turn on LEDs.
        "timestamp": event.created_at.isoformat(),
    }
    # Add the image only if requested and available.
    if include_image and event.snapshot_base64:
        payload["imageBase64"] = event.snapshot_base64
    return payload


# ========================================
# Alert Sender
# ========================================
class AlertSender:
    """Sends risk events to the backend in a background thread."""

    _STOP = object()

    def __init__(self, url: str = config.API_URL, timeout: float = config.API_TIMEOUT_SECONDS,
                 max_queue: int = 100):
        self.url = url
        self.timeout = timeout
        self._queue: "queue.Queue" = queue.Queue(maxsize=max_queue)
        self._worker: threading.Thread | None = None
        self._session = requests.Session()
        # The backend requires an API key to accept alerts.
        if config.SENSOR_API_KEY:
            self._session.headers["x-api-key"] = config.SENSOR_API_KEY
        else:
            print("[WARN] SENSOR_API_KEY is not set - the backend will reject alerts (401).")
        self.delivered = 0
        self.failed = 0

    # ----------------------------------------
    # Start and Stop
    # ----------------------------------------
    def start(self) -> None:
        # Do nothing if the worker thread is already running.
        if self._worker and self._worker.is_alive():
            return
        self._worker = threading.Thread(target=self._run, name="AlertWorker", daemon=True)
        self._worker.start()
        print(f"[INFO] AlertSender started -> {self.url}")

    def stop(self, drain: bool = True) -> None:
        if not self._worker:
            return
        if drain:
            self._queue.put(self._STOP)          # Send the queued alerts before stopping.
        self._worker.join(timeout=self.timeout * 3 + 1)
        self._session.close()
        print(f"[INFO] AlertSender stopped (delivered={self.delivered}, failed={self.failed}).")

    # ----------------------------------------
    # Send Alert
    # ----------------------------------------
    def send(self, event: RiskEvent) -> None:
        """Add the event to the queue. If the queue is full, drop it instead of waiting."""
        try:
            self._queue.put_nowait(event)
        except queue.Full:
            print("[WARN] Alert queue full - dropping event (backend slow/down?).")

    # ----------------------------------------
    # Background Worker
    # ----------------------------------------
    def _run(self) -> None:
        # Take events from the queue and send them one by one.
        while True:
            item = self._queue.get()
            try:
                if item is self._STOP:
                    return
                self._post(item)
            except Exception as exc:                       # Keep the worker running after an error.
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
                # If the image upload failed, send the alert again without the image.
                print(f"[WARN] Backend rejected alert with image ({resp.status_code}): {resp.text[:160]} "
                      f"-> retrying without image")
                resp = self._session.post(self.url, json=build_payload(event, include_image=False),
                                          timeout=self.timeout)
            # Count the result as delivered or failed.
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


# ========================================
# Null Alert Sender
# ========================================
class NullAlertSender:
    """Does not use the network. Saves every event so tests can check them."""

    def __init__(self):
        self.sent: list[RiskEvent] = []

    def start(self) -> None: ...
    def stop(self, drain: bool = True) -> None: ...

    def send(self, event: RiskEvent) -> None:
        self.sent.append(event)


# ========================================
# Build Alert Sender
# ========================================
def build_alert_sender(enabled: bool | None = None):
    """Return a real sender if the API is enabled, otherwise a NullAlertSender."""
    enabled = config.API_ENABLED if enabled is None else enabled
    return AlertSender() if enabled else NullAlertSender()
