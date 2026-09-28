/**
 * index.js
 * --------
 * Application entry point for the Smart Crosswalk backend.
 *   1. Build the Express app (app.js: middleware + REST routes).
 *   2. Wrap it in an HTTP server that also hosts Socket.io.
 *   3. Connect to MongoDB, then start the change-stream live feed.
 *
 * Data flow: AI node -> POST /api/alerts -> saved in DB -> change stream ->
 * Socket.io "newAlert" -> frontend updates live.
 * (The Python AI service runs on its own: see ai-service/README.md.)
 */
import 'dotenv/config';                                  // load .env BEFORE any module reads process.env
import http from 'http';
import app from './app.js';
import connectDB from './config/db.js';
import { initSocket, watchAlerts } from './config/socket.js';

// Wrap Express in an HTTP server so Socket.io can share the same port.
const server = http.createServer(app);

// Initialize Socket.io before we start listening for DB changes.
initSocket(server);

// Connect to the database, then start the live change-stream feed.
connectDB().then(() => {
    watchAlerts();
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
