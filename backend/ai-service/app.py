"""
========================================
AI Service API

This file runs the HTTP server of the AI service.
It receives an image path and returns
the objects detected in the image.

Run: uvicorn app:app --port 8000
========================================
"""

import os                                          

from fastapi import FastAPI, HTTPException          
from pydantic import BaseModel                      

from detector import detect

app = FastAPI()                                     


# ========================================
# Request Body
# ========================================
# The client sends only the image path.
class DetectRequest(BaseModel):
    imagePath: str


# ========================================
# Health Check
# ========================================
@app.get("/")
def health_check():
    return {"status": "running"}


# ========================================
# Detect Objects
# ========================================
@app.post("/detect")
def detect_endpoint(request: DetectRequest):
    # Return an error if the image file does not exist.
    if not os.path.exists(request.imagePath):       
        raise HTTPException(status_code=400, detail="Image file not found")
    try:
        return detect(request.imagePath)            # Run the detector on the image.
    except Exception as exc:                        
        raise HTTPException(status_code=500, detail=str(exc))


# Start the server when the file is run directly.
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
