/*
========================================
Camera Service

This file handles camera operations.
It creates, retrieves, updates,
and deletes cameras in the SmartWalk system.
========================================
*/

import Camera from '../models/camera.js';

/*
========================================
Create Camera
========================================
*/
export const createCamera = async (cameraData) => {
    // Save the new camera in the database.
    const newCamera = new Camera(cameraData);
    return await newCamera.save();
};

/*
========================================
Get All Cameras
========================================
*/
export const fetchAllCameras = async () => {
    return await Camera.find();
};

/*
========================================
Get Cameras By Crosswalk
========================================
*/
export const fetchCamerasByJunction = async (junctionId) => {
    // junctionId is the _id of the crosswalk.
    return await Camera.find({ junctionId });
};

/*
========================================
Update Camera
========================================
*/
export const updateCamera = async (id, updates) => {
    // Update the sent fields and refresh lastUpdated.
    // Returns null if the camera was not found.
    return await Camera.findByIdAndUpdate(
        id,
        { ...updates, lastUpdated: Date.now() },
        { returnDocument: 'after', runValidators: true }
    );
};

/*
========================================
Delete Camera
========================================
*/
export const deleteCamera = async (id) => {
    // Delete the selected camera.
    // Returns null if the camera was not found.
    return await Camera.findByIdAndDelete(id);
};