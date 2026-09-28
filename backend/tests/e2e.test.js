/**
 * tests/e2e.test.js
 * -----------------
 * End-to-end tests for the backend: a REAL MongoDB (in-memory replica set, so
 * change streams work), the REAL Express app + Socket.io on a random port,
 * real logins (JWT), real seed.js run. Nothing is mocked.
 *
 * Covers: Admin infra page, sensor API key, alerts + alert_resolved,
 * Manager analytics dashboard, seed migration.
 *
 * Run:  npm run test:e2e
 * (first run downloads a MongoDB binary, ~100MB, cached afterwards)
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { io as ioClient } from 'socket.io-client';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SENSOR_KEY = 'e2e-sensor-key-' + crypto.randomBytes(8).toString('hex');
const TZ = 'Asia/Jerusalem';
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

let mongo, server, base, socket, models;
const tokens = {};
const events = [];                           // every socket event received: { event, data }

// ---------- helpers ----------
const api = async (method, url, { token, body, headers = {} } = {}) => {
    const res = await fetch(base + url, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
};

// Wait for a socket event matching the predicate (only events after `since`).
const waitForEvent = (event, pred = () => true, since = 0, ms = 4000) =>
    new Promise((resolve, reject) => {
        const t0 = Date.now();
        const tick = () => {
            const hit = events.slice(since).find((e) => e.event === event && pred(e.data));
            if (hit) return resolve(hit.data);
            if (Date.now() - t0 > ms) return reject(new Error(`timeout waiting for socket "${event}"`));
            setTimeout(tick, 25);
        };
        tick();
    });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const countEvents = (event, pred = () => true, since = 0) =>
    events.slice(since).filter((e) => e.event === event && pred(e.data)).length;

const runSeed = () =>
    execFileSync(process.execPath, ['seed.js'], {
        cwd: ROOT,
        env: process.env,
        encoding: 'utf8',
    });

const israelDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);  // YYYY-MM-DD
const israelDow = (d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    .indexOf(new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d));

// ---------- setup ----------
before(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGO_URI = mongo.getUri('crosswalk_e2e');
    process.env.JWT_SECRET = 'e2e-jwt-secret';
    process.env.SENSOR_API_KEY = SENSOR_KEY;
    process.env.AI_SERVICE_URL = 'http://127.0.0.1:9';     // nothing listens -> detect fails fast after auth

    // Old-format demo data (before this sprint), to exercise the seed migration.
    const raw = await mongoose.createConnection(process.env.MONGO_URI).asPromise();
    await raw.db.collection('crosswalks').insertOne({ _id: 'cw_001', location: 'הרצל 45, חולון', isActive: true });
    await raw.db.collection('cameras').insertOne({ id: 'cam_101', crosswalkId: 'cw_001', status: 'Active' });
    await raw.db.collection('alerts').insertOne({ crosswalkId: 'cw_001', cameraId: 'cam_101', severity: 'High' });
    await raw.close();

    process.env.SEED_OUTPUT = runSeed();

    const { default: app } = await import('../app.js');
    const { initSocket, watchAlerts } = await import('../config/socket.js');
    await mongoose.connect(process.env.MONGO_URI);
    server = http.createServer(app);
    initSocket(server);
    watchAlerts();
    await new Promise((r) => server.listen(0, r));
    base = `http://127.0.0.1:${server.address().port}`;

    models = {
        User: (await import('../models/user.js')).default,
        Alert: (await import('../models/alert.js')).default,
        Crosswalk: (await import('../models/crosswalk.js')).default,
    };

    // REAL logins through the API, with the 4 default users created by seed.js.
    const login = async (username, password) => (await api('POST', '/api/users/login', { body: { username, password } })).data.token;
    tokens.Admin = await login('admin', '123456');
    tokens.Manager = await login('manager', '123456');
    tokens.Dispatcher = await login('dispatcher', '123456');
    tokens.Technician = await login('tech', '123456');

    socket = ioClient(base, { transports: ['websocket'] });
    socket.onAny((event, data) => events.push({ event, data }));
    await new Promise((r) => socket.on('connect', r));
    await sleep(300);   // let the change stream start
});

after(async () => {
    socket?.close();
    await new Promise((r) => (server ? server.close(r) : r()));
    await mongoose.disconnect();
    await mongo?.stop();
});

// ---------- tests ----------
describe('Seed + login', () => {
    test('the 4 default users log in and get their role back', async () => {
        for (const [username, role] of [['admin', 'Admin'], ['manager', 'Manager'], ['dispatcher', 'Dispatcher'], ['tech', 'Technician']]) {
            const r = await api('POST', '/api/users/login', { body: { username, password: '123456' } });
            assert.equal(r.status, 200, username);
            assert.equal(r.data.role, role);
            assert.ok(r.data.token);
        }
        assert.equal((await api('POST', '/api/users/login', { body: { username: 'admin', password: 'wrong' } })).status, 401);
        assert.equal(await models.User.countDocuments(), 4);
    });

    test('old-format data was cleared and new demo data inserted', async () => {
        const out = process.env.SEED_OUTPUT;
        assert.match(out, /migration: cleared/);
        const cws = await models.Crosswalk.find().lean();
        assert.equal(cws.length, 6);
        assert.ok(cws.every((c) => c._id instanceof mongoose.Types.ObjectId && !('location' in c)));
        assert.equal(await models.Alert.countDocuments({ crosswalkId: 'cw_001' }), 0);
        assert.equal(await models.Alert.countDocuments({ isResolved: true, resolvedAt: { $type: 'date' } }), 60);
    });

    test('running seed again changes nothing (idempotent)', async () => {
        const before = [await models.Crosswalk.countDocuments(), await models.Alert.countDocuments(), await models.User.countDocuments()];
        const out = runSeed();
        assert.match(out, /no old-format data/);
        assert.deepEqual([await models.Crosswalk.countDocuments(), await models.Alert.countDocuments(), await models.User.countDocuments()], before);
    });
});

describe('Admin infra page', () => {
    let junctionId, cameraId, ledId;

    test('GET crosswalks / cameras / leds return plain arrays of everything', async () => {
        const [cw, cam, led] = await Promise.all(['crosswalks', 'cameras', 'leds'].map((r) => api('GET', `/api/${r}`, { token: tokens.Admin })));
        assert.equal(cw.status, 200); assert.equal(cw.data.length, 6);
        assert.equal(cam.status, 200); assert.equal(cam.data.length, 7);
        assert.equal(led.status, 200); assert.equal(led.data.length, 2);
        assert.ok(!('cameras' in cw.data[0]) && !('leds' in cw.data[0]), 'no embedded devices');
        for (const k of ['_id', 'name', 'status', 'city', 'street', 'lat', 'lng', 'isSchoolZone']) assert.ok(k in cw.data[0], k);
    });

    test('GET without a token -> 401; every role can read', async () => {
        assert.equal((await api('GET', '/api/cameras')).status, 401);
        for (const role of ['Manager', 'Dispatcher', 'Technician']) assert.equal((await api('GET', '/api/leds', { token: tokens[role] })).status, 200);
    });

    test('POST crosswalk (frontend body) -> 201 + socket infra_added', async () => {
        const since = events.length;
        const body = { name: 'צומת קפלן E2E', status: 'active', city: 'תל אביב', street: '', lat: '32.0734', lng: '34.7842' };
        const r = await api('POST', '/api/crosswalks', { token: tokens.Admin, body });
        assert.equal(r.status, 201);
        assert.ok(mongoose.isValidObjectId(r.data._id));
        assert.equal(r.data.lat, 32.0734);
        junctionId = r.data._id;
        const ev = await waitForEvent('infra_added', (d) => d.payload?._id === junctionId, since);
        assert.equal(ev.type, 'crosswalk');
        assert.equal(ev.payload.name, body.name);
    });

    test('POST camera + led with junctionId -> 201 + infra_added with the right type', async () => {
        const since = events.length;
        const cam = await api('POST', '/api/cameras', { token: tokens.Admin, body: { name: 'cam E2E', status: 'active', ip: '192.168.1.10', type: 'LPR (זיהוי לוחיות)', junctionId } });
        const led = await api('POST', '/api/leds', { token: tokens.Admin, body: { name: 'led E2E', status: 'error', color: 'אדום', junctionId } });
        assert.equal(cam.status, 201); assert.equal(led.status, 201);
        cameraId = cam.data._id; ledId = led.data._id;
        assert.equal((await waitForEvent('infra_added', (d) => d.payload?._id === cameraId, since)).type, 'camera');
        assert.equal((await waitForEvent('infra_added', (d) => d.payload?._id === ledId, since)).type, 'led');
    });

    test('POST validation: bad status / missing junctionId -> 400, no event', async () => {
        const since = events.length;
        assert.equal((await api('POST', '/api/leds', { token: tokens.Admin, body: { name: 'x', status: 'On', junctionId } })).status, 400);
        assert.equal((await api('POST', '/api/cameras', { token: tokens.Admin, body: { name: 'x', status: 'active' } })).status, 400);
        await sleep(200);
        assert.equal(countEvents('infra_added', () => true, since), 0);
    });

    test('POST is Admin only (Manager / Technician / Dispatcher -> 403)', async () => {
        for (const role of ['Manager', 'Technician', 'Dispatcher']) {
            assert.equal((await api('POST', '/api/crosswalks', { token: tokens[role], body: { name: 'x' } })).status, 403, role);
        }
    });

    test('PUT by _id (Technician) -> 200 + socket infra_updated', async () => {
        const since = events.length;
        const r = await api('PUT', `/api/cameras/${cameraId}`, { token: tokens.Technician, body: { status: 'error' } });
        assert.equal(r.status, 200); assert.equal(r.data.status, 'error');
        const ev = await waitForEvent('infra_updated', (d) => d.payload?._id === cameraId, since);
        assert.equal(ev.type, 'camera'); assert.equal(ev.payload.status, 'error');

        assert.equal((await api('PUT', `/api/leds/${ledId}`, { token: tokens.Admin, body: { color: 'ירוק' } })).status, 200);
        assert.equal((await waitForEvent('infra_updated', (d) => d.payload?._id === ledId, since)).type, 'led');
        assert.equal((await api('PUT', `/api/crosswalks/${junctionId}`, { token: tokens.Technician, body: { isSchoolZone: true } })).status, 200);
        assert.equal((await waitForEvent('infra_updated', (d) => d.payload?._id === junctionId, since)).type, 'crosswalk');
    });

    test('PUT: Manager -> 403, unknown id -> 404, bad value -> 400', async () => {
        assert.equal((await api('PUT', `/api/cameras/${cameraId}`, { token: tokens.Manager, body: { status: 'active' } })).status, 403);
        assert.equal((await api('PUT', `/api/crosswalks/${junctionId}`, { token: tokens.Dispatcher, body: { status: 'active' } })).status, 403);
        assert.equal((await api('PUT', '/api/leds/66f1c0000000000000000999', { token: tokens.Admin, body: { status: 'active' } })).status, 404);
        assert.equal((await api('PUT', `/api/leds/${ledId}`, { token: tokens.Admin, body: { status: 'On' } })).status, 400);
    });

    test('GET ?junctionId filters devices by crosswalk', async () => {
        const r = await api('GET', `/api/cameras?junctionId=${junctionId}`, { token: tokens.Admin });
        assert.equal(r.status, 200); assert.deepEqual(r.data.map((c) => c._id), [cameraId]);
    });
});

describe('Sensor API key', () => {
    const alertBody = { crosswalkId: '66f1a0000000000000000001', cameraId: '66f1b0000000000000000001', severity: 'High', personType: 'wheeled', description: 'e2e' };

    test('POST /api/alerts: no key / wrong key -> 401', async () => {
        assert.equal((await api('POST', '/api/alerts', { body: alertBody })).status, 401);
        assert.equal((await api('POST', '/api/alerts', { body: alertBody, headers: { 'x-api-key': 'wrong' } })).status, 401);
        assert.equal((await api('POST', '/api/alerts', { token: tokens.Admin, body: alertBody })).status, 401, 'a user JWT is not enough');
    });

    test('POST /api/alerts with key -> 201 (personType "wheeled" accepted) + newAlert', async () => {
        const since = events.length;
        const r = await api('POST', '/api/alerts', { body: alertBody, headers: { 'x-api-key': SENSOR_KEY } });
        assert.equal(r.status, 201); assert.equal(r.data.personType, 'wheeled'); assert.equal(r.data.isResolved, false);
        await waitForEvent('newAlert', (d) => String(d._id) === r.data._id, since);
    });

    test('POST /api/detect: no key -> 401, with key passes auth', async () => {
        assert.equal((await api('POST', '/api/detect', { body: { imagePath: 'x.jpg' } })).status, 401);
        assert.notEqual((await api('POST', '/api/detect', { body: { imagePath: 'x.jpg' }, headers: { 'x-api-key': SENSOR_KEY } })).status, 401);
    });
});

describe('Alerts: resolve + alert_resolved', () => {
    let alertId;
    before(async () => {
        const r = await api('POST', '/api/alerts', { body: { crosswalkId: '66f1a0000000000000000004', cameraId: '66f1b0000000000000000005', severity: 'Medium', personType: 'child' }, headers: { 'x-api-key': SENSOR_KEY } });
        alertId = r.data._id;
    });

    test('Manager cannot update alerts (403)', async () => {
        assert.equal((await api('PUT', `/api/alerts/${alertId}`, { token: tokens.Manager, body: { isResolved: true } })).status, 403);
    });

    test('Dispatcher resolves -> resolvedAt set by server (client value ignored) + ONE alert_resolved', async () => {
        const since = events.length;
        const r = await api('PUT', `/api/alerts/${alertId}`, { token: tokens.Dispatcher, body: { isResolved: true, resolvedAt: '2000-01-01T00:00:00Z' } });
        assert.equal(r.status, 200); assert.equal(r.data.isResolved, true);
        assert.ok(Math.abs(new Date(r.data.resolvedAt) - Date.now()) < 60_000, 'resolvedAt = now');
        const ev = await waitForEvent('alert_resolved', (d) => String(d._id) === alertId, since);
        assert.equal(ev.crosswalkId, '66f1a0000000000000000004');
        await waitForEvent('alertUpdated', (d) => String(d._id) === alertId, since);   // existing event still works

        // resolving again is not a new transition -> no second alert_resolved
        assert.equal((await api('PUT', `/api/alerts/${alertId}`, { token: tokens.Technician, body: { isResolved: true } })).status, 200);
        await sleep(300);
        assert.equal(countEvents('alert_resolved', (d) => String(d._id) === alertId, since), 1);
    });

    test('un-resolving clears resolvedAt; unknown id -> 404', async () => {
        const r = await api('PUT', `/api/alerts/${alertId}`, { token: tokens.Admin, body: { isResolved: false } });
        assert.equal(r.status, 200); assert.equal(r.data.resolvedAt, null);
        assert.equal((await api('PUT', '/api/alerts/66f1a0000000000000000999', { token: tokens.Admin, body: { isResolved: true } })).status, 404);
    });
});

describe('Manager dashboard analytics', () => {
    const get = (filter, role = 'Manager') => api('GET', `/api/analytics/dashboard${filter ? `?filter=${filter}` : ''}`, { token: tokens[role] });

    // Independent re-computation in plain JS, straight from the DB.
    const expected = async (crosswalks) => {
        const ids = crosswalks.map((c) => String(c._id));
        const alerts = (await models.Alert.find({ isResolved: true }).lean()).filter((a) => ids.includes(a.crosswalkId));
        const lastWeek = new Set([0, 1, 2, 3, 4, 5, 6].map((k) => israelDate(new Date(Date.now() - k * 86400000))));
        const weekly = [0, 0, 0, 0, 0, 0, 0];
        alerts.filter((a) => lastWeek.has(israelDate(a.timestamp))).forEach((a) => weekly[israelDow(a.timestamp)]++);
        const timed = alerts.filter((a) => a.resolvedAt);
        const avgMs = timed.reduce((s, a) => s + (a.resolvedAt - a.timestamp), 0) / (timed.length || 1);
        const per = (id, type) => alerts.filter((a) => a.crosswalkId === id && (!type || a.personType === type)).length;
        return {
            stats: {
                totalAlerts: alerts.length,
                highRisk: alerts.filter((a) => a.severity === 'High').length,
                activeCrosswalks: crosswalks.filter((c) => c.status === 'active').length,
                totalCrosswalks: crosswalks.length,
                avgResponseTime: timed.length ? Math.round(avgMs / 6000) / 10 : 0,
            },
            intersections: Object.fromEntries(crosswalks.map((c) => [c.name, {
                name: c.name, children: per(String(c._id), 'child'), adults: per(String(c._id), 'adult'),
                vehicles: per(String(c._id), 'wheeled'), total: per(String(c._id)),
            }])),
            weekly: DAYS.map((name, i) => ({ name, safetyAlerts: weekly[i] })),
            severity: [['High', 'קריטי'], ['Medium', 'בינוני'], ['Low', 'נמוך']].map(([k, name]) => ({ name, value: alerts.filter((a) => a.severity === k).length })),
        };
    };

    const assertMatches = (got, exp) => {
        assert.deepEqual(got.stats, exp.stats);
        assert.deepEqual(got.weekly, exp.weekly);
        assert.deepEqual(got.severity, exp.severity);
        for (const i of got.intersections) assert.deepEqual(i, exp.intersections[i.name]);
        const totals = got.intersections.map((i) => i.total);
        assert.deepEqual(totals, [...totals].sort((a, b) => b - a), 'intersections sorted by total desc');
    };

    test('permissions: Manager/Admin 200, Dispatcher/Technician 403, no token 401, bad filter 400', async () => {
        assert.equal((await get('all')).status, 200);
        assert.equal((await get('all', 'Admin')).status, 200);
        assert.equal((await get('all', 'Dispatcher')).status, 403);
        assert.equal((await get('all', 'Technician')).status, 403);
        assert.equal((await api('GET', '/api/analytics/dashboard')).status, 401);
        assert.equal((await get('everything')).status, 400);
    });

    test('response shape: weekly = 7 fixed days Sun..Sat, severity = 3 fixed labels', async () => {
        const { data } = await get('all');
        assert.deepEqual(Object.keys(data).sort(), ['intersections', 'severity', 'stats', 'weekly']);
        assert.deepEqual(data.weekly.map((d) => d.name), DAYS);
        assert.deepEqual(data.severity.map((s) => s.name), ['קריטי', 'בינוני', 'נמוך']);
        for (const v of Object.values(data.stats)) assert.equal(typeof v, 'number');
    });

    test('filter=all matches an independent calculation from the DB', async () => {
        assertMatches((await get('all')).data, await expected(await models.Crosswalk.find().lean()));
        assertMatches((await get()).data, await expected(await models.Crosswalk.find().lean()));   // default = all
    });

    test('filter=school only includes school crosswalks', async () => {
        const schools = await models.Crosswalk.find({ isSchoolZone: true }).lean();
        const { data } = await get('school');
        assert.equal(data.intersections.length, schools.length);
        assertMatches(data, await expected(schools));
    });

    test('filter=top5 = the 5 crosswalks with most handled alerts', async () => {
        const all = (await get('all')).data.intersections;
        const { data } = await get('top5');
        assert.equal(data.intersections.length, 5);
        assert.deepEqual(data.intersections.map((i) => i.total), all.slice(0, 5).map((i) => i.total));
        const names = data.intersections.map((i) => i.name);
        assertMatches(data, await expected((await models.Crosswalk.find().lean()).filter((c) => names.includes(c.name))));
    });

    test('only handled alerts count; resolving one updates the numbers', async () => {
        const before = (await get('all')).data.stats.totalAlerts;
        const r = await api('POST', '/api/alerts', { body: { crosswalkId: '66f1a0000000000000000001', cameraId: '66f1b0000000000000000001', severity: 'High', personType: 'adult' }, headers: { 'x-api-key': SENSOR_KEY } });
        assert.equal((await get('all')).data.stats.totalAlerts, before, 'unresolved alert not counted');
        await api('PUT', `/api/alerts/${r.data._id}`, { token: tokens.Dispatcher, body: { isResolved: true } });
        const after = (await get('all')).data;
        assert.equal(after.stats.totalAlerts, before + 1);
        assertMatches(after, await expected(await models.Crosswalk.find().lean()));
    });
});
