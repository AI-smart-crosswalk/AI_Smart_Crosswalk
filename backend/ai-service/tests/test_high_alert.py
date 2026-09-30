import base64
import requests

# Image that will be attached to the simulated alert.
IMAGE_PATH = r"C:\Users\יוסף יוסף\Desktop\תמננה אישה צועדת.png"

# Backend alert endpoint.
API_URL = "http://localhost:3000/api/alerts"

# API key required by the backend.
API_KEY = "smartwalk_sensor_test_key_2026"

# Read the image and convert it to Base64.
with open(IMAGE_PATH, "rb") as image_file:
    image_base64 = base64.b64encode(image_file.read()).decode("utf-8")

# Simulated High-risk AI alert.
payload = {
    "crosswalkId": "66f1a0000000000000000000001",
    "cameraId": "66f1b0000000000000000000001",
    "description": "H6 · ילד מתפרץ לכביש",
    "distanceFromCrosswalk": 0.2,
    "approachSpeed": 2.5,
    "confidence": 95,
    "personType": "child",
    "distracted": False,
    "severity": "High",
    "ledTriggered": True,
    "imageBase64": image_base64
}

# Authentication header required by apiKeyMiddleware.
headers = {
    "x-api-key": API_KEY
}

# Send the simulated alert to the backend.
response = requests.post(
    API_URL,
    json=payload,
    headers=headers,
    timeout=30
)

print("Status:", response.status_code)
print("Response:", response.text)