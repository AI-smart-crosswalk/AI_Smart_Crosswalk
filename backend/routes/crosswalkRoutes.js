/**
 * routes/crosswalkRoutes.js
 * -------------------------
 * HTTP endpoints for crosswalks (mounted at /api/crosswalks).
 *   POST /     -> create        (Admin)                -> socket "infra_added"
 *   GET  /     -> list all      (all roles)
 *   PUT  /:id  -> update by _id (Admin, Technician)    -> socket "infra_updated"
 */
import express from 'express';
import { createCrosswalk, fetchAllCrosswalks, updateCrosswalk } from '../services/crosswalkService.js';
import authenticate from '../middleware/authenticationMiddleware.js';
import authorize from '../middleware/authorizationMiddleware.js';
import { emitInfra } from '../config/socket.js';

const router = express.Router();

// POST /api/crosswalks - create (Admin only), then notify connected Admins.
router.post('/', authenticate, authorize('Admin'), async (req, res) => {
    try {
        const saved = await createCrosswalk(req.body);
        emitInfra('infra_added', 'crosswalk', saved);
        res.status(201).json(saved);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// GET /api/crosswalks - return all crosswalks in the DB (plain array, no filters).
router.get('/', authenticate, authorize('Admin', 'Manager', 'Dispatcher', 'Technician'), async (req, res) => {
    try {
        const crosswalks = await fetchAllCrosswalks();
        res.json(crosswalks);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/crosswalks/:id - update by _id (Admin, Technician), then notify connected Admins.
router.put('/:id', authenticate, authorize('Admin', 'Technician'), async (req, res) => {
    try {
        const updated = await updateCrosswalk(req.params.id, req.body);
        if (!updated) {
            return res.status(404).json({ message: 'Crosswalk not found' });
        }
        emitInfra('infra_updated', 'crosswalk', updated);
        res.json(updated);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

export default router;
