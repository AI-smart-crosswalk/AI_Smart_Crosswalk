// PROVENANCE: [RACHE] your route.
/* ============================================================
 * SANDBOX FILE - SETTLED. Copied UNCHANGED from your real repo (branch sprint4-rache). Your thin-service style. (Add authMiddleware to the GET here if you decide reads need login.)
 * ============================================================ */

/**
 * routes/crosswalkRoutes.js
 * -------------------------
 * HTTP endpoints for crosswalks (mounted at /api/crosswalks).
 *   POST   /     -> create a crosswalk
 *   GET    /     -> list all crosswalks from the database
 *   PUT    /:id  -> update a crosswalk (equipment / status)
 */
import express from 'express';
import { createCrosswalk, fetchAllCrosswalks, updateCrosswalk } from '../services/crosswalkService.js';
import authenticate from '../middleware/authenticationMiddleware.js';
import authorize from '../middleware/authorizationMiddleware.js';

const router = express.Router();

// POST /api/crosswalks - create a new crosswalk.
router.post('/', authenticate, authorize('Admin', 'Manager'), async (req, res) => {
    try {
        const savedCrosswalk = await createCrosswalk(req.body);
        res.status(201).json(savedCrosswalk);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// GET /api/crosswalks - return all crosswalks from the real database.
router.get('/', authenticate, authorize('Admin', 'Manager', 'Dispatcher', 'Technician'), async (req, res) => {
    try {
        const crosswalks = await fetchAllCrosswalks();
        res.json(crosswalks);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/crosswalks/:id - update a crosswalk (e.g. { "isActive": false }).
router.put('/:id', authenticate, authorize('Admin', 'Manager'), async (req, res) => {
    try {
        const updated = await updateCrosswalk(req.params.id, req.body);
        if (!updated) {
            return res.status(404).json({ message: 'Crosswalk not found' });
        }
        res.json(updated);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

export default router;
