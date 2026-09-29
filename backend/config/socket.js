
/*
========================================
Socket Configuration

Responsibilities:
- Initialize Socket.io.
- Manage frontend socket connections.
- Send infrastructure updates.
- Send alert resolution updates.
- Watch MongoDB for alert changes.
- Send live alert updates to the frontend.
========================================
*/

import { Server } from 'socket.io';
import Alert from '../models/alert.js';

let io = null;


/*
========================================
Initialize Socket.io
========================================
*/

export const initSocket = (httpServer) => {

    // Attach Socket.io to the HTTP server.
    io = new Server(httpServer, {

        // Allow the configured frontend URL.
        cors: {
            origin: process.env.FRONTEND_URL || '*'
        }

    });

    // Listen for new frontend connections.
    io.on('connection', (socket) => {

        console.log(
            `Socket connected: ${socket.id}`
        );

        // Listen for frontend disconnections.
        socket.on('disconnect', () => {

            console.log(
                `Socket disconnected: ${socket.id}`
            );

        });

    });

    return io;
};


/*
========================================
Get Socket.io Instance
========================================
*/

export const getIO = () => {

    // Verify that Socket.io was initialized.
    if (!io) {

        throw new Error(
            'Socket.io not initialized. Call initSocket first.'
        );

    }

    return io;
};


/*
========================================
Emit Infrastructure Update
========================================
*/

export const emitInfra = (
    event,
    type,
    payload
) => {

    try {

        // Send infrastructure update to all connected clients.
        getIO().emit(event, {
            type,
            payload
        });

        console.log(
            `Live: emitted ${event} (${type}) ${payload?._id}`
        );

    } catch (err) {

        // Socket errors should not affect a successful database operation.
        console.error(
            `Failed to emit ${event}: ${err.message}`
        );

    }

};


/*
========================================
Emit Alert Resolved
========================================
*/

export const emitAlertResolved = (alert) => {

    try {

        // Notify connected clients that an alert was resolved.
        getIO().emit(
            'alert_resolved',
            {
                _id: alert._id,
                crosswalkId: alert.crosswalkId
            }
        );

        console.log(
            `Live: emitted alert_resolved ${alert._id}`
        );

    } catch (err) {

        console.error(
            `Failed to emit alert_resolved: ${err.message}`
        );

    }

};


/*
========================================
Watch Alert Changes
========================================
*/

export const watchAlerts = () => {

    try {

        // Watch the Alerts collection for database changes.
        const changeStream = Alert.watch(
            [],
            {
                fullDocument: 'updateLookup'
            }
        );


        // Handle alert database changes.
        changeStream.on(
            'change',
            (change) => {

                // Send newly created alerts to all connected clients.
                if (
                    change.operationType === 'insert'
                ) {

                    getIO().emit(
                        'newAlert',
                        change.fullDocument
                    );

                    console.log(
                        `Live: emitted newAlert ${change.fullDocument?._id}`
                    );

                }


                // Send updated alerts to all connected clients.
                else if (
                    change.operationType === 'update' ||
                    change.operationType === 'replace'
                ) {

                    getIO().emit(
                        'alertUpdated',
                        change.fullDocument
                    );

                    console.log(
                        `Live: emitted alertUpdated ${change.fullDocument?._id}`
                    );

                }

            }
        );


        // Handle MongoDB Change Stream errors.
        changeStream.on(
            'error',
            (err) => {

                console.error(
                    `Change stream error: ${err.message}`
                );

            }
        );


        console.log(
            'Change stream on Alerts collection is active.'
        );

    } catch (err) {

        console.error(
            `Failed to start change stream: ${err.message}`
        );

    }

};