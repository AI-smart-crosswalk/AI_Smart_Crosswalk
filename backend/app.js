/**
 * app.js
 * ------
 * Builds the Express app (middleware + REST routes) WITHOUT starting anything.
 * index.js wraps it in an HTTP server + Socket.io and connects the DB;
 * the E2E tests (tests/e2e.test.js) import it the same way.
 */
import express from 'express';
import cors from 'cors';
import alertRoutes from './routes/alertRoutes.js';
import crosswalkRoutes from './routes/crosswalkRoutes.js';
import cameraRoutes from './routes/cameraRoutes.js';
import ledRoutes from './routes/ledRoutes.js';
import userRoutes from './routes/userRoutes.js';        // auth (from yosi-B1)
import detectRoutes from './routes/detectRoutes.js';    // AI service bridge (single image)
import analyticsRoutes from './routes/analyticsRoutes.js'; // Manager dashboard stats

const app = express();

// Dev: any origin. Prod: set FRONTEND_URL in the env to lock it to the frontend origin.
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '10mb' })); // parse JSON bodies; 10mb so base64 images fit

// REST routes
app.use('/api/alerts', alertRoutes);
app.use('/api/crosswalks', crosswalkRoutes);
app.use('/api/cameras', cameraRoutes);
app.use('/api/leds', ledRoutes);
app.use('/api/users', userRoutes);           // login + Admin user management
app.use('/api/analytics', analyticsRoutes);  // GET /dashboard?filter=top5|school|all
app.use('/api/detect', detectRoutes);        // POST / (one image -> detections), sensor only (x-api-key)

export default app;
