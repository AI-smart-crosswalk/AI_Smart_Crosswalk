// PROVENANCE: [RACHE] your model.
/* ============================================================
 * SANDBOX FILE - SETTLED. Copied UNCHANGED from your real repo (branch sprint4-rache).
 * ============================================================ */

/**
 * models/alert.js
 * ---------------
 * Mongoose schema for a safety alert produced by the AI "brain".
 * This is the core Sprint 4 object: the AI POSTs one of these when it detects
 * a dangerous situation; it is saved here and pushed live to the frontend.
 * Fields cover both the dummy-data shape (for the frontend) and the richer
 * data coming from the AI (distance, confidence, person type, etc.).
 */
import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema({
    // --- Identity / source ---
    eventId: { type: String, index: true },        // UUID from the AI node, for de-duplication
    crosswalkId: { type: String, required: true }, // crosswalk code, e.g. "cw_001"
    cameraId: { type: String, required: true },    // camera that triggered the alert, e.g. "cam_101"
    location: { type: String },                    // street address, e.g. "הרצל 45, חולון"
    areaId: { type: String },                      // area/zone code, e.g. "area_holon_01"
    areaName: { type: String },                    // area name, e.g. "מרכז העיר"

    // --- Danger data (from the AI) ---
    description: { type: String },                 // human-readable summary of the event
    distanceFromCrosswalk: { type: Number, default: null },       // meters from the crossing (approach distance)
    approachSpeed: { type: Number },               // m/s toward the crossing (optional)
    confidence: { type: Number },                  // 0-100, how confident the case is dangerous
    personType: { type: String, enum: ['child', 'adult', 'wheeled', 'unknown'], default: null }, // wheeled = bicycle/motorcycle (AI sends it)
    distracted: { type: Boolean, default: false }, // e.g. looking at a phone
    severity: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Low' },

    // --- Two-threshold model ---
    // ledTriggered = true only for emergencies that actually lit the road LEDs.
    ledTriggered: { type: Boolean, default: false },

    // --- Evidence / lifecycle ---
    imageUrl: { type: String, default: null },                    // Cloudinary URL of the snapshot
    isResolved: { type: Boolean, default: false }, // has an operator handled it
    resolvedAt: { type: Date, default: null },     // set by the server when isResolved becomes true (response-time stats)
    timestamp: { type: Date, default: Date.now }   // when the event happened
});

const Alert = mongoose.model('Alert', alertSchema);
export default Alert;
