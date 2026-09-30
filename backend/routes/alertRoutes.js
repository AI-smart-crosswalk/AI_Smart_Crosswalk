/*
========================================
This file defines all HTTP endpoints
for alerts.

Each route receives a request,
applies the required middleware,
and calls the appropriate service.
========================================
*/

import express from 'express';
import {
    createAlert,
    fetchAllAlerts,
    updateAlert
} from '../services/alertService.js';

import authenticate from '../middleware/authenticationMiddleware.js';
import authorize from '../middleware/authorizationMiddleware.js';
import apiKey from '../middleware/apiKeyMiddleware.js';

import {
    emitAlertResolved,
    emitAlertReopened
} from '../config/socket.js';

const router = express.Router();

/*
========================================
Create a new alert.

Called by the AI service after
a dangerous event is detected.

Protected by an API Key.
========================================
*/
router.post('/', apiKey, async (req, res) => {

    try {

        // Create and save the new alert.
        const savedAlert = await createAlert(req.body);

        // Return the created alert.
        res.status(201).json(savedAlert);

    } catch (error) {

        // Return an error if the request failed.
        res.status(400).json({
            message: error.message
        });

    }

});

/*
========================================
Return all alerts.

Accessible only to authenticated
users with the required role.
========================================
*/
router.get(
    '/',
    authenticate,
    authorize('Admin', 'Manager', 'Dispatcher', 'Technician'),
    async (req, res) => {

        try {

            // Fetch all alerts from the database.
            const alerts = await fetchAllAlerts();

            // Return the alerts list.
            res.json(alerts);

        } catch (error) {

            // Return an internal server error.
            res.status(500).json({
                message: error.message
            });

        }

    }
);

/*
========================================
Update an existing alert.

Used to resolve an alert,
reopen an alert,
or update its information.
========================================
*/
router.put(
    '/:id',
    authenticate,
    authorize('Admin', 'Dispatcher', 'Technician'),
    async (req, res) => {

        try {

            // Update the selected alert.
            const {
                alert: updated,
                justResolved,
                justReopened
            } = await updateAlert(
                req.params.id,
                req.body
            );

            // Return an error if the alert does not exist.
            if (!updated) {
                return res.status(404).json({
                    message: 'Alert not found'
                });
            }

            // Notify connected clients when
            // an alert changes from unresolved to resolved.
            if (justResolved) {
                emitAlertResolved(updated);
            }

            // Notify connected clients when
            // an alert changes from resolved to unresolved.
            if (justReopened) {
                emitAlertReopened(updated);
            }

            // Return the updated alert.
            res.json(updated);

        } catch (error) {

            // Return an error if the update failed.
            res.status(400).json({
                message: error.message
            });

        }

    }
);

export default router;