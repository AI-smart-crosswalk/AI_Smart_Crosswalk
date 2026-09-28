/*
========================================
middleware/apiKeyMiddleware.js
Protects the machine-to-machine endpoints (the sensor / AI service), which are
NOT called by a logged-in user and therefore have no JWT.

The caller must send the header:  x-api-key: <SENSOR_API_KEY from .env>
Used on: POST /api/alerts, POST /api/detect
========================================
*/
import crypto from 'crypto';

const apiKeyMiddleware = (req, res, next) => {
    const expected = process.env.SENSOR_API_KEY;
    if (!expected) {
        // Fail closed: never leave the endpoint open because the key was forgotten.
        return res.status(500).json({ message: 'SENSOR_API_KEY is not configured on the server' });
    }

    const provided = req.headers['x-api-key'];
    if (!provided) {
        return res.status(401).json({ message: 'API key is required' });
    }

    // Constant-time comparison (avoids timing attacks on the key).
    const a = Buffer.from(String(provided));
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(401).json({ message: 'Invalid API key' });
    }

    next();
};

export default apiKeyMiddleware;
