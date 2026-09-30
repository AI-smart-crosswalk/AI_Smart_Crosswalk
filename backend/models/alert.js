/*
========================================
Alert Model

This model represents a safety alert in the
SmartWalk system. The AI service sends an alert
when it detects a dangerous situation at a
crosswalk. The alert is saved in the database
and sent live to the frontend dashboard.

It stores:
- where the danger happened (crosswalk, camera, location)
- the danger data from the AI (distance, speed,
  confidence, person type, distraction, severity)
- whether the road LEDs were turned on
- the snapshot image, handling status, and time

Relationships:
- Alert -> Crosswalk (crosswalkId)
- Alert -> Camera (cameraId)
========================================
*/
import mongoose from 'mongoose';

/*
========================================
Alert Schema
========================================
*/
const alertSchema = new mongoose.Schema({
    // ----------------------------------------
    // Identity and Source
    // ----------------------------------------

    // Unique event id (UUID) created by the AI service.
    // Indexed so duplicate events can be found quickly.
    eventId: { type: String, index: true },

    // The crosswalk where the danger was detected (Alert -> Crosswalk).
    // Stores the crosswalk's _id as text, e.g. "66f1a0000000000000000001".
    // It is a plain String (not a Mongoose ref), so ids are compared as strings.
    crosswalkId: { type: String, required: true },

    // The camera that triggered the alert (Alert -> Camera).
    // Stores the camera's _id as text, e.g. "66f1b0000000000000000001".
    cameraId: { type: String, required: true },

    // Street address, e.g. "הרצל 45, חולון".
    location: { type: String },

    // Area / zone code, e.g. "area_holon_01".
    areaId: { type: String },

    // Area name, e.g. "מרכז העיר".
    areaName: { type: String },

    // ----------------------------------------
    // Danger Data (sent by the AI)
    // ----------------------------------------

    // Short readable summary of the event (case id and case name).
    description: { type: String },

    // Distance from the crossing in meters (approach distance).
    // null when the camera is not calibrated to meters.
    distanceFromCrosswalk: { type: Number, default: null },

    // Speed toward the crossing in m/s (optional).
    approachSpeed: { type: Number },

    // 0-100: how confident the AI is that the case is dangerous.
    confidence: { type: Number },

    // Who caused the alert:
    // child, adult, wheeled (bicycle / motorcycle), or unknown.
    personType: { type: String, enum: ['child', 'adult', 'wheeled', 'unknown'], default: null },

    // true if the person was distracted, e.g. looking at a phone.
    distracted: { type: Boolean, default: false },

    // Danger level of the alert. Only these three values are allowed.
    severity: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Low' },

    // ----------------------------------------
    // Two-Threshold Model
    // ----------------------------------------

    // true only for emergencies that actually turned on the road LEDs
    // (Medium / High). Low alerts are saved only, without LEDs.
    ledTriggered: { type: Boolean, default: false },

    // ----------------------------------------
    // Evidence and Status
    // ----------------------------------------

    // Cloudinary URL of the snapshot image (null if there is no image).
    imageUrl: { type: String, default: null },

    // true after an operator has handled the alert.
    isResolved: { type: Boolean, default: false },

    // Time the alert was resolved. Set by the server (not the client)
    // when isResolved becomes true. Used for response-time statistics.
    resolvedAt: { type: Date, default: null },

    // Time the event happened (defaults to the time the alert was created).
    timestamp: { type: Date, default: Date.now }
});

// Create the Alert model from the schema.
const Alert = mongoose.model('Alert', alertSchema);
export default Alert;
