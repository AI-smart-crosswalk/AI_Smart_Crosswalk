/*
========================================
Analytics Service

This file calculates the statistics for the
manager dashboard and returns them as one object.

The resolved alerts counter counts ALL alerts
in the database where isResolved is true.

The crosswalk counter counts ALL crosswalks
in the database and all active crosswalks.

The dashboard filters affect the charts,
but do not affect the resolved alerts counter
or the crosswalk counter.

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


// Day names from Sunday to Saturday.
// MongoDB: 1 = Sunday, 7 = Saturday.
const DAY_NAMES = [
    'ראשון',
    'שני',
    'שלישי',
    'רביעי',
    'חמישי',
    'שישי',
    'שבת'
];


const SEVERITY_LABELS = [
    ['High', 'קריטי'],
    ['Medium', 'בינוני'],
    ['Low', 'נמוך']
];


const RESOLVED = {
    isResolved: true
};


// Count only alerts that match a condition.
const countIf = (cond) => ({
    $sum: {
        $cond: [cond, 1, 0]
    }
});


/*
========================================
Select Crosswalks By Filter
========================================
*/

const selectCrosswalks = async (filter) => {

    // Return only school-zone crosswalks.
    if (filter === 'school') {

        return await Crosswalk.find({
            isSchoolZone: true
        }).lean();

    }


    // Get all crosswalks.
    const all = await Crosswalk.find().lean();


    // Return all crosswalks when top5 is not requested.
    if (filter !== 'top5') {
        return all;
    }


    // Find the 5 crosswalks with the most resolved alerts.
    const counts = await Alert.aggregate([
        {
            $match: {
                ...RESOLVED,
                crosswalkId: {
                    $in: all.map(
                        (c) => String(c._id)
                    )
                }
            }
        },
        {
            $group: {
                _id: '$crosswalkId',
                total: {
                    $sum: 1
                }
            }
        },
        {
            $sort: {
                total: -1,
                _id: 1
            }
        },
        {
            $limit: 5
        }
    ]);


    const byId = new Map(
        all.map(
            (c) => [
                String(c._id),
                c
            ]
        )
    );


    return counts
        .map(
            (c) => byId.get(c._id)
        )
        .filter(Boolean);
};


/*
========================================
Get Dashboard Data
========================================
*/

export const getDashboard = async (filter = 'all') => {

    /*
    ========================================
    Count ALL Resolved Alerts
    ========================================

    This query is completely independent
    from the dashboard crosswalk filter.

    It counts every alert in the Alerts
    collection where isResolved is true.
    ========================================
    */

    const resolvedAlertsCount =
        await Alert.countDocuments({
            isResolved: true
        });


    /*
    ========================================
    Count ALL Crosswalks
    ========================================

    These queries are completely independent
    from the dashboard crosswalk filter.

    totalCrosswalksCount:
    Counts every crosswalk in the system.

    activeCrosswalksCount:
    Counts every crosswalk whose status
    is currently active.
    ========================================
    */

    const totalCrosswalksCount =
        await Crosswalk.countDocuments();

    const activeCrosswalksCount =
        await Crosswalk.countDocuments({
            status: 'active'
        });


    /*
    ========================================
    Select Crosswalks
    ========================================
    */

    const crosswalks =
        await selectCrosswalks(filter);


    const ids = crosswalks.map(
        (c) => String(c._id)
    );


    /*
    ========================================
    Calculate Dashboard Charts
    ========================================
    */

    const [facets] = await Alert.aggregate([
        {
            $match: {
                ...RESOLVED,
                crosswalkId: {
                    $in: ids
                }
            }
        },
        {
            $facet: {

                /*
                ========================================
                General Statistics
                ========================================
                */

                stats: [
                    {
                        $group: {
                            _id: null,

                            // Count High severity alerts
                            // inside the selected filter.
                            highRisk: countIf({
                                $eq: [
                                    '$severity',
                                    'High'
                                ]
                            }),

                            // Calculate average response time.
                            // Alerts without resolvedAt are ignored.
                            avgResponseMs: {
                                $avg: {
                                    $cond: [
                                        {
                                            $eq: [
                                                {
                                                    $type: '$resolvedAt'
                                                },
                                                'date'
                                            ]
                                        },
                                        {
                                            $subtract: [
                                                '$resolvedAt',
                                                '$timestamp'
                                            ]
                                        },
                                        null
                                    ]
                                }
                            }
                        }
                    }
                ],


                /*
                ========================================
                Alerts Per Crosswalk
                ========================================
                */

                perCrosswalk: [
                    {
                        $group: {
                            _id: '$crosswalkId',

                            children: countIf({
                                $eq: [
                                    '$personType',
                                    'child'
                                ]
                            }),

                            adults: countIf({
                                $eq: [
                                    '$personType',
                                    'adult'
                                ]
                            }),

                            vehicles: countIf({
                                $eq: [
                                    '$personType',
                                    'wheeled'
                                ]
                            }),

                            total: {
                                $sum: 1
                            }
                        }
                    }
                ],


                /*
                ========================================
                Weekly Alerts
                ========================================
                */

                weekly: [
                    {
                        $match: {
                            $expr: {
                                $gte: [
                                    '$timestamp',
                                    {
                                        $dateSubtract: {
                                            startDate: {
                                                $dateTrunc: {
                                                    date: '$$NOW',
                                                    unit: 'day',
                                                    timezone: TZ
                                                }
                                            },
                                            unit: 'day',
                                            amount: 6
                                        }
                                    }
                                ]
                            }
                        }
                    },
                    {
                        $group: {
                            _id: {
                                $dayOfWeek: {
                                    date: '$timestamp',
                                    timezone: TZ
                                }
                            },

                            count: {
                                $sum: 1
                            }
                        }
                    }
                ],


                /*
                ========================================
                Severity Distribution
                ========================================
                */

                severity: [
                    {
                        $group: {
                            _id: '$severity',

                            count: {
                                $sum: 1
                            }
                        }
                    }
                ]
            }
        }
    ]);


    /*
    ========================================
    Build Statistics
    ========================================
    */

    const s = facets.stats[0] || {
        highRisk: 0,
        avgResponseMs: null
    };


    /*
    ========================================
    Build Crosswalk Chart
    ========================================
    */

    const perCw = new Map(
        facets.perCrosswalk.map(
            (r) => [
                r._id,
                r
            ]
        )
    );


    const intersections = crosswalks
        .map((c) => {

            const r =
                perCw.get(
                    String(c._id)
                ) || {};


            return {
                name: c.name,
                children: r.children || 0,
                adults: r.adults || 0,
                vehicles: r.vehicles || 0,
                total: r.total || 0
            };

        })
        .sort(
            (a, b) => b.total - a.total
        );


    /*
    ========================================
    Build Weekly Chart
    ========================================
    */

    const perDay = new Map(
        facets.weekly.map(
            (r) => [
                r._id,
                r.count
            ]
        )
    );


    const weekly = DAY_NAMES.map(
        (name, i) => ({
            name,
            safetyAlerts:
                perDay.get(i + 1) || 0
        })
    );


    /*
    ========================================
    Build Severity Chart
    ========================================
    */

    const perSeverity = new Map(
        facets.severity.map(
            (r) => [
                r._id,
                r.count
            ]
        )
    );


    const severity = SEVERITY_LABELS.map(
        ([key, name]) => ({
            name,
            value:
                perSeverity.get(key) || 0
        })
    );


    /*
    ========================================
    Return Dashboard Data
    ========================================
    */

    return {

        stats: {

            // ALL alerts in the database
            // where isResolved === true.
            totalAlerts:
                resolvedAlertsCount,


            // High severity alerts
            // according to the selected filter.
            highRisk:
                s.highRisk,


            // ALL active crosswalks in the system.
            activeCrosswalks:
                activeCrosswalksCount,


            // ALL crosswalks in the system.
            totalCrosswalks:
                totalCrosswalksCount,


            // Average response time.
            avgResponseTime:
                s.avgResponseMs == null
                    ? 0
                    : Math.round(
                        s.avgResponseMs / 6000
                    ) / 10
        },


        intersections,

        weekly,

        severity
    };
};