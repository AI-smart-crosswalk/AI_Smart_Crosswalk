/*
========================================
This file defines the HTTP endpoint
for object detection.

It receives an image path,
forwards the request to the AI service,
and returns the detection results.
========================================
*/

import express from "express";
import detectService from "../services/detectService.js";
import apiKey from "../middleware/apiKeyMiddleware.js";

const router = express.Router();

/*
========================================
Run object detection.

Called by the AI service using
an API Key instead of a JWT.

Returns the detection results.
========================================
*/
router.post("/", apiKey, detectService.detectObjects);

export default router;