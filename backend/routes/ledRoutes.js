// PROVENANCE: [RACHE] your route.
/* ============================================================
 * SANDBOX FILE - SETTLED. Copied UNCHANGED from your real repo (branch sprint4-rache). Your thin-service style. (Add authMiddleware to the GET here if you decide reads need login.)
 * ============================================================ */

/**
 * routes/ledRoutes.js
 * -------------------
 * HTTP endpoints for the road LEDs (mounted at /api/leds).
 *   POST /                  -> create an LED record
 *   GET  /?crosswalkId=cw_1 -> list LEDs from the DB, optionally filtered
 *   PUT  /:id               -> update an LED by its code (e.g. status On/Off)
 */
import express from 'express';  // Web framework for Node.js
import {
    createLed,
    fetchAllLeds,
    fetchLedsByCrosswalk,
    updateLed,
} from '../services/ledService.js';
import authenticate from '../middleware/authenticationMiddleware.js';
import authorize from '../middleware/authorizationMiddleware.js';

const router = express.Router();

// POST /api/leds - create a new LED record.
router.post('/', authenticate, authorize('Admin', 'Manager'), async (req, res) => {
    try {
        const savedLed = await createLed(req.body);
        res.status(201).json(savedLed);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// GET /api/leds - return LEDs from the DB, optionally filtered by ?crosswalkId.
router.get('/', authenticate, authorize('Admin', 'Manager', 'Dispatcher', 'Technician'), async (req, res) => {
    try {
        const { crosswalkId } = req.query;
        const leds = crosswalkId
            ? await fetchLedsByCrosswalk(crosswalkId)
            : await fetchAllLeds();
        res.json(leds);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/leds/:id - update an LED by its code (e.g. { "status": "On" }).
router.put('/:id', authenticate, authorize('Admin', 'Manager', 'Technician'), async (req, res) => {
    try {
        const updated = await updateLed(req.params.id, req.body);
        if (!updated) {
            return res.status(404).json({ message: 'LED not found' });
        }
        res.json(updated);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

export default router;
