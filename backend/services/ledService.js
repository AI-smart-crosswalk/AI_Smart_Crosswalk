/**
 * services/ledService.js
 * ----------------------
 * Handles LEDs: create, get all, get by crosswalk, update.
 */

import LED from '../models/led.js';

// Create and save a new LED document (Mongo assigns the _id).
export const createLed = async (ledData) => {
    const newLed = new LED(ledData);
    return await newLed.save();
};

// Return every LED in the DB.
export const fetchAllLeds = async () => {
    return await LED.find();
};

// Return only the LEDs that belong to a given crosswalk (junctionId = crosswalk _id).
export const fetchLedsByJunction = async (junctionId) => {
    return await LED.find({ junctionId });
};

// Update an LED by its _id. Partial update; also refreshes lastUpdated.
// Returns null if not found.
export const updateLed = async (id, updates) => {
    return await LED.findByIdAndUpdate(
        id,
        { ...updates, lastUpdated: Date.now() },
        { returnDocument: 'after', runValidators: true }
    );
};
