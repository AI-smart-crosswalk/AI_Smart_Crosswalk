/*
========================================
Camera Model

This model represents a camera mounted at a
crosswalk in the SmartWalk system. It stores
the camera name, health status, IP address,
camera type, the crosswalk it belongs to,
and the last update time.

The structure matches what the frontend Admin
page sends (infrastructure management).

Relationships:
- Camera -> Crosswalk (junctionId)
- Alert -> Camera (an alert's cameraId holds a camera _id)
========================================
*/
import mongoose from "mongoose";
// Shared list of allowed statuses for crosswalks, cameras, and LEDs.
import { INFRA_STATUSES } from "./crosswalk.js";

/*
========================================
Camera Schema
========================================
*/
const cameraSchema = new mongoose.Schema({
    // Camera description / name.
    name: { type: String, required: true },

    // Camera health: 'active', 'error', or 'suspended' (default 'active').
    status: { type: String, enum: INFRA_STATUSES, default: 'active' },

    // Camera IP address, e.g. "192.168.1.10".
    ip: { type: String, default: '' },

    // Camera type, e.g. "LPR (זיהוי לוחיות)" | "PTZ (ממונעת)" | "Thermal (תרמית)".
    type: { type: String, default: '' },

    // The crosswalk this camera belongs to (Camera -> Crosswalk).
    // Holds the crosswalk's _id and references the Crosswalk model.
    junctionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Crosswalk', required: true },

    // Last time the camera was changed (refreshed on every update).
    lastUpdated: { type: Date, default: Date.now },
});

// Create the Camera model from the schema.
const Camera = mongoose.model("Camera", cameraSchema);
export default Camera;
