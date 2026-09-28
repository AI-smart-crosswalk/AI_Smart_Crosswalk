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
    await seedIfEmpty(Crosswalk, data.crosswalks, 'crosswalks');
    await seedIfEmpty(Camera, data.cameras, 'cameras');
    await seedIfEmpty(LED, data.leds, 'leds');

    // Alerts in the dummy use string _id ("alert_001"); strip it so Mongo
    // assigns a normal ObjectId (matching real alerts from the AI).
    const alerts = data.alerts.map(({ _id, ...rest }) => rest);
    await seedIfEmpty(Alert, alerts, 'alerts');

    await mongoose.connection.close();
    console.log('Seed complete.');
    process.exit(0);
};

run().catch((err) => {
    console.error(`Seed failed: ${err.message}`);
    process.exit(1);
});
