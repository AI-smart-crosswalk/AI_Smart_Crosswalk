"""
========================================
Object Detector

This file runs the YOLO model on an image
and returns the detected objects as simple
dictionaries. The model is loaded only once.
========================================
"""

from ultralytics import YOLO
import config

# Load the model once and reuse it for every image.
model = YOLO(config.MODEL_PATH)


# ========================================
# Detect Objects
# ========================================
def detect(image):
    """
    Run YOLO on one image (path or array) and return a list of detections.
    Each detection is a dict:
        {classId, confidence, x, y, width, height}
    Only allowed classes above the confidence threshold are kept.
    """
    results = model(image, verbose=False)[0]   # One image gives one result.

    detections = []
    for box in results.boxes:
        class_id = int(box.cls[0])
        # Keep only the classes the risk rules need.
        if class_id not in config.TARGET_CLASS_IDS:
            continue

        # Skip detections with low confidence.
        confidence = float(box.conf[0])
        if confidence < config.CONFIDENCE_THRESHOLD:
            continue

        # Convert the box corners to x, y, width, height.
        x1, y1, x2, y2 = (float(v) for v in box.xyxy[0])
        detections.append({
            "classId": class_id,
            "label": results.names[class_id],   # For example "person", "car", "cell phone".
            "confidence": round(confidence, 3),
            "x": x1,
            "y": y1,
            "width": x2 - x1,
            "height": y2 - y1,
        })

    return detections
