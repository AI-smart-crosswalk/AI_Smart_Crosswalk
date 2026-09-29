/*
========================================
This file configures the Cloudinary
SDK used by the project.

It loads the Cloudinary credentials
from the environment variables
and creates a shared Cloudinary
instance used for image uploads.

Used by:
- services/cloudinaryService.js
========================================
*/

import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

// Load the environment variables.
dotenv.config();

// Configure the Cloudinary SDK
// using the credentials from .env.
cloudinary.config({

    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,

});

// Export the configured Cloudinary instance.
export default cloudinary;