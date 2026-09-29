/*
========================================
LED Service

This file handles LED operations.
It creates, retrieves, and updates
LEDs in the SmartWalk system.
========================================
*/

import LED from '../models/led.js';

/*
========================================
Create LED
========================================
*/
export const createLed = async (ledData) => {
    // Save the new LED in the database.
    const newLed = new LED(ledData);
    return await newLed.save();
};

/*
========================================
Get All LEDs
========================================
*/
export const fetchAllLeds = async () => {
    return await LED.find();
};

/*
========================================
Get LEDs By Crosswalk
========================================
*/
export const fetchLedsByJunction = async (junctionId) => {
    // junctionId is the _id of the crosswalk.
    return await LED.find({ junctionId });
};

/*
========================================
Update LED
========================================
*/
export const updateLed = async (id, updates) => {
    // Update the sent fields and refresh lastUpdated.
    // Returns null if the LED was not found.
    return await LED.findByIdAndUpdate(
        id,
        { ...updates, lastUpdated: Date.now() },
        { returnDocument: 'after', runValidators: true }
    );
};
