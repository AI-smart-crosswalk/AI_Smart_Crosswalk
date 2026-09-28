/**
 * routes/analyticsRoutes.js
 * -------------------------
 * Manager dashboard statistics (mounted at /api/analytics).
 *   GET /dashboard?filter=top5|school|all  -> { stats, intersections, weekly, severity }
 * All calculations run on the server (services/analyticsService.js).
 * The frontend re-fetches this after the socket event "alert_resolved".
 */
import express from 'express';
import { getDashboard, FILTERS } from '../services/analyticsService.js';
import authenticate from '../middleware/authenticationMiddleware.js';
import authorize from '../middleware/authorizationMiddleware.js';

const router = express.Router();

router.get('/dashboard', authenticate, authorize('Manager', 'Admin'), async (req, res) => {
    const filter = req.query.filter || 'all';
    if (!FILTERS.includes(filter)) {
        return res.status(400).json({ message: `filter must be one of: ${FILTERS.join(', ')}` });
    }
    try {
        res.json(await getDashboard(filter));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

export default router;
