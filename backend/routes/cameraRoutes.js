// PROVENANCE: [RACHE] your route.
/* ============================================================
 * SANDBOX FILE - SETTLED. Copied UNCHANGED from your real repo (branch sprint4-rache). Your thin-service style. (Add authMiddleware to the GET here if you decide reads need login.)
 * ============================================================ */

/**
 * routes/cameraRoutes.js
 * ----------------------
 * HTTP endpoints for cameras (mounted at /api/cameras).
 *   POST /                  -> create a camera
 *   GET  /?crosswalkId=cw_1 -> list cameras from the DB, optionally filtered
 *   PUT  /:id               -> update a camera by its code (e.g. status)
 */
import express from 'express';
import {
    createCamera,
    fetchAllCameras,
    fetchCamerasByCrosswalk,
    updateCamera,
} from '../services/cameraService.js';
import authenticate from '../middleware/authenticationMiddleware.js';
import authorize from '../middleware/authorizationMiddleware.js';

const router = express.Router();

// POST /api/cameras - create a new camera.
router.post('/', authenticate, authorize('Admin', 'Manager'), async (req, res) => {
    try {
        const savedCamera = await createCamera(req.body);
        res.status(201).json(savedCamera);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// GET /api/cameras - return cameras from the DB, optionally filtered by ?crosswalkId.
router.get('/', authenticate, authorize('Admin', 'Manager', 'Dispatcher', 'Technician'), async (req, res) => {
    try {
        const { crosswalkId } = req.query;
        const cameras = crosswalkId
            ? await fetchCamerasByCrosswalk(crosswalkId)
            : await fetchAllCameras();
        res.json(cameras);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/cameras/:id - update a camera by its code (e.g. { "status": "Inactive" }).
router.put('/:id', authenticate, authorize('Admin', 'Manager', 'Technician'), async (req, res) => {
    try {
        const updated = await updateCamera(req.params.id, req.body);
        if (!updated) {
            return res.status(404).json({ message: 'Camera not found' });
        }
        res.json(updated);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

export default router;
