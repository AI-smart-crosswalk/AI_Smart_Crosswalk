/*
========================================
Alert Service

This file handles alert operations.
It creates, retrieves, and updates
alerts in the SmartWalk system.
========================================
*/

import Alert from '../models/alert.js';
import { uploadImage } from './cloudinaryService.js';

/*
========================================
Create Alert
========================================
*/
export const createAlert = async (alertData) => {
    const { imageBase64, ...rest } = alertData;
    let imageUrl = rest.imageUrl;

    // Upload the image to Cloudinary and keep only its URL.
    if (imageBase64) {
        imageUrl = await uploadImage(imageBase64);
    }

    // Save the new alert in the database.
    const newAlert = new Alert({ ...rest, imageUrl });
    return await newAlert.save();
};

/*
========================================
Get All Alerts
========================================
*/
export const fetchAllAlerts = async () => {
    // Return all alerts, newest first.
    return await Alert.find().sort({ timestamp: -1 });
};

/*
========================================
Update Alert

Updates only the fields that were sent.
The server sets resolvedAt by itself:
- When an alert becomes resolved, resolvedAt = now.
- When an alert is reopened, resolvedAt = null.
Returns { alert, justResolved }.
========================================
*/
export const updateAlert = async (id, updates) => {
    // Ignore resolvedAt if the client sent it.
    const { resolvedAt, ...changes } = updates;

    // Find the alert in the database.
    const before = await Alert.findById(id).select('isResolved');
    // Return an empty result if the alert was not found.
    if (!before) return { alert: null, justResolved: false };

    // Check if the alert is being resolved right now.
    const justResolved = changes.isResolved === true && !before.isResolved;
    if (justResolved) changes.resolvedAt = new Date();
    if (changes.isResolved === false) changes.resolvedAt = null;

    const alert = await Alert.findByIdAndUpdate(id, changes, {
        returnDocument: 'after', // Return the updated alert.
        runValidators: true,     // Check the values against the schema.
    });
    return { alert, justResolved };
};
