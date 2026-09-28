/**
 * services/analyticsService.js
 * ----------------------------
 * All Manager-dashboard statistics are computed here (server side), and returned
 * as ONE object that the frontend renders directly in its charts.
 *
 * Only HANDLED alerts are counted (isResolved: true).
 *
 * filter decides which crosswalks are included, and applies to EVERY section:
 *   all    -> every crosswalk
 *   top5   -> the 5 crosswalks with the most handled alerts
 *   school -> crosswalks with isSchoolZone: true
 *
 * Note: alert.crosswalkId is a String holding the crosswalk's _id, so ids are
 * compared as strings.
 */
import Alert from '../models/alert.js';
import Crosswalk from '../models/crosswalk.js';

export const FILTERS = ['top5', 'school', 'all'];

const TZ = 'Asia/Jerusalem';
// Fixed order Sunday..Saturday. Mongo $dayOfWeek: 1 = Sunday ... 7 = Saturday.
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const SEVERITY_LABELS = [['High', 'קריטי'], ['Medium', 'בינוני'], ['Low', 'נמוך']];

const RESOLVED = { isResolved: true };
const countIf = (cond) => ({ $sum: { $cond: [cond, 1, 0] } });

// Which crosswalks the chosen filter includes.
const selectCrosswalks = async (filter) => {
    if (filter === 'school') {
        return await Crosswalk.find({ isSchoolZone: true }).lean();
    }

    const all = await Crosswalk.find().lean();
    if (filter !== 'top5') return all;

    // top5: rank existing crosswalks by number of handled alerts.
    const counts = await Alert.aggregate([
        { $match: { ...RESOLVED, crosswalkId: { $in: all.map((c) => String(c._id)) } } },
        { $group: { _id: '$crosswalkId', total: { $sum: 1 } } },
        { $sort: { total: -1, _id: 1 } },
        { $limit: 5 },
    ]);
    const byId = new Map(all.map((c) => [String(c._id), c]));
    return counts.map((c) => byId.get(c._id));
};

export const getDashboard = async (filter = 'all') => {
    const crosswalks = await selectCrosswalks(filter);
    const ids = crosswalks.map((c) => String(c._id));

    // One round-trip: every section is a branch of the same $facet.
    const [facets] = await Alert.aggregate([
        { $match: { ...RESOLVED, crosswalkId: { $in: ids } } },
        {
            $facet: {
                stats: [
                    {
                        $group: {
                            _id: null,
                            totalAlerts: { $sum: 1 },
                            highRisk: countIf({ $eq: ['$severity', 'High'] }),
                            // resolvedAt - timestamp, in ms. $avg skips the nulls
                            // (old alerts that were handled before resolvedAt existed).
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
                    // Last 7 days (today + 6 before), whole days in Israel time.
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
                    { $group: { _id: { $dayOfWeek: { date: '$timestamp', timezone: TZ } }, count: { $sum: 1 } } },
                ],
                severity: [{ $group: { _id: '$severity', count: { $sum: 1 } } }],
            },
        },
    ]);

    // --- Shape the response exactly as the frontend expects ---
    const s = facets.stats[0] || { totalAlerts: 0, highRisk: 0, avgResponseMs: null };

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

    // Always 7 items, Sunday..Saturday, zero-filled.
    const perDay = new Map(facets.weekly.map((r) => [r._id, r.count]));
    const weekly = DAY_NAMES.map((name, i) => ({ name, safetyAlerts: perDay.get(i + 1) || 0 }));

    const perSeverity = new Map(facets.severity.map((r) => [r._id, r.count]));
    const severity = SEVERITY_LABELS.map(([key, name]) => ({ name, value: perSeverity.get(key) || 0 }));

    return {
        stats: {
            totalAlerts: s.totalAlerts,
            highRisk: s.highRisk,
            activeCrosswalks: crosswalks.filter((c) => c.status === 'active').length,
            totalCrosswalks: crosswalks.length,
            // minutes, 1 decimal; 0 when there is no timed data yet
            avgResponseTime: s.avgResponseMs == null ? 0 : Math.round(s.avgResponseMs / 6000) / 10,
        },
        intersections,
        weekly,
        severity,
    };
};
