/*
========================================
This file defines all HTTP endpoints
for cameras.

These endpoints allow creating,
retrieving, updating and deleting cameras
in the system.
========================================
*/

import express from 'express';
import {
    createCamera,
    fetchAllCameras,
    fetchCamerasByJunction,
    updateCamera,
    deleteCamera
} from '../services/cameraService.js';
import authenticate from '../middleware/authenticationMiddleware.js';
import authorize from '../middleware/authorizationMiddleware.js';
import { emitInfra } from '../config/socket.js';

const router = express.Router();

/*
========================================
Create a new camera.

Accessible only to Admin users.

Notifies connected clients after
the camera is created.
========================================
*/
router.post('/', authenticate, authorize('Admin'), async (req, res) => {

    try {

        // Create and save the new camera.
        const saved = await createCamera(req.body);

        // Notify connected clients about the new camera.
        emitInfra('infra_added', 'camera', saved);

        // Return the created camera.
        res.status(201).json(saved);

    } catch (error) {

        // Return an error if the request failed.
        res.status(400).json({ message: error.message });

    }

});

/*
========================================
Return cameras.

Optionally filters the results
by crosswalk using junctionId.

Accessible to all authenticated roles.
========================================
*/
router.get('/', authenticate, authorize('Admin', 'Manager', 'Dispatcher', 'Technician'), async (req, res) => {

    try {

        // Get the optional junction filter.
        const { junctionId } = req.query;

        // Fetch the requested cameras.
        const items = junctionId
            ? await fetchCamerasByJunction(junctionId)
            : await fetchAllCameras();

        // Return the cameras list.
        res.json(items);

    } catch (error) {

        // Return an internal server error.
        res.status(500).json({ message: error.message });

    }

});

/*
========================================
Update an existing camera.

Accessible to Admin and
Technician users.

Notifies connected clients
after the update.
========================================
*/
router.put('/:id', authenticate, authorize('Admin', 'Technician'), async (req, res) => {

    try {

        // Update the selected camera.
        const updated = await updateCamera(req.params.id, req.body);

        // Return an error if the camera does not exist.
        if (!updated) {
            return res.status(404).json({ message: 'Camera not found' });
        }

        // Notify connected clients about the update.
        emitInfra('infra_updated', 'camera', updated);

        // Return the updated camera.
        res.json(updated);

    } catch (error) {

        // Return an error if the update failed.
        res.status(400).json({ message: error.message });

    }

});

/*
========================================
Delete an existing camera.

Accessible only to Admin users.
========================================
*/
router.delete('/:id', authenticate, authorize('Admin'), async (req, res) => {

    try {

        // Delete the selected camera.
        const deleted = await deleteCamera(req.params.id);

        // Return an error if the camera does not exist.
        if (!deleted) {
            return res.status(404).json({ message: 'Camera not found' });
        }

        // Return a successful response.
        res.status(200).json({ message: 'Camera deleted successfully' });

    } catch (error) {

        // Return an error if the delete failed.
        res.status(400).json({ message: error.message });

    }

});

export default router;