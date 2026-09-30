# AI service — detection + video risk analysis

Python side of the Smart Crosswalk backend. Two ways to use it:

| Entry point | What it does | Sprint |
|---|---|---|
| `app.py` | FastAPI server: `GET /` health, `POST /detect {imagePath}` -> YOLO detections for ONE image | 4 (Yossef) |
| `main.py` | Analyse a **video file**: YOLO per frame -> track each person -> classify into one of the 12 agreed risk cases -> POST the alert to the Node backend | 4 point 1 (Liel) |

## Setup (once)

```bash
cd backend/ai-service
python -m venv venv
venv\Scripts\activate            # Windows   (macOS/Linux: source venv/bin/activate)
pip install -r requirements.txt  # ultralytics pulls PyTorch (~2 GB)
python verify_setup.py --no-window
```

## Analyse a video

```bash
python main.py --source samples/clip1.mp4            # analyse + POST alerts to http://localhost:3000/api/alerts
python main.py --source samples/clip1.mp4 --no-api   # analyse only, print verdicts + JSON summary
python main.py --source samples/clip1.mp4 --show     # also open a window (boxes + edge zone), 'q' quits
python main.py --source 0                            # webcam
python main.py --source clip.mp4 --every 2 --crosswalk cw_002 --camera cam_201 --tracker yolo
```

Flags: `--every N` analyse 1 of N frames, `--crosswalk` / `--camera` ids stored on the alerts,
`--tracker simple|yolo`, `--show`, `--no-api`.

The Node backend (`npm start` in `backend/`) must be running for alerts to be saved; the
Python side never blocks on the network (background sender, Rachel's Sprint 3 design).

## How the video pipeline works

```
video ──> frame (1 of every N) ──> detector.py (YOLOv8) ──> tracker.py ──> risk_rules.py ──> alert_sender.py ──> POST /api/alerts
                                    persons, phones          who is who     which of the 12 cases   Rachel's createAlert:
                                                             across frames  Low / Medium / High     Cloudinary, MongoDB, Socket.io
```

| File | Role |
|---|---|
| `config.py` | every tunable number, with comments (video, tracking, rule thresholds, backend URL) |
| `detector.py` | Rachel + Yossef's merged YOLO wrapper, unchanged |
| `tracker.py` | stable person ids across frames (`SimpleTracker`, or ultralytics ByteTrack with `--tracker yolo`) |
| `risk_rules.py` | the brain: distance to the edge zone, speed, direction, phone, child -> 12 cases |
| `alert_sender.py` | background POST with Rachel's alert schema; retries once without the image |
| `video_processor.py` | the loop (restored from Rachel's Sprint 3 and adapted) |
| `main.py` | CLI |

Units inside the rules: distances in **body heights (h)**, speeds in **h/s**, so the same
thresholds work at any resolution and distance from the camera. Metres are only sent when
`config.METERS_PER_H` is calibrated for the camera; until then those fields are `null`.

The edge zone is `config.ROI_POLYGON_NORM` (Rachel's polygon). It must be adjusted per camera.

## Tests (no YOLO needed)

```bash
venv\Scripts\python -m unittest discover -s tests -t . -v
```

One test per risk case, tracker behaviour, and a synthetic video end-to-end with a
colour-based stand-in for YOLO. Python 3.10+.
