/**
 * services/cameraService.js
 * -------------------------
 * Handles cameras: create, get all, get by crosswalk, update.
 */

import Camera from '../models/camera.js';

// Create and save a new camera document (Mongo assigns the _id).
export const createCamera = async (cameraData) => {
    const newCamera = new Camera(cameraData);
    return await newCamera.save();
};

// Return every camera in the DB.
export const fetchAllCameras = async () => {
    return await Camera.find();
};

// Return only the cameras that belong to a given crosswalk (junctionId = crosswalk _id).
export const fetchCamerasByJunction = async (junctionId) => {
    return await Camera.find({ junctionId });
};

// Update a camera by its _id. Partial update; also refreshes lastUpdated.
// Returns null if not found.
export const updateCamera = async (id, updates) => {
    return await Camera.findByIdAndUpdate(
        id,
        { ...updates, lastUpdated: Date.now() },
        { returnDocument: 'after', runValidators: true }
    );
};
