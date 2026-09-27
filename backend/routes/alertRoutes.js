// PROVENANCE: [RACHE] your route (thin-service style).
/* ============================================================
 * SANDBOX FILE - SETTLED. Copied UNCHANGED from your real repo (branch sprint4-rache). Your thin-service style. (Add authMiddleware to the GET here if you decide reads need login.)
 * ============================================================ */

/**
 * routes/alertRoutes.js
 * ---------------------
 * HTTP endpoints for alerts (mounted at /api/alerts).
 *   POST   /     -> create a new alert (used by the AI node)
 *   GET    /     -> list all alerts from the database (newest first)
 *   PUT    /:id  -> update an alert (e.g. mark resolved)
 */
import express from 'express';
import { createAlert, fetchAllAlerts, updateAlert } from '../services/alertService.js';
import authenticate from '../middleware/authenticationMiddleware.js';
import authorize from '../middleware/authorizationMiddleware.js';

const router = express.Router();

// POST /api/alerts - create a new alert via the service (uploads image + saves).
// NOT authenticated: this is called by the AI service, not a logged-in browser user.
// TODO (frontend/AI): if this needs to be locked down, the AI service must send a
// token/API key of its own first - do not just add authenticate here or it breaks the AI -> backend flow.
router.post('/', async (req, res) => {
    try {
        const savedAlert = await createAlert(req.body);
        res.status(201).json(savedAlert);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// GET /api/alerts - return all alerts from the real database.
router.get('/', authenticate, authorize('Admin', 'Manager', 'Dispatcher', 'Technician'), async (req, res) => {
    try {
        const alerts = await fetchAllAlerts();
        res.json(alerts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/alerts/:id - update an alert (e.g. { "isResolved": true }).
router.put('/:id', authenticate, authorize('Admin', 'Manager', 'Dispatcher'), async (req, res) => {
    try {
        const updated = await updateAlert(req.params.id, req.body);
        if (!updated) {
            return res.status(404).json({ message: 'Alert not found' });
        }

        // No manual emit: the change stream in config/socket.js pushes 'alertUpdated' to the frontend.
        res.json(updated);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

export default router;
