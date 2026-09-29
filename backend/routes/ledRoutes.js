/*
========================================
This file defines all HTTP endpoints
for LED devices.

These endpoints allow creating,
retrieving and updating
LED information.
========================================
*/

import express from 'express';
import { createLed, fetchAllLeds, fetchLedsByJunction, updateLed } from '../services/ledService.js';
import authenticate from '../middleware/authenticationMiddleware.js';
import authorize from '../middleware/authorizationMiddleware.js';
import { emitInfra } from '../config/socket.js';

const router = express.Router();

/*
========================================
Create a new LED.

Accessible only to Admin users.

Notifies connected clients after
the LED is created.
========================================
*/
router.post('/', authenticate, authorize('Admin'), async (req, res) => {

    try {

        // Create and save the new LED.
        const saved = await createLed(req.body);

        // Notify connected clients about the new LED.
        emitInfra('infra_added', 'led', saved);

        // Return the created LED.
        res.status(201).json(saved);

    } catch (error) {

        // Return an error if the request failed.
        res.status(400).json({ message: error.message });

    }

});

/*
========================================
Return LED devices.

Optionally filters the results
by crosswalk using junctionId.

Accessible to all authenticated roles.
========================================
*/
router.get('/', authenticate, authorize('Admin', 'Manager', 'Dispatcher', 'Technician'), async (req, res) => {

    try {

        // Get the optional junction filter.
        const { junctionId } = req.query;

        // Fetch the requested LED devices.
        const items = junctionId
            ? await fetchLedsByJunction(junctionId)
            : await fetchAllLeds();

        // Return the LED devices list.
        res.json(items);

    } catch (error) {

        // Return an internal server error.
        res.status(500).json({ message: error.message });

    }

});

/*
========================================
Update an existing LED.

Accessible to Admin and
Technician users.

Notifies connected clients
after the update.
========================================
*/
router.put('/:id', authenticate, authorize('Admin', 'Technician'), async (req, res) => {

    try {

        // Update the selected LED.
        const updated = await updateLed(req.params.id, req.body);

        // Return an error if the LED does not exist.
        if (!updated) {
            return res.status(404).json({ message: 'LED not found' });
        }

        // Notify connected clients about the update.
        emitInfra('infra_updated', 'led', updated);

        // Return the updated LED.
        res.json(updated);

    } catch (error) {

        // Return an error if the update failed.
        res.status(400).json({ message: error.message });

    }

});

export default router;