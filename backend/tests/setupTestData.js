/*
========================================
SmartWalk E2E Test Data Setup

This file creates the demo data required
before running the extended E2E test suite.

It creates:
- Admin
- Manager
- Dispatcher
- Technician
- Demo crosswalks
- Demo cameras
- Demo LED devices
- Demo alerts

Run from the project root:
node tests/setupTestData.js
========================================
*/

import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import connectDB from '../config/db.js';
import User from '../models/user.js';
import Crosswalk from '../models/crosswalk.js';
import Camera from '../models/camera.js';
import Led from '../models/led.js';
import Alert from '../models/alert.js';


/*
========================================
Test Configuration
========================================
*/

const DEFAULT_PASSWORD =
    process.env.TEST_USER_PASSWORD || '123456';

const TEST_PREFIX = 'E2E_TEST';


/*
========================================
Demo Users
========================================
*/

const demoUsers = [
    {
        name: 'E2E Admin',
        username: 'admin',
        password: DEFAULT_PASSWORD,
        role: 'Admin',
        status: 'active'
    },
    {
        name: 'E2E Manager',
        username: 'manager',
        password: DEFAULT_PASSWORD,
        role: 'Manager',
        status: 'active'
    },
    {
        name: 'E2E Dispatcher',
        username: 'dispatcher',
        password: DEFAULT_PASSWORD,
        role: 'Dispatcher',
        status: 'active'
    },
    {
        name: 'E2E Technician',
        username: 'tech',
        password: DEFAULT_PASSWORD,
        role: 'Technician',
        status: 'active'
    }
];


/*
========================================
Create Demo Users
========================================
*/

const createUsers = async () => {

    console.log('\nCreating test users...');

    for (const userData of demoUsers) {

        const passwordHash =
            await bcrypt.hash(userData.password, 10);

        const existingUser =
            await User.findOne({
                username: userData.username
            });

        if (existingUser) {

            existingUser.name = userData.name;
            existingUser.role = userData.role;
            existingUser.status = userData.status;
            existingUser.passwordHash = passwordHash;

            await existingUser.save();

            console.log(
                `Updated user: ${userData.username} (${userData.role})`
            );

            continue;
        }

        await User.create({
            id: `user_${userData.username}`,
            name: userData.name,
            username: userData.username,
            passwordHash,
            role: userData.role,
            status: userData.status
        });

        console.log(
            `Created user: ${userData.username} (${userData.role})`
        );
    }
};


/*
========================================
Create Demo Crosswalks
========================================
*/

const createCrosswalks = async () => {

    console.log('\nCreating test crosswalks...');

    const crosswalkData = [
        {
            name: `${TEST_PREFIX}_Crosswalk_1`,
            city: 'Test City',
            street: 'Test Street 1',
            lat: 32.0853,
            lng: 34.7818,
            isSchoolZone: false,
            status: 'active'
        },
        {
            name: `${TEST_PREFIX}_School_Crosswalk`,
            city: 'Test City',
            street: 'School Street',
            lat: 32.0860,
            lng: 34.7825,
            isSchoolZone: true,
            status: 'active'
        }
    ];

    const crosswalks = [];

    for (const data of crosswalkData) {

        let crosswalk =
            await Crosswalk.findOne({
                name: data.name
            });

        if (!crosswalk) {
            crosswalk =
                await Crosswalk.create(data);

            console.log(
                `Created crosswalk: ${data.name}`
            );
        } else {
            console.log(
                `Crosswalk already exists: ${data.name}`
            );
        }

        crosswalks.push(crosswalk);
    }

    return crosswalks;
};


/*
========================================
Create Demo Cameras
========================================
*/

const createCameras = async (crosswalks) => {

    console.log('\nCreating test cameras...');

    const cameras = [];

    for (let index = 0; index < crosswalks.length; index++) {

        const data = {
            name: `${TEST_PREFIX}_Camera_${index + 1}`,
            junctionId: crosswalks[index]._id,
            status: 'active',
            ip: `127.0.0.${index + 10}`,
            type: 'AI'
        };

        let camera =
            await Camera.findOne({
                name: data.name
            });

        if (!camera) {
            camera =
                await Camera.create(data);

            console.log(
                `Created camera: ${data.name}`
            );
        } else {
            console.log(
                `Camera already exists: ${data.name}`
            );
        }

        cameras.push(camera);
    }

    return cameras;
};


/*
========================================
Create Demo LEDs
========================================
*/

const createLeds = async (crosswalks) => {

    console.log('\nCreating test LED devices...');

    const leds = [];

    for (let index = 0; index < crosswalks.length; index++) {

        const data = {
            name: `${TEST_PREFIX}_LED_${index + 1}`,
            junctionId: crosswalks[index]._id,
            status: 'active',
            color: index === 0 ? 'red' : 'green'
        };

        let led =
            await Led.findOne({
                name: data.name
            });

        if (!led) {
            led =
                await Led.create(data);

            console.log(
                `Created LED: ${data.name}`
            );
        } else {
            console.log(
                `LED already exists: ${data.name}`
            );
        }

        leds.push(led);
    }

    return leds;
};


/*
========================================
Create Demo Alerts
========================================
*/

const createAlerts = async (
    crosswalks,
    cameras
) => {

    console.log('\nCreating test alerts...');

    const existing =
        await Alert.findOne({
            eventId: `${TEST_PREFIX}_alert_1`
        });

    if (existing) {
        console.log(
            'Test alerts already exist.'
        );

        return;
    }

    const now = Date.now();

    const alertData = [
        {
            eventId: `${TEST_PREFIX}_alert_1`,
            crosswalkId: String(crosswalks[0]._id),
            cameraId: String(cameras[0]._id),
            location: 'Test Street 1, Test City',
            description: 'Person using mobile phone',
            confidence: 95,
            personType: 'adult',
            distracted: true,
            severity: 'High',
            ledTriggered: true,
            isResolved: false,
            timestamp: new Date(now - 10 * 60 * 1000)
        },
        {
            eventId: `${TEST_PREFIX}_alert_2`,
            crosswalkId: String(crosswalks[0]._id),
            cameraId: String(cameras[0]._id),
            location: 'Test Street 1, Test City',
            description: 'Person stationary in crosswalk',
            confidence: 88,
            personType: 'adult',
            distracted: false,
            severity: 'Medium',
            ledTriggered: false,
            isResolved: true,
            resolvedAt: new Date(now - 30 * 60 * 1000),
            timestamp: new Date(now - 60 * 60 * 1000)
        },
        {
            eventId: `${TEST_PREFIX}_alert_3`,
            crosswalkId: String(crosswalks[1]._id),
            cameraId: String(cameras[1]._id),
            location: 'School Street, Test City',
            description: 'Child without nearby adult',
            confidence: 92,
            personType: 'child',
            distracted: false,
            severity: 'High',
            ledTriggered: true,
            isResolved: false,
            timestamp: new Date(now - 24 * 60 * 60 * 1000)
        },
        {
            eventId: `${TEST_PREFIX}_alert_4`,
            crosswalkId: String(crosswalks[1]._id),
            cameraId: String(cameras[1]._id),
            location: 'School Street, Test City',
            description: 'Demo low risk alert',
            confidence: 76,
            personType: 'unknown',
            distracted: false,
            severity: 'Low',
            ledTriggered: false,
            isResolved: true,
            resolvedAt: new Date(now - 47 * 60 * 60 * 1000),
            timestamp: new Date(now - 2 * 24 * 60 * 60 * 1000)
        }
    ];

    await Alert.insertMany(alertData);

    console.log(
        `Created ${alertData.length} test alerts.`
    );
};


/*
========================================
Setup Test Data
========================================
*/

const setupTestData = async () => {

    try {

        console.log('========================================');
        console.log('SMARTWALK E2E TEST DATA SETUP');
        console.log('========================================');

        await connectDB();

        await createUsers();

        const crosswalks =
            await createCrosswalks();

        const cameras =
            await createCameras(crosswalks);

        await createLeds(crosswalks);

        await createAlerts(
            crosswalks,
            cameras
        );

        console.log('\n========================================');
        console.log('TEST DATA READY');
        console.log('========================================');
        console.log('Admin:      admin / 123456');
        console.log('Manager:    manager / 123456');
        console.log('Dispatcher: dispatcher / 123456');
        console.log('Technician: tech / 123456');
        console.log('========================================');

    } catch (error) {

        console.error(
            '\nTest data setup failed:',
            error
        );

        process.exitCode = 1;

    } finally {

        await mongoose.connection.close();
    }
};

setupTestData();
