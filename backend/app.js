/*
========================================
Express Application Configuration


This file creates and configures the Express
application. It sets up the middleware and
connects all REST API routes to the backend.
The app is exported without starting the server,
so it can also be used directly by the tests.

Responsibilities:
- Create the Express application.
- Configure CORS.
- Configure JSON request handling.
- Register all REST API routes.
- Export the app without starting the server.

The server itself is started in index.js.
This separation also allows E2E tests
to import the Express app directly.
========================================
*/


// Import Express for creating the backend application.
import express from 'express';

// Import CORS to allow requests from the frontend.
import cors from 'cors';

// Import alert API routes.
import alertRoutes from './routes/alertRoutes.js';

// Import crosswalk API routes.
import crosswalkRoutes from './routes/crosswalkRoutes.js';

// Import camera API routes.
import cameraRoutes from './routes/cameraRoutes.js';

// Import LED API routes.
import ledRoutes from './routes/ledRoutes.js';

// Import authentication and user management routes.
import userRoutes from './routes/userRoutes.js';

// Import routes that communicate with the AI detection service.
import detectRoutes from './routes/detectRoutes.js';

// Import dashboard analytics routes.
import analyticsRoutes from './routes/analyticsRoutes.js';


/*
========================================
Create Express Application
========================================
*/

// Create the Express application.
const app = express();


/*
========================================
Configure Middleware
========================================
*/

// Allow requests from the configured frontend URL.
// During development, all origins are allowed if no URL is configured.
app.use(
    cors({
        origin: process.env.FRONTEND_URL || '*'
    })
);

// Parse incoming JSON request bodies.
// The larger limit allows requests containing image data.
app.use(
    express.json({
        limit: '10mb'
    })
);


/*
========================================
Register REST API Routes
========================================
*/

// Register alert management routes.
app.use(
    '/api/alerts',
    alertRoutes
);

// Register crosswalk management routes.
app.use(
    '/api/crosswalks',
    crosswalkRoutes
);

// Register camera management routes.
app.use(
    '/api/cameras',
    cameraRoutes
);

// Register LED management routes.
app.use(
    '/api/leds',
    ledRoutes
);

// Register login and user management routes.
app.use(
    '/api/users',
    userRoutes
);

// Register dashboard analytics routes.
app.use(
    '/api/analytics',
    analyticsRoutes
);

// Register AI detection routes.
app.use(
    '/api/detect',
    detectRoutes
);


/*
========================================
Export Express Application
========================================
*/

// Export the configured Express application.
// index.js starts it, while tests can import it directly.
export default app;