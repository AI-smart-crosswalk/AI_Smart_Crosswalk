/**
 * services/crosswalkService.js
 * ----------------------------
 * Handles crosswalks: create, get all, update.
 */

import Crosswalk from '../models/crosswalk.js';

// Create and save a new crosswalk document (Mongo assigns the _id).
export const createCrosswalk = async (crosswalkData) => {
    const newCrosswalk = new Crosswalk(crosswalkData);
    return await newCrosswalk.save();
};

// Return every crosswalk in the DB as a plain array (no filters, no joins).
export const fetchAllCrosswalks = async () => {
    return await Crosswalk.find();
};

// Update a crosswalk by its _id. Partial update: only the fields sent change.
// Returns the updated document, or null if the id was not found.
export const updateCrosswalk = async (id, updates) => {
    return await Crosswalk.findByIdAndUpdate(id, updates, {
        returnDocument: 'after',
        runValidators: true,
    });
};
