/*
========================================
Cloudinary Service

This file uploads alert images to Cloudinary
and returns the hosted image URL.
========================================
*/

import cloudinary from '../config/cloudinary.js';

/*
========================================
Upload Image
========================================
*/
export const uploadImage = async (image) => {
    // Add the data URI prefix if the image is a plain base64 string.
    const dataUri = image.startsWith('data:')
        ? image
        : `data:image/jpeg;base64,${image}`;

    // Upload the image to the alerts folder.
    const result = await cloudinary.uploader.upload(dataUri, {
        folder: 'crosswalk_alerts',
    });
    return result.secure_url;
};
