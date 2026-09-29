/*
========================================
This middleware protects endpoints
used by external services such as
the AI detection service.

Unlike regular users, these services
do not log in and do not use a JWT.
Instead, they authenticate by sending
an API Key in the request header.

Required header:
x-api-key: <SENSOR_API_KEY>

Used by:
- POST /api/alerts
- POST /api/detect
========================================
*/

import crypto from 'crypto';

const apiKeyMiddleware = (req, res, next) => {

    // Get the expected API Key from the server.
    const expected = process.env.SENSOR_API_KEY;

    // Verify that the API Key is configured.
    if (!expected) {

        // Stop the request if the server key is missing.
        return res.status(500).json({
            message: 'SENSOR_API_KEY is not configured on the server'
        });

    }

    // Get the API Key from the request header.
    const provided = req.headers['x-api-key'];

    // Verify that the request contains an API Key.
    if (!provided) {

        // Return an authentication error.
        return res.status(401).json({
            message: 'API key is required'
        });

    }

    // Convert both keys into buffers.
    const a = Buffer.from(String(provided));
    const b = Buffer.from(expected);

    // Compare both keys securely.
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {

        // Return an authentication error.
        return res.status(401).json({
            message: 'Invalid API key'
        });

    }

    // Continue to the next middleware.
    next();

};

export default apiKeyMiddleware;