/*
========================================
Crosswalk Service

This file handles crosswalk operations.
It creates, retrieves, and updates
crosswalks in the SmartWalk system.
========================================
*/

import Crosswalk from '../models/crosswalk.js';

/*
========================================
Create Crosswalk
========================================
*/
export const createCrosswalk = async (crosswalkData) => {
    // Save the new crosswalk in the database.
    const newCrosswalk = new Crosswalk(crosswalkData);
    return await newCrosswalk.save();
};

/*
========================================
Get All Crosswalks
========================================
*/
export const fetchAllCrosswalks = async () => {
    return await Crosswalk.find();
};

/*
========================================
Update Crosswalk
========================================
*/
export const updateCrosswalk = async (id, updates) => {
    // Update only the sent fields.
    // Returns null if the crosswalk was not found.
    return await Crosswalk.findByIdAndUpdate(id, updates, {
        returnDocument: 'after',
        runValidators: true,
    });
};


/*
========================================
Delete Crosswalk
========================================
*/
export const deleteCrosswalk = async (id) => {
    // Delete the selected crosswalk.
    // Returns null if the crosswalk was not found.
    return await Crosswalk.findByIdAndDelete(id);
};