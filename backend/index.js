// PROVENANCE: [RACHE] your entry (http+socket.io+change-stream). [LIEL] added Yossef's detect mount (/api/detect) for Sprint 4 point 1.
/* ============================================================
 * SANDBOX FILE - PENDING MERGE (the hard one). This is YOUR index.js (http server + Socket.io + change stream + your routes + userRoutes). Yossef's index.js also starts the Python process on boot and mounts his routes. The Python process is NOT started here (the AI service runs on its own: see ai-service/README.md); only the mount line was added.
 * ============================================================ */

/**
 * index.js
 * --------
 * Application entry point for the Smart Crosswalk backend.
 * Responsibilities:
 *   1. Start an HTTP server that hosts both the REST API and Socket.io.
 *   2. Connect to MongoDB, then start the change-stream live feed.
 *   3. Mount the REST routes (alerts, crosswalks, cameras, leds, users).
 *
 * Data flow: AI node -> POST /api/alerts -> saved in DB -> change stream ->
 * Socket.io "newAlert" -> frontend updates live.
 */
import 'dotenv/config';                                  // load .env BEFORE any module reads process.env
import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';                 // DB connection helper
import alertRoutes from './routes/alertRoutes.js';
import crosswalkRoutes from './routes/crosswalkRoutes.js';
import cameraRoutes from './routes/cameraRoutes.js';
import ledRoutes from './routes/ledRoutes.js';
import userRoutes from './routes/userRoutes.js';        // auth (from yosi-B1)
import detectRoutes from './routes/detectRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js'; // Manager dashboard stats    // AI service bridge (single image)
import { initSocket, watchAlerts } from './config/socket.js';

dotenv.config();
const app = express();

// Wrap Express in an HTTP server so Socket.io can share the same port.
const server = http.createServer(app);

// Initialize Socket.io before we start listening for DB changes.
initSocket(server);

// Connect to the database, then start the live change-stream feed.
connectDB().then(() => {
    watchAlerts();
});

const PORT = process.env.PORT || 3000;

// Middleware
// Dev: any origin. Prod: set FRONTEND_URL in the env to lock it to the frontend origin.
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '10mb' })); // parse JSON bodies; 10mb so base64 images fit

// REST routes
app.use('/api/alerts', alertRoutes);
app.use('/api/crosswalks', crosswalkRoutes);
app.use('/api/cameras', cameraRoutes);
app.use('/api/leds', ledRoutes);
app.use('/api/users', userRoutes);        // login + Admin user management
app.use('/api/analytics', analyticsRoutes);  // GET /dashboard?filter=top5|school|all
app.use('/api/detect', detectRoutes);     // POST /  (one image -> detections), Yossef's route, was never mounted

// Start listening
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
