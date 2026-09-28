/* ============================================================
 * SANDBOX - backend route that forwards an image to the AI service.
 * PROVENANCE: structure = YOSSEF's routes (express.Router + service handler).
 *             [CHANGED] protected by x-api-key (sensor call, no user JWT).
 *   POST /api/detect  { imagePath }  -> detections
 * ============================================================ */
import express from "express";                              
import detectService from "../services/detectService.js";
import apiKey from "../middleware/apiKeyMiddleware.js";   // sensor/AI call, no user JWT   

const router = express.Router();                            


router.post("/", apiKey, detectService.detectObjects);             

export default router;                                      
