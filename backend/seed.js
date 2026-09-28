/**
 * seed.js
 * -------
 * One-time script to populate MongoDB with the reference data from
 * dummy-data.json (crosswalks, cameras, leds) plus a couple of sample alerts.
 * Idempotent: each collection is only seeded if it is currently empty, so
 * re-running this will not create duplicates.
 *
 * The demo crosswalks/cameras/leds use FIXED ObjectIds so the AI service config
 * (ai-service/config.py CROSSWALK_ID / CAMERA_ID) can point at them.
 * Old-format demo data (before the Sprint 4 infra schema) is cleared
 * automatically on the first run - see clearOldSchemaData().
 *
 * Run once with:  node seed.js
 */
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fs from 'fs';
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import User from './models/user.js';
import Crosswalk from './models/crosswalk.js';
import Camera from './models/camera.js';
import LED from './models/led.js';
import Alert from './models/alert.js';

dotenv.config();

const data = JSON.parse(fs.readFileSync('./dummy-data.json'));

// Insert docs only if the collection is empty (keeps it safe to re-run).
const seedIfEmpty = async (Model, docs, name) => {
    const count = await Model.countDocuments();
    if (count > 0) {
        console.log(`- ${name}: already has ${count} docs, skipping`);
        return;
    }
    await Model.insertMany(docs);
    console.log(`- ${name}: inserted ${docs.length} docs`);
};

// Insert only the demo docs whose _id is not in the DB yet (never overwrites
// docs an Admin already edited). Used for the fixed-id infra demo data.
const seedMissing = async (Model, docs, name) => {
    const existing = new Set((await Model.find({}, '_id').lean()).map((d) => String(d._id)));
    const missing = docs.filter((d) => !existing.has(String(d._id)));
    if (missing.length) await Model.insertMany(missing);
    console.log(`- ${name}: inserted ${missing.length} missing demo docs`);
};

// Demo data for the Manager dashboard: handled alerts (isResolved + resolvedAt)
// spread over the last 7 days across the demo crosswalks. Runs only while the DB
// has no handled alerts at all, so it never duplicates.
const seedDemoAnalytics = async () => {
    if (await Alert.exists({ isResolved: true })) {
        console.log('- analytics demo: handled alerts already exist, skipping');
        return;
    }
    const crosswalks = await Crosswalk.find().lean();
    const cameras = await Camera.find().lean();
    if (!crosswalks.length) return;

    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const alerts = [];
    const now = Date.now();
    for (let i = 0; i < 60; i++) {
        const cw = pick(crosswalks);
        const cam = cameras.find((c) => String(c.junctionId) === String(cw._id));
        const personType = cw.isSchoolZone
            ? pick(['child', 'child', 'child', 'adult', 'wheeled'])
            : pick(['adult', 'adult', 'child', 'wheeled', 'unknown']);
        const severity = pick(['High', 'Medium', 'Medium', 'Low', 'Low', 'Low']);
        const timestamp = new Date(now - Math.random() * 7 * 24 * 3600 * 1000);
        const resolvedAt = new Date(timestamp.getTime() + (1 + Math.random() * 9) * 60 * 1000); // 1-10 min
        alerts.push({
            crosswalkId: String(cw._id),
            cameraId: cam ? String(cam._id) : 'demo',
            description: 'התרעת דמו לדאשבורד המנהל',
            severity,
            personType,
            confidence: 60 + Math.round(Math.random() * 40),
            isResolved: true,
            resolvedAt: resolvedAt > new Date(now) ? new Date(now) : resolvedAt,
            timestamp,
        });
    }
    await Alert.insertMany(alerts);
    console.log(`- analytics demo: inserted ${alerts.length} handled alerts (last 7 days)`);
};

// ONE-TIME migration: the Sprint 4 infra schema replaced the old demo docs
// (string ids "cw_001", crosswalkId, location, On/Off...). If ANY old-format doc
// is still in the DB, wipe crosswalks/cameras/leds/alerts (all demo data) so they
// get re-seeded in the new format. Once the data is new-format this is a no-op.
const clearOldSchemaData = async () => {
    const db = mongoose.connection.db;
    const oldFound =
        (await db.collection('crosswalks').findOne({ $or: [{ location: { $exists: true } }, { _id: { $type: 'string' } }] })) ||
        (await db.collection('cameras').findOne({ crosswalkId: { $exists: true } })) ||
        (await db.collection('leds').findOne({ crosswalkId: { $exists: true } })) ||
        (await db.collection('alerts').findOne({ crosswalkId: /^cw_/ }));

    if (!oldFound) {
        console.log('- migration: no old-format data, nothing to clear');
        return;
    }
    for (const name of ['crosswalks', 'cameras', 'leds', 'alerts']) {
        const { deletedCount } = await db.collection(name).deleteMany({});
        console.log(`- migration: cleared ${deletedCount} old docs from ${name}`);
    }
};

// There is no public registration, so the first Admin must be seeded.
// Credentials come from .env: ADMIN_USERNAME, ADMIN_PASSWORD (>= 6 chars), optional ADMIN_NAME.
const seedFirstAdmin = async () => {
    if (await User.exists({ role: 'Admin' })) {
        console.log('- admin: an Admin already exists, skipping');
        return;
    }
    const { ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
    if (!ADMIN_USERNAME || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 6) {
        console.log('- admin: NOT created - set ADMIN_USERNAME and ADMIN_PASSWORD (>= 6 chars) in .env and re-run');
        return;
    }
    await User.create({
        id: crypto.randomUUID(),
        name: ADMIN_NAME || 'Admin',
        username: ADMIN_USERNAME,
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10),
        role: 'Admin',
    });
    console.log(`- admin: created "${ADMIN_USERNAME}"`);
};

const run = async () => {
    await connectDB();

    await seedFirstAdmin();
    await clearOldSchemaData();   // one-time: removes old-format demo data (users are never touched)
    await seedMissing(Crosswalk, data.crosswalks, 'crosswalks');
    await seedMissing(Camera, data.cameras, 'cameras');
    await seedMissing(LED, data.leds, 'leds');
    // Crosswalks created before isSchoolZone existed -> explicit false.
    await Crosswalk.updateMany({ isSchoolZone: { $exists: false } }, { $set: { isSchoolZone: false } });

    // Alerts in the dummy use string _id ("alert_001"); strip it so Mongo
    // assigns a normal ObjectId (matching real alerts from the AI).
    const alerts = data.alerts.map(({ _id, ...rest }) => rest);
    await seedIfEmpty(Alert, alerts, 'alerts');
    await seedDemoAnalytics();

    await mongoose.connection.close();
    console.log('Seed complete.');
    process.exit(0);
};

run().catch((err) => {
    console.error(`Seed failed: ${err.message}`);
    process.exit(1);
});
