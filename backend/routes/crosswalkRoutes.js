/*
========================================
This file defines all HTTP endpoints
for crosswalks.

These endpoints allow creating,
retrieving, updating and deleting
crosswalk information.
========================================
*/

import express from 'express';
import {
    createCrosswalk,
    fetchAllCrosswalks,
    updateCrosswalk,
    deleteCrosswalk
} from '../services/crosswalkService.js';
import authenticate from '../middleware/authenticationMiddleware.js';
import authorize from '../middleware/authorizationMiddleware.js';
import { emitInfra } from '../config/socket.js';

const router = express.Router();

/*
========================================
Create a new crosswalk.

Accessible only to Admin users.

Notifies connected clients after
the crosswalk is created.
========================================
*/
router.post('/', authenticate, authorize('Admin'), async (req, res) => {

    try {

        // Create and save the new crosswalk.
        const saved = await createCrosswalk(req.body);

        // Notify connected clients about the new crosswalk.
        emitInfra('infra_added', 'crosswalk', saved);

        // Return the created crosswalk.
        res.status(201).json(saved);

    } catch (error) {

        // Return an error if the request failed.
        res.status(400).json({ message: error.message });

    }

});

/*
========================================
Return all crosswalks.

Accessible to all authenticated
system users.
========================================
*/
router.get('/', authenticate, authorize('Admin', 'Manager', 'Dispatcher', 'Technician'), async (req, res) => {

    try {

        // Fetch all crosswalks from the database.
        const crosswalks = await fetchAllCrosswalks();

        // Return the crosswalks list.
        res.json(crosswalks);

    } catch (error) {

        // Return an internal server error.
        res.status(500).json({ message: error.message });

    }

});

/*
========================================
Update an existing crosswalk.

Accessible to Admin and
Technician users.

Notifies connected clients
after the update.
========================================
*/
router.put('/:id', authenticate, authorize('Admin', 'Technician'), async (req, res) => {

    try {

        // Update the selected crosswalk.
        const updated = await updateCrosswalk(req.params.id, req.body);

        // Return an error if the crosswalk does not exist.
        if (!updated) {
            return res.status(404).json({ message: 'Crosswalk not found' });
        }

        // Notify connected clients about the update.
        emitInfra('infra_updated', 'crosswalk', updated);

        // Return the updated crosswalk.
        res.json(updated);

    } catch (error) {

        // Return an error if the update failed.
        res.status(400).json({ message: error.message });

    }

});

/*
========================================
Delete an existing crosswalk.

Accessible only to Admin users.
========================================
*/
router.delete('/:id', authenticate, authorize('Admin'), async (req, res) => {

    try {

        // Delete the selected crosswalk.
        const deleted = await deleteCrosswalk(req.params.id);

        // Return an error if the crosswalk does not exist.
        if (!deleted) {
            return res.status(404).json({ message: 'Crosswalk not found' });
        }

        // Return a successful response.
        res.status(200).json({ message: 'Crosswalk deleted successfully' });

    } catch (error) {

        // Return an error if the delete failed.
        res.status(400).json({ message: error.message });

    }

});

export default router;