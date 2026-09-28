// PROVENANCE: [RACHE] your service (Cloudinary + DB).
/* ============================================================
 * SANDBOX FILE - SETTLED. Copied UNCHANGED from your real repo (branch sprint4-rache).
 * ============================================================ */

/**
 * services/alertService.js
 * ------------------------
 * Handles alerts: save a new one (uploads the image to Cloudinary first)
 * and get all alerts from the database.
 */

import Alert from '../models/alert.js';
import { uploadImage } from './cloudinaryService.js';

// Save a new alert. If a base64 image was sent, upload it to Cloudinary first
// and store only the returned URL in the DB.
export const createAlert = async (alertData) => {
    const { imageBase64, ...rest } = alertData;
    let imageUrl = rest.imageUrl;

    if (imageBase64) {
        imageUrl = await uploadImage(imageBase64);
    }

    const newAlert = new Alert({ ...rest, imageUrl });
    return await newAlert.save();
};

// Fetch all alerts (newest first).
export const fetchAllAlerts = async () => {
    return await Alert.find().sort({ timestamp: -1 });
};

// Update an alert by id (e.g. an operator marks it resolved).
// Partial update: only the fields sent in the body are changed.
// resolvedAt is managed by the server (never taken from the client):
//   isResolved false -> true : resolvedAt = now   (used for avgResponseTime)
//   isResolved -> false      : resolvedAt = null
// Returns { alert, justResolved } - alert is null if the id was not found;
// justResolved is true only on the false -> true transition (socket "alert_resolved").
export const updateAlert = async (id, updates) => {
    const { resolvedAt, ...changes } = updates;   // ignore a client-sent resolvedAt

    const before = await Alert.findById(id).select('isResolved');
    if (!before) return { alert: null, justResolved: false };

    const justResolved = changes.isResolved === true && !before.isResolved;
    if (justResolved) changes.resolvedAt = new Date();
    if (changes.isResolved === false) changes.resolvedAt = null;

    const alert = await Alert.findByIdAndUpdate(id, changes, {
        returnDocument: 'after', // return the document after the update
        runValidators: true,     // enforce schema enums (e.g. severity)
    });
    return { alert, justResolved };
};
