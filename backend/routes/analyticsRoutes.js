/*
========================================
This file defines the analytics
HTTP endpoints.

These endpoints provide dashboard
statistics for managers and admins.
========================================
*/

import express from 'express';
import { getDashboard, FILTERS } from '../services/analyticsService.js';
import authenticate from '../middleware/authenticationMiddleware.js';
import authorize from '../middleware/authorizationMiddleware.js';

const router = express.Router();

/*
========================================
Return dashboard analytics.

The response contains statistics,
charts and summary information.

Accessible only to Admin and Manager.
========================================
*/
router.get('/dashboard', authenticate, authorize('Manager', 'Admin'), async (req, res) => {

    // Get the requested filter or use the default one.
    const filter = req.query.filter || 'all';

    // Verify that the selected filter is valid.
    if (!FILTERS.includes(filter)) {
        return res.status(400).json({
            message: `filter must be one of: ${FILTERS.join(', ')}`
        });
    }

    try {

        // Generate and return the dashboard data.
        res.json(await getDashboard(filter));

    } catch (error) {

        // Return an internal server error.
        res.status(500).json({
            message: error.message
        });

    }

});

export default router;