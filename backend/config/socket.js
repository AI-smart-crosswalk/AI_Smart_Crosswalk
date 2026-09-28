// PROVENANCE: [RACHE] your code, unchanged.
/* ============================================================
 * SANDBOX FILE - SETTLED. Copied UNCHANGED from your real repo (branch sprint4-rache).
 * ============================================================ */

/**
 * config/socket.js
 * ----------------
 * Sets up Socket.io for real-time updates to the frontend.
 *   - initSocket(server): attaches Socket.io to the HTTP server.
 *   - getIO():            returns the shared Socket.io instance.
 *   - emitInfra():      pushes infra_added / infra_updated to the Admin page.
 *   - watchAlerts():      listens to the Alerts collection (MongoDB change
 *                         stream) and emits a "newAlert" event on every insert,
 *                         so new alerts reach the frontend live.
 */

import { Server } from 'socket.io';
import Alert from '../models/alert.js';

let io = null;

// Attach Socket.io to the shared HTTP server.
export const initSocket = (httpServer) => {
    io = new Server(httpServer, {
        // Dev: open to all. Prod: set FRONTEND_URL in the env to lock it to the frontend origin.
        cors: { origin: process.env.FRONTEND_URL || '*' },
    });

    io.on('connection', (socket) => {
        console.log(`Socket connected: ${socket.id}`);
        socket.on('disconnect', () => console.log(`Socket disconnected: ${socket.id}`));
    });

    return io;
};

export const getIO = () => {
    if (!io) throw new Error('Socket.io not initialized. Call initSocket first.');
    return io;
};

/**
 * Infra live updates (Admin page).
 * Called by the crosswalk / camera / LED routes AFTER a successful DB write, so
 * every connected Admin sees the change. Events the frontend listens to:
 *   "infra_added"   (after POST)  -> { type, payload }
 *   "infra_updated" (after PUT)   -> { type, payload }
 * type = "crosswalk" | "camera" | "led", payload = the full saved document (with _id).
 */
export const emitInfra = (event, type, payload) => {
    try {
        getIO().emit(event, { type, payload });
        console.log(`Live: emitted ${event} (${type}) ${payload?._id}`);
    } catch (err) {
        // The DB write already succeeded - a socket problem must not fail the request.
        console.error(`Failed to emit ${event}: ${err.message}`);
    }
};

/**
 * Live feed via MongoDB Change Streams (works on Atlas / replica sets).
 * The DB is the single source of truth: whenever a new alert is INSERTED into
 * the collection, we push it to every connected frontend client. This is
 * decoupled from the write path, so any insert - from this API or elsewhere -
 * reaches the frontend.
 */
export const watchAlerts = () => {
    try {
        const changeStream = Alert.watch([], { fullDocument: 'updateLookup' });

        changeStream.on('change', (change) => {
            if (change.operationType === 'insert') {
                // A brand-new alert from the AI -> push to all clients.
                getIO().emit('newAlert', change.fullDocument);
                console.log(`Live: emitted newAlert ${change.fullDocument?._id}`);
            } else if (change.operationType === 'update' || change.operationType === 'replace') {
                // An existing alert changed (e.g. an operator set isResolved) ->
                // push the updated doc so other screens stay in sync live.
                getIO().emit('alertUpdated', change.fullDocument);
                console.log(`Live: emitted alertUpdated ${change.fullDocument?._id}`);
            }
        });

        changeStream.on('error', (err) => {
            console.error(`Change stream error: ${err.message}`);
        });

        console.log('Change stream on Alerts collection is active.');
    } catch (err) {
        console.error(`Failed to start change stream: ${err.message}`);
    }
};
