/*
========================================
Database Seed Script

Responsibilities:
- Connect to MongoDB.
- Load demo data from dummy-data.json.
- Insert missing demo infrastructure.
- Insert sample alerts.
- Create demo users for the current roles.
- Prepare the database for testing/demo use.

Run from the project root:
node tests/seed.js
========================================
*/

import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fs from 'fs';
import mongoose from 'mongoose';

import connectDB from '../config/db.js';

import User from '../models/user.js';
import Crosswalk from '../models/crosswalk.js';
import Camera from '../models/camera.js';
import LED from '../models/led.js';
import Alert from '../models/alert.js';

dotenv.config();


/*
========================================
Load Demo Data
========================================
*/

// Load dummy-data.json relative to this file.
const data = JSON.parse(
    fs.readFileSync(
        new URL('./dummy-data.json', import.meta.url),
        'utf8'
    )
);


/*
========================================
Seed Collection If Empty
========================================
*/

const seedIfEmpty = async (
    Model,
    docs,
    name
) => {

    // Check whether the collection already contains data.
    const count =
        await Model.countDocuments();

    if (count > 0) {

        console.log(
            `- ${name}: already has ${count} docs, skipping`
        );

        return;
    }

    // Insert the demo documents.
    await Model.insertMany(docs);

    console.log(
        `- ${name}: inserted ${docs.length} docs`
    );
};


/*
========================================
Seed Missing Documents
========================================
*/

const seedMissing = async (
    Model,
    docs,
    name
) => {

    // Get all existing document IDs.
    const existingDocuments =
        await Model.find({}, '_id').lean();

    const existingIds =
        new Set(
            existingDocuments.map(
                (document) =>
                    String(document._id)
            )
        );

    // Keep only demo documents that do not exist yet.
    const missingDocuments =
        docs.filter(
            (document) =>
                !existingIds.has(
                    String(document._id)
                )
        );

    // Insert only missing documents.
    if (missingDocuments.length > 0) {

        await Model.insertMany(
            missingDocuments
        );

    }

    console.log(
        `- ${name}: inserted ${missingDocuments.length} missing demo docs`
    );
};


/*
========================================
Seed Demo Analytics
========================================
*/

const seedDemoAnalytics = async () => {

    // Avoid creating duplicate resolved demo alerts.
    const resolvedAlertExists =
        await Alert.exists({
            isResolved: true
        });

    if (resolvedAlertExists) {

        console.log(
            '- analytics demo: resolved alerts already exist, skipping'
        );

        return;
    }


    // Load available crosswalks and cameras.
    const crosswalks =
        await Crosswalk.find().lean();

    const cameras =
        await Camera.find().lean();


    if (!crosswalks.length) {

        console.log(
            '- analytics demo: no crosswalks available, skipping'
        );

        return;
    }


    // Select a random item from an array.
    const pick = (array) =>
        array[
            Math.floor(
                Math.random() *
                array.length
            )
        ];


    const alerts = [];

    const now =
        Date.now();


    // Danger types used by the current system.
    const dangerTypes = [
        'Person using mobile phone',
        'Child without nearby adult',
        'Person stationary in crosswalk'
    ];


    // Create demo alerts across the last 7 days.
    for (
        let index = 0;
        index < 30;
        index++
    ) {

        const crosswalk =
            pick(crosswalks);


        // Find a camera connected to this crosswalk.
        const camera =
            cameras.find(
                (item) =>
                    String(
                        item.crosswalkId
                    ) ===
                    String(
                        crosswalk._id
                    )
            );


        const severity =
            pick([
                'High',
                'Medium',
                'Medium',
                'Low',
                'Low'
            ]);


        const reason =
            pick(dangerTypes);


        // Spread alerts across the last 7 days.
        const timestamp =
            new Date(
                now -
                Math.random() *
                7 *
                24 *
                60 *
                60 *
                1000
            );


        alerts.push({

            id:
                crypto.randomUUID(),

            crosswalkId:
                crosswalk._id,

            deviceId:
                camera
                    ? camera._id
                    : undefined,

            location:
                crosswalk.location,

            imageUrl:
                '',

            reason:
                reason,

            severity:
                severity,

            isResolved:
                Math.random() > 0.5,

            timestamp:
                timestamp

        });

    }


    // Insert the generated demo alerts.
    await Alert.insertMany(
        alerts
    );


    console.log(
        `- analytics demo: inserted ${alerts.length} demo alerts`
    );
};


/*
========================================
Clear Old Schema Data
========================================
*/

// Each collection's own filter for documents that belong to the OLD schema.
// deleteMany runs with THIS filter, never with {} - a blanket wipe would also
// remove current, real data (including live alerts from the AI service).
const OLD_SCHEMA_FILTERS = {
    crosswalks: { _id: { $type: 'string' } },
    cameras: { junctionId: { $exists: true } },
    leds: { junctionId: { $exists: true } },
    alerts: { crosswalkId: /^cw_/ },
};

const clearOldSchemaData = async () => {

    const db =
        mongoose.connection.db;


    let totalCleared = 0;

    // Remove only the documents that match that collection's old-schema filter.
    for (
        const [collectionName, filter] of Object.entries(OLD_SCHEMA_FILTERS)
    ) {

        const result =
            await db
                .collection(
                    collectionName
                )
                .deleteMany(filter);


        if (result.deletedCount > 0) {

            console.log(
                `- migration: cleared ${result.deletedCount} old-format docs from ${collectionName}`
            );

            totalCleared += result.deletedCount;
        }

    }


    if (totalCleared === 0) {

        console.log(
            '- migration: no old-format data, nothing to clear'
        );

    }
};


/*
========================================
Default Demo Users
========================================
*/

const DEFAULT_USERS = [

    {
        username:
            'admin',

        name:
            'Admin',

        role:
            'Admin',

        password:
            'Admin123!'
    },

    {
        username:
            'maya',

        name:
            'Maya Levi',

        role:
            'Manager',

        password:
            'Maya123!'
    },

    {
        username:
            'noam',

        name:
            'Noam Israeli',

        role:
            'Technician',

        password:
            'Noam123!'
    }

];


/*
========================================
Seed Default Users
========================================
*/

const seedDefaultUsers = async () => {

    for (
        const userData of DEFAULT_USERS
    ) {

        // Do not recreate an existing user.
        const existingUser =
            await User.findOne({
                username:
                    userData.username
            });


        if (existingUser) {

            console.log(
                `- users: "${userData.username}" already exists, skipping`
            );

            continue;
        }


        // Hash the demo password.
        const passwordHash =
            await bcrypt.hash(
                userData.password,
                10
            );


        // Create the demo user.
        await User.create({

            id:
                crypto.randomUUID(),

            username:
                userData.username,

            name:
                userData.name,

            passwordHash:
                passwordHash,

            role:
                userData.role

        });


        console.log(
            `- users: created "${userData.username}" (${userData.role})`
        );

    }
};


/*
========================================
Run Seed
========================================
*/

const run = async () => {

    // Connect to MongoDB.
    await connectDB();


    // Create demo users.
    await seedDefaultUsers();


    // Remove data that belongs to the old schema.
    await clearOldSchemaData();


    // Insert infrastructure demo data.
    await seedMissing(
        Crosswalk,
        data.crosswalks || [],
        'crosswalks'
    );


    await seedMissing(
        Camera,
        data.cameras || [],
        'cameras'
    );


    await seedMissing(
        LED,
        data.leds || [],
        'leds'
    );


    // Prepare alerts from dummy-data.json.
    const alerts =
        (data.alerts || []).map(
            ({
                _id,
                ...alert
            }) => alert
        );


    // Insert dummy alerts only if the collection is empty.
    if (alerts.length > 0) {

        await seedIfEmpty(
            Alert,
            alerts,
            'alerts'
        );

    }


    // Add dashboard demo alerts.
    await seedDemoAnalytics();


    // Close the MongoDB connection.
    await mongoose.connection.close();


    console.log(
        'Seed complete.'
    );


    process.exit(0);
};


/*
========================================
Start Seed
========================================
*/

run().catch(
    async (error) => {

        console.error(
            `Seed failed: ${error.message}`
        );


        // Close MongoDB if a connection is still open.
        if (
            mongoose.connection.readyState !== 0
        ) {

            await mongoose.connection.close();

        }


        process.exit(1);

    }
);