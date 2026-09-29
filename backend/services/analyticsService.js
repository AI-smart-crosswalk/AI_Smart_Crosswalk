/*
========================================
Analytics Service

This file calculates the statistics for the
manager dashboard and returns them as one object.
Only resolved alerts are counted.

The filter decides which crosswalks are included:
- all:    every crosswalk
- top5:   the 5 crosswalks with the most resolved alerts
- school: crosswalks in a school zone
========================================
*/
import Alert from '../models/alert.js';
import Crosswalk from '../models/crosswalk.js';

export const FILTERS = ['top5', 'school', 'all'];

const TZ = 'Asia/Jerusalem';
// Day names from Sunday to Saturday (MongoDB: 1 = Sunday, 7 = Saturday).
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const SEVERITY_LABELS = [['High', 'קריטי'], ['Medium', 'בינוני'], ['Low', 'נמוך']];

const RESOLVED = { isResolved: true };
// Count only the alerts that match a condition.
const countIf = (cond) => ({ $sum: { $cond: [cond, 1, 0] } });

/*
========================================
Select Crosswalks By Filter
========================================
*/
const selectCrosswalks = async (filter) => {
    if (filter === 'school') {
        return await Crosswalk.find({ isSchoolZone: true }).lean();
    }

    const all = await Crosswalk.find().lean();
    if (filter !== 'top5') return all;

    // Find the 5 crosswalks with the most resolved alerts.
    // Alert crosswalkId is a string, so ids are compared as strings.
    const counts = await Alert.aggregate([
        { $match: { ...RESOLVED, crosswalkId: { $in: all.map((c) => String(c._id)) } } },
        { $group: { _id: '$crosswalkId', total: { $sum: 1 } } },
        { $sort: { total: -1, _id: 1 } },
        { $limit: 5 },
    ]);
    const byId = new Map(all.map((c) => [String(c._id), c]));
    return counts.map((c) => byId.get(c._id));
};

/*
========================================
Get Dashboard Data
========================================
*/
export const getDashboard = async (filter = 'all') => {
    const crosswalks = await selectCrosswalks(filter);
    const ids = crosswalks.map((c) => String(c._id));

    // Calculate all dashboard sections in one database query.
    const [facets] = await Alert.aggregate([
        { $match: { ...RESOLVED, crosswalkId: { $in: ids } } },
        {
            $facet: {
                // General statistics.
                stats: [
                    {
                        $group: {
                            _id: null,
                            totalAlerts: { $sum: 1 },
                            highRisk: countIf({ $eq: ['$severity', 'High'] }),
                            // Average response time in ms.
                            // Alerts without resolvedAt are skipped.
                            avgResponseMs: {
                                $avg: {
                                    $cond: [
                                        { $eq: [{ $type: '$resolvedAt' }, 'date'] },
                                        { $subtract: ['$resolvedAt', '$timestamp'] },
                                        null,
                                    ],
                                },
                            },
                        },
                    },
                ],
                // Alert counts for each crosswalk.
                perCrosswalk: [
                    {
                        $group: {
                            _id: '$crosswalkId',
                            children: countIf({ $eq: ['$personType', 'child'] }),
                            adults: countIf({ $eq: ['$personType', 'adult'] }),
                            vehicles: countIf({ $eq: ['$personType', 'wheeled'] }),
                            total: { $sum: 1 },
                        },
                    },
                ],
                weekly: [
                    // Keep only the last 7 days (Israel time).
                    {
                        $match: {
                            $expr: {
                                $gte: ['$timestamp', {
                                    $dateSubtract: {
                                        startDate: { $dateTrunc: { date: '$$NOW', unit: 'day', timezone: TZ } },
                                        unit: 'day',
                                        amount: 6,
                                    },
                                }],
                            },
                        },
                    },
                    // Count alerts for each day of the week.
                    { $group: { _id: { $dayOfWeek: { date: '$timestamp', timezone: TZ } }, count: { $sum: 1 } } },
                ],
                // Count alerts for each severity level.
                severity: [{ $group: { _id: '$severity', count: { $sum: 1 } } }],
            },
        },
    ]);

    // Build the response in the format the frontend expects.
    const s = facets.stats[0] || { totalAlerts: 0, highRisk: 0, avgResponseMs: null };

    // Create one row for each crosswalk, sorted by total alerts.
    const perCw = new Map(facets.perCrosswalk.map((r) => [r._id, r]));
    const intersections = crosswalks
        .map((c) => {
            const r = perCw.get(String(c._id)) || {};
            return {
                name: c.name,
                children: r.children || 0,
                adults: r.adults || 0,
                vehicles: r.vehicles || 0,
                total: r.total || 0,
            };
        })
        .sort((a, b) => b.total - a.total);

    // Always return 7 days, with 0 for days without alerts.
    const perDay = new Map(facets.weekly.map((r) => [r._id, r.count]));
    const weekly = DAY_NAMES.map((name, i) => ({ name, safetyAlerts: perDay.get(i + 1) || 0 }));

    // Always return all severity levels, with 0 when empty.
    const perSeverity = new Map(facets.severity.map((r) => [r._id, r.count]));
    const severity = SEVERITY_LABELS.map(([key, name]) => ({ name, value: perSeverity.get(key) || 0 }));

    return {
        stats: {
            totalAlerts: s.totalAlerts,
            highRisk: s.highRisk,
            activeCrosswalks: crosswalks.filter((c) => c.status === 'active').length,
            totalCrosswalks: crosswalks.length,
            // Convert ms to minutes with 1 decimal (0 if there is no data).
            avgResponseTime: s.avgResponseMs == null ? 0 : Math.round(s.avgResponseMs / 6000) / 10,
        },
        intersections,
        weekly,
        severity,
    };
};
