/**
 * routes/cameraRoutes.js
 * ----------------------
 * HTTP endpoints for cameras (mounted at /api/cameras).
 *   POST /                   -> create      (Admin)                -> socket "infra_added"
 *   GET  /?junctionId=<_id>  -> list all, optionally by crosswalk (all roles)
 *   PUT  /:id                -> update by _id (Admin, Technician)  -> socket "infra_updated"
 */
import express from 'express';
import { createCamera, fetchAllCameras, fetchCamerasByJunction, updateCamera } from '../services/cameraService.js';
import authenticate from '../middleware/authenticationMiddleware.js';
import authorize from '../middleware/authorizationMiddleware.js';
import { emitInfra } from '../config/socket.js';

const router = express.Router();

// POST /api/cameras - create (Admin only), then notify connected Admins.
router.post('/', authenticate, authorize('Admin'), async (req, res) => {
    try {
        const saved = await createCamera(req.body);
        emitInfra('infra_added', 'camera', saved);
        res.status(201).json(saved);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// GET /api/cameras - return everything in the DB (optionally filtered by ?junctionId).
router.get('/', authenticate, authorize('Admin', 'Manager', 'Dispatcher', 'Technician'), async (req, res) => {
    try {
        const { junctionId } = req.query;
        const items = junctionId ? await fetchCamerasByJunction(junctionId) : await fetchAllCameras();
        res.json(items);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/cameras/:id - update by _id (Admin, Technician), then notify connected Admins.
router.put('/:id', authenticate, authorize('Admin', 'Technician'), async (req, res) => {
    try {
        const updated = await updateCamera(req.params.id, req.body);
        if (!updated) {
            return res.status(404).json({ message: 'Camera not found' });
        }
        emitInfra('infra_updated', 'camera', updated);
        res.json(updated);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

export default router;
