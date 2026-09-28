/**
 * models/camera.js
 * ----------------
 * Mongoose schema for a camera mounted at a crosswalk.
 * Matches the structure the frontend Admin page sends (infra management).
 */
import mongoose from "mongoose";
import { INFRA_STATUSES } from "./crosswalk.js";

const cameraSchema = new mongoose.Schema({
    name: { type: String, required: true },                                   // camera description
    status: { type: String, enum: INFRA_STATUSES, default: 'active' },        // camera health
    ip: { type: String, default: '' },                                         // e.g. "192.168.1.10"
    type: { type: String, default: '' },                                       // "LPR (זיהוי לוחיות)" | "PTZ (ממונעת)" | "Thermal (תרמית)"
    junctionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Crosswalk', required: true }, // the crosswalk it belongs to
    lastUpdated: { type: Date, default: Date.now },                            // last time it changed
});

const Camera = mongoose.model("Camera", cameraSchema);
export default Camera;
