/*
========================================
SmartWalk Extended E2E Test Runner

This file performs black-box tests against
the running Node backend and FastAPI service.

It checks:
- All 20 Node backend routes.
- Both FastAPI routes.
- JWT authentication.
- Role permissions.
- API-key protection.
- Valid and invalid requests.
- Common 400 / 401 / 403 / 404 cases.
- Basic response structure.
- A final PASS / FAIL / SKIP report.

Run from the project root:
node tests/e2e.extended.js

Required before running:
1. Node backend is running.
2. MongoDB is connected.
3. FastAPI is running on AI_SERVICE_URL.
4. Demo users exist (seed.js can create them).

Optional:
Set TEST_IMAGE_PATH in .env to a real image
path that the FastAPI process can access.
========================================
*/

import 'dotenv/config';

const BACKEND_URL = process.env.TEST_BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`;
const AI_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const SENSOR_API_KEY = process.env.SENSOR_API_KEY || '';

const TEST_IMAGE_PATH = process.env.TEST_IMAGE_PATH || '';

const DEFAULT_PASSWORD = process.env.TEST_USER_PASSWORD || '123456';

const ACCOUNTS = {
    Admin: {
        username: process.env.TEST_ADMIN_USERNAME || 'admin',
        password: process.env.TEST_ADMIN_PASSWORD || DEFAULT_PASSWORD
    },
    Manager: {
        username: process.env.TEST_MANAGER_USERNAME || 'manager',
        password: process.env.TEST_MANAGER_PASSWORD || DEFAULT_PASSWORD
    },
    Dispatcher: {
        username: process.env.TEST_DISPATCHER_USERNAME || 'dispatcher',
        password: process.env.TEST_DISPATCHER_PASSWORD || DEFAULT_PASSWORD
    },
    Technician: {
        username: process.env.TEST_TECHNICIAN_USERNAME || 'tech',
        password: process.env.TEST_TECHNICIAN_PASSWORD || DEFAULT_PASSWORD
    }
};

const results = [];
const tokens = {};
const created = {
    userId: null,
    crosswalkId: null,
    cameraId: null,
    ledId: null,
    alertId: null
};

const unique = Date.now().toString().slice(-8);


/*
========================================
Test Utilities
========================================
*/

const record = (status, name, details = '') => {
    results.push({ status, name, details });

    const icon =
        status === 'PASS' ? 'PASS' :
        status === 'SKIP' ? 'SKIP' :
        'FAIL';

    console.log(`[${icon}] ${name}${details ? ` - ${details}` : ''}`);
};

const request = async (
    baseUrl,
    method,
    path,
    {
        token,
        apiKey,
        body,
        headers = {}
    } = {}
) => {

    const requestHeaders = {
        ...headers
    };

    if (body !== undefined) {
        requestHeaders['Content-Type'] = 'application/json';
    }

    if (token) {
        requestHeaders.Authorization = `Bearer ${token}`;
    }

    if (apiKey) {
        requestHeaders['x-api-key'] = apiKey;
    }

    try {
        const response = await fetch(`${baseUrl}${path}`, {
            method,
            headers: requestHeaders,
            body: body === undefined ? undefined : JSON.stringify(body)
        });

        const text = await response.text();

        let data = null;

        if (text) {
            try {
                data = JSON.parse(text);
            } catch {
                data = text;
            }
        }

        return {
            ok: response.ok,
            status: response.status,
            data
        };

    } catch (error) {
        return {
            ok: false,
            status: 0,
            data: null,
            networkError: error.message
        };
    }
};

const backend = (method, path, options) =>
    request(BACKEND_URL, method, path, options);

const ai = (method, path, options) =>
    request(AI_URL, method, path, options);

const expectStatus = async (
    name,
    call,
    expectedStatuses,
    validator = null
) => {

    try {
        const response = await call();

        if (response.networkError) {
            record('FAIL', name, `Network error: ${response.networkError}`);
            return null;
        }

        const allowed = Array.isArray(expectedStatuses)
            ? expectedStatuses
            : [expectedStatuses];

        if (!allowed.includes(response.status)) {
            record(
                'FAIL',
                name,
                `Expected ${allowed.join('/')} but received ${response.status}`
            );
            return response;
        }

        if (validator) {
            const validation = validator(response.data, response);

            if (validation !== true) {
                record(
                    'FAIL',
                    name,
                    typeof validation === 'string'
                        ? validation
                        : 'Response validation failed'
                );
                return response;
            }
        }

        record('PASS', name, `HTTP ${response.status}`);
        return response;

    } catch (error) {
        record('FAIL', name, error.message);
        return null;
    }
};

const skip = (name, reason) => {
    record('SKIP', name, reason);
};

const isArray = (data) =>
    Array.isArray(data) || 'Expected an array';

const isObject = (data) =>
    (data && typeof data === 'object' && !Array.isArray(data))
        || 'Expected an object';

const unauthorizedStatus = (response) =>
    [401, 403].includes(response.status);

const forbiddenStatus = (response) =>
    response.status === 403;

const idOf = (item) =>
    item?._id || item?.id || null;


/*
========================================
Login Tests
========================================
*/

const loginAllRoles = async () => {

    console.log('\n=== Authentication ===');

    await expectStatus(
        'Login rejects wrong credentials',
        () => backend('POST', '/api/users/login', {
            body: {
                username: `wrong-${unique}`,
                password: 'wrong-password'
            }
        }),
        [401, 403]
    );

    for (const [role, account] of Object.entries(ACCOUNTS)) {

        const response = await expectStatus(
            `${role} can login`,
            () => backend('POST', '/api/users/login', {
                body: account
            }),
            200,
            (data) => {
                if (!data?.token) return 'JWT token is missing';
                if (!data?.role) return 'Role is missing';
                return true;
            }
        );

        if (response?.status === 200 && response.data?.token) {
            tokens[role] = response.data.token;
        }
    }
};


/*
========================================
Authentication Middleware Tests
========================================
*/

const testAuthentication = async () => {

    console.log('\n=== JWT Authentication ===');

    await expectStatus(
        'Protected route rejects missing JWT',
        () => backend('GET', '/api/alerts'),
        [401, 403]
    );

    await expectStatus(
        'Protected route rejects invalid JWT',
        () => backend('GET', '/api/alerts', {
            token: 'invalid.jwt.token'
        }),
        [401, 403]
    );
};


/*
========================================
Alerts
========================================
*/

const testAlerts = async () => {

    console.log('\n=== Alerts ===');

    await expectStatus(
        'POST /api/alerts rejects missing x-api-key',
        () => backend('POST', '/api/alerts', {
            body: {}
        }),
        [401, 403]
    );

    await expectStatus(
        'POST /api/alerts rejects invalid x-api-key',
        () => backend('POST', '/api/alerts', {
            apiKey: 'wrong-key',
            body: {}
        }),
        [401, 403]
    );

    await expectStatus(
        'POST /api/alerts rejects invalid body with valid x-api-key',
        () => backend('POST', '/api/alerts', {
            apiKey: SENSOR_API_KEY,
            body: {}
        }),
        400
    );

    for (const role of Object.keys(ACCOUNTS)) {
        if (!tokens[role]) {
            skip(`GET /api/alerts as ${role}`, 'Login failed');
            continue;
        }

        await expectStatus(
            `GET /api/alerts as ${role}`,
            () => backend('GET', '/api/alerts', {
                token: tokens[role]
            }),
            200,
            isArray
        );
    }

    if (tokens.Manager) {
        await expectStatus(
            'Manager cannot update an alert',
            () => backend('PUT', '/api/alerts/000000000000000000000000', {
                token: tokens.Manager,
                body: {
                    isResolved: true
                }
            }),
            403
        );
    }

    for (const role of ['Admin', 'Dispatcher', 'Technician']) {
        if (!tokens[role]) {
            skip(`PUT /api/alerts/:id permission as ${role}`, 'Login failed');
            continue;
        }

        await expectStatus(
            `${role} reaches alert update handler`,
            () => backend('PUT', '/api/alerts/000000000000000000000000', {
                token: tokens[role],
                body: {
                    isResolved: true
                }
            }),
            404
        );
    }

    if (tokens.Admin) {
        await expectStatus(
            'Alert update handles malformed id',
            () => backend('PUT', '/api/alerts/not-a-valid-id', {
                token: tokens.Admin,
                body: {
                    isResolved: true
                }
            }),
            400
        );
    }
};


/*
========================================
Analytics
========================================
*/

const testAnalytics = async () => {

    console.log('\n=== Analytics ===');

    for (const role of ['Admin', 'Manager']) {
        if (!tokens[role]) {
            skip(`Dashboard access as ${role}`, 'Login failed');
            continue;
        }

        await expectStatus(
            `${role} can get dashboard analytics`,
            () => backend('GET', '/api/analytics/dashboard?filter=all', {
                token: tokens[role]
            }),
            200,
            isObject
        );

        for (const filter of ['top5', 'school']) {
            await expectStatus(
                `${role} dashboard accepts filter=${filter}`,
                () => backend(
                    'GET',
                    `/api/analytics/dashboard?filter=${filter}`,
                    {
                        token: tokens[role]
                    }
                ),
                200,
                isObject
            );
        }
    }

    for (const role of ['Dispatcher', 'Technician']) {
        if (!tokens[role]) {
            skip(`Dashboard denied for ${role}`, 'Login failed');
            continue;
        }

        await expectStatus(
            `${role} cannot access dashboard analytics`,
            () => backend('GET', '/api/analytics/dashboard', {
                token: tokens[role]
            }),
            403
        );
    }

    if (tokens.Admin) {
        await expectStatus(
            'Dashboard rejects invalid filter',
            () => backend(
                'GET',
                '/api/analytics/dashboard?filter=invalid-filter',
                {
                    token: tokens.Admin
                }
            ),
            400
        );
    }
};


/*
========================================
Crosswalks
========================================
*/

const testCrosswalks = async () => {

    console.log('\n=== Crosswalks ===');

    for (const role of Object.keys(ACCOUNTS)) {
        if (!tokens[role]) {
            skip(`GET /api/crosswalks as ${role}`, 'Login failed');
            continue;
        }

        await expectStatus(
            `GET /api/crosswalks as ${role}`,
            () => backend('GET', '/api/crosswalks', {
                token: tokens[role]
            }),
            200,
            isArray
        );
    }

    for (const role of ['Manager', 'Dispatcher', 'Technician']) {
        if (!tokens[role]) continue;

        await expectStatus(
            `${role} cannot create crosswalk`,
            () => backend('POST', '/api/crosswalks', {
                token: tokens[role],
                body: {
                    name: `Denied Crosswalk ${unique}`,
                    city: 'Test City',
                    street: 'Test Street',
                    lat: 32.0,
                    lng: 34.0,
                    isSchoolZone: false,
                    status: 'active'
                }
            }),
            403
        );
    }

    if (tokens.Admin) {
        await expectStatus(
            'Crosswalk creation rejects empty body',
            () => backend('POST', '/api/crosswalks', {
                token: tokens.Admin,
                body: {}
            }),
            400
        );

        const response = await expectStatus(
            'Admin can create crosswalk',
            () => backend('POST', '/api/crosswalks', {
                token: tokens.Admin,
                body: {
                    name: `E2E Crosswalk ${unique}`,
                    city: 'Test City',
                    street: `Test Street ${unique}`,
                    lat: 32.0853,
                    lng: 34.7818,
                    isSchoolZone: false,
                    status: 'active'
                }
            }),
            201,
            isObject
        );

        created.crosswalkId = idOf(response?.data);

        await expectStatus(
            'Admin update returns 404 for missing crosswalk',
            () => backend(
                'PUT',
                '/api/crosswalks/000000000000000000000000',
                {
                    token: tokens.Admin,
                    body: {
                        status: 'active'
                    }
                }
            ),
            404
        );

        await expectStatus(
            'Admin update handles malformed crosswalk id',
            () => backend(
                'PUT',
                '/api/crosswalks/not-a-valid-id',
                {
                    token: tokens.Admin,
                    body: {
                        status: 'active'
                    }
                }
            ),
            400
        );
    }

    if (tokens.Manager) {
        await expectStatus(
            'Manager cannot update crosswalk',
            () => backend(
                'PUT',
                '/api/crosswalks/000000000000000000000000',
                {
                    token: tokens.Manager,
                    body: {
                        status: 'active'
                    }
                }
            ),
            403
        );
    }

    if (tokens.Dispatcher) {
        await expectStatus(
            'Dispatcher cannot update crosswalk',
            () => backend(
                'PUT',
                '/api/crosswalks/000000000000000000000000',
                {
                    token: tokens.Dispatcher,
                    body: {
                        status: 'active'
                    }
                }
            ),
            403
        );
    }

    if (tokens.Technician) {
        await expectStatus(
            'Technician reaches crosswalk update handler',
            () => backend(
                'PUT',
                '/api/crosswalks/000000000000000000000000',
                {
                    token: tokens.Technician,
                    body: {
                        status: 'active'
                    }
                }
            ),
            404
        );
    }
};


/*
========================================
Cameras
========================================
*/

const testCameras = async () => {

    console.log('\n=== Cameras ===');

    for (const role of Object.keys(ACCOUNTS)) {
        if (!tokens[role]) continue;

        await expectStatus(
            `GET /api/cameras as ${role}`,
            () => backend('GET', '/api/cameras', {
                token: tokens[role]
            }),
            200,
            isArray
        );
    }

    if (tokens.Admin) {
        await expectStatus(
            'Camera creation rejects empty body',
            () => backend('POST', '/api/cameras', {
                token: tokens.Admin,
                body: {}
            }),
            400
        );

        if (created.crosswalkId) {
            const response = await expectStatus(
                'Admin can create camera',
                () => backend('POST', '/api/cameras', {
                    token: tokens.Admin,
                    body: {
                        name: `E2E Camera ${unique}`,
                        junctionId: created.crosswalkId,
                        status: 'active',
                        ip: '127.0.0.1',
                        type: 'AI'
                    }
                }),
                201,
                isObject
            );

            created.cameraId = idOf(response?.data);

            await expectStatus(
                'Camera GET supports junctionId filter',
                () => backend(
                    'GET',
                    `/api/cameras?junctionId=${encodeURIComponent(created.crosswalkId)}`,
                    {
                        token: tokens.Admin
                    }
                ),
                200,
                isArray
            );
        } else {
            skip(
                'Admin can create camera',
                'Crosswalk creation failed, so junctionId is unavailable'
            );
        }
    }

    for (const role of ['Manager', 'Dispatcher', 'Technician']) {
        if (!tokens[role]) continue;

        await expectStatus(
            `${role} cannot create camera`,
            () => backend('POST', '/api/cameras', {
                token: tokens[role],
                body: {}
            }),
            403
        );
    }

    for (const role of ['Admin', 'Technician']) {
        if (!tokens[role]) continue;

        await expectStatus(
            `${role} reaches camera update handler`,
            () => backend(
                'PUT',
                '/api/cameras/000000000000000000000000',
                {
                    token: tokens[role],
                    body: {
                        status: 'active'
                    }
                }
            ),
            404
        );
    }

    for (const role of ['Manager', 'Dispatcher']) {
        if (!tokens[role]) continue;

        await expectStatus(
            `${role} cannot update camera`,
            () => backend(
                'PUT',
                '/api/cameras/000000000000000000000000',
                {
                    token: tokens[role],
                    body: {
                        status: 'active'
                    }
                }
            ),
            403
        );
    }
};


/*
========================================
LED Devices
========================================
*/

const testLeds = async () => {

    console.log('\n=== LEDs ===');

    for (const role of Object.keys(ACCOUNTS)) {
        if (!tokens[role]) continue;

        await expectStatus(
            `GET /api/leds as ${role}`,
            () => backend('GET', '/api/leds', {
                token: tokens[role]
            }),
            200,
            isArray
        );
    }

    if (tokens.Admin) {
        await expectStatus(
            'LED creation rejects empty body',
            () => backend('POST', '/api/leds', {
                token: tokens.Admin,
                body: {}
            }),
            400
        );

        if (created.crosswalkId) {
            const response = await expectStatus(
                'Admin can create LED',
                () => backend('POST', '/api/leds', {
                    token: tokens.Admin,
                    body: {
                        name: `E2E LED ${unique}`,
                        junctionId: created.crosswalkId,
                        status: 'active',
                        color: 'red'
                    }
                }),
                201,
                isObject
            );

            created.ledId = idOf(response?.data);

            await expectStatus(
                'LED GET supports junctionId filter',
                () => backend(
                    'GET',
                    `/api/leds?junctionId=${encodeURIComponent(created.crosswalkId)}`,
                    {
                        token: tokens.Admin
                    }
                ),
                200,
                isArray
            );
        } else {
            skip(
                'Admin can create LED',
                'Crosswalk creation failed, so junctionId is unavailable'
            );
        }
    }

    for (const role of ['Manager', 'Dispatcher', 'Technician']) {
        if (!tokens[role]) continue;

        await expectStatus(
            `${role} cannot create LED`,
            () => backend('POST', '/api/leds', {
                token: tokens[role],
                body: {}
            }),
            403
        );
    }

    for (const role of ['Admin', 'Technician']) {
        if (!tokens[role]) continue;

        await expectStatus(
            `${role} reaches LED update handler`,
            () => backend(
                'PUT',
                '/api/leds/000000000000000000000000',
                {
                    token: tokens[role],
                    body: {
                        status: 'active'
                    }
                }
            ),
            404
        );
    }

    for (const role of ['Manager', 'Dispatcher']) {
        if (!tokens[role]) continue;

        await expectStatus(
            `${role} cannot update LED`,
            () => backend(
                'PUT',
                '/api/leds/000000000000000000000000',
                {
                    token: tokens[role],
                    body: {
                        status: 'active'
                    }
                }
            ),
            403
        );
    }
};


/*
========================================
Users
========================================
*/

const testUsers = async () => {

    console.log('\n=== Users ===');

    for (const role of ['Manager', 'Dispatcher', 'Technician']) {
        if (!tokens[role]) continue;

        await expectStatus(
            `${role} cannot list users`,
            () => backend('GET', '/api/users', {
                token: tokens[role]
            }),
            403
        );

        await expectStatus(
            `${role} cannot register users`,
            () => backend('POST', '/api/users/register', {
                token: tokens[role],
                body: {
                    name: 'Denied User',
                    username: `denied-${unique}-${role}`,
                    password: '123456',
                    role: 'Dispatcher'
                }
            }),
            403
        );
    }

    if (!tokens.Admin) {
        skip('Admin user management tests', 'Admin login failed');
        return;
    }

    await expectStatus(
        'Admin can list users',
        () => backend('GET', '/api/users', {
            token: tokens.Admin
        }),
        200,
        isArray
    );

    await expectStatus(
        'Registration rejects missing required fields',
        () => backend('POST', '/api/users/register', {
            token: tokens.Admin,
            body: {}
        }),
        400
    );

    await expectStatus(
        'Registration rejects short password',
        () => backend('POST', '/api/users/register', {
            token: tokens.Admin,
            body: {
                name: 'Short Password',
                username: `short-${unique}`,
                password: '123',
                role: 'Dispatcher'
            }
        }),
        400
    );

    const username = `e2e-user-${unique}`;

    const createResponse = await expectStatus(
        'Admin can register user',
        () => backend('POST', '/api/users/register', {
            token: tokens.Admin,
            body: {
                name: 'E2E Test User',
                username,
                password: '123456',
                role: 'Dispatcher'
            }
        }),
        201,
        isObject
    );

    created.userId =
        idOf(createResponse?.data?.user) ||
        idOf(createResponse?.data);

    await expectStatus(
        'Registration rejects duplicate username',
        () => backend('POST', '/api/users/register', {
            token: tokens.Admin,
            body: {
                name: 'Duplicate User',
                username,
                password: '123456',
                role: 'Dispatcher'
            }
        }),
        [400, 409]
    );

    await expectStatus(
        'Admin update returns 404 for missing user',
        () => backend(
            'PUT',
            '/api/users/000000000000000000000000',
            {
                token: tokens.Admin,
                body: {
                    name: 'Missing User'
                }
            }
        ),
        404
    );

    await expectStatus(
        'Admin status update returns 404 for missing user',
        () => backend(
            'PATCH',
            '/api/users/000000000000000000000000/status',
            {
                token: tokens.Admin,
                body: {
                    status: 'suspended'
                }
            }
        ),
        404
    );

    await expectStatus(
        'Status update rejects invalid status',
        () => backend(
            'PATCH',
            `/api/users/${created.userId || '000000000000000000000000'}/status`,
            {
                token: tokens.Admin,
                body: {
                    status: 'invalid-status'
                }
            }
        ),
        400
    );

    if (created.userId) {

        await expectStatus(
            'Admin can update created user',
            () => backend(
                'PUT',
                `/api/users/${created.userId}`,
                {
                    token: tokens.Admin,
                    body: {
                        name: 'E2E Updated User'
                    }
                }
            ),
            200,
            isObject
        );

        await expectStatus(
            'Admin can suspend created user',
            () => backend(
                'PATCH',
                `/api/users/${created.userId}/status`,
                {
                    token: tokens.Admin,
                    body: {
                        status: 'suspended'
                    }
                }
            ),
            200,
            isObject
        );

        await expectStatus(
            'Suspended user cannot login',
            () => backend('POST', '/api/users/login', {
                body: {
                    username,
                    password: '123456'
                }
            }),
            403
        );

        await expectStatus(
            'Admin can reactivate created user',
            () => backend(
                'PATCH',
                `/api/users/${created.userId}/status`,
                {
                    token: tokens.Admin,
                    body: {
                        status: 'active'
                    }
                }
            ),
            200,
            isObject
        );

        await expectStatus(
            'Admin can delete created user',
            () => backend(
                'DELETE',
                `/api/users/${created.userId}`,
                {
                    token: tokens.Admin
                }
            ),
            200
        );

        await expectStatus(
            'Deleting same user again returns 404',
            () => backend(
                'DELETE',
                `/api/users/${created.userId}`,
                {
                    token: tokens.Admin
                }
            ),
            404
        );

    } else {
        skip(
            'Created user update/status/delete tests',
            'Created user id was not returned'
        );
    }
};


/*
========================================
Backend AI Bridge
========================================
*/

const testBackendDetect = async () => {

    console.log('\n=== Backend AI Bridge ===');

    await expectStatus(
        'POST /api/detect rejects missing x-api-key',
        () => backend('POST', '/api/detect', {
            body: {
                imagePath: TEST_IMAGE_PATH || 'missing.jpg'
            }
        }),
        [401, 403]
    );

    await expectStatus(
        'POST /api/detect rejects invalid x-api-key',
        () => backend('POST', '/api/detect', {
            apiKey: 'wrong-key',
            body: {
                imagePath: TEST_IMAGE_PATH || 'missing.jpg'
            }
        }),
        [401, 403]
    );

    if (!TEST_IMAGE_PATH) {
        skip(
            'POST /api/detect valid AI request',
            'Set TEST_IMAGE_PATH in .env to a real image path'
        );
        return;
    }

    await expectStatus(
        'POST /api/detect forwards valid request to AI',
        () => backend('POST', '/api/detect', {
            apiKey: SENSOR_API_KEY,
            body: {
                imagePath: TEST_IMAGE_PATH
            }
        }),
        200,
        (data) =>
            Array.isArray(data) ||
            Array.isArray(data?.detections) ||
            'Expected detection array'
    );
};


/*
========================================
FastAPI Service
========================================
*/

const testFastApi = async () => {

    console.log('\n=== FastAPI Service ===');

    await expectStatus(
        'GET / AI health check',
        () => ai('GET', '/'),
        200,
        (data) =>
            data?.status === 'running'
                ? true
                : 'Expected {"status":"running"}'
    );

    await expectStatus(
        'POST /detect rejects missing image file',
        () => ai('POST', '/detect', {
            body: {
                imagePath: `missing-e2e-${unique}.jpg`
            }
        }),
        400
    );

    if (!TEST_IMAGE_PATH) {
        skip(
            'POST /detect with real image',
            'Set TEST_IMAGE_PATH in .env to a real image path'
        );
        return;
    }

    await expectStatus(
        'POST /detect returns detections for real image',
        () => ai('POST', '/detect', {
            body: {
                imagePath: TEST_IMAGE_PATH
            }
        }),
        200,
        (data) =>
            Array.isArray(data) ||
            Array.isArray(data?.detections) ||
            'Expected detection array'
    );
};


/*
========================================
Final Report
========================================
*/

const printReport = () => {

    const passed =
        results.filter(
            (result) =>
                result.status === 'PASS'
        );

    const failed =
        results.filter(
            (result) =>
                result.status === 'FAIL'
        );

    const skipped =
        results.filter(
            (result) =>
                result.status === 'SKIP'
        );

    console.log('\n');
    console.log('========================================');
    console.log('SMARTWALK EXTENDED E2E TEST REPORT');
    console.log('========================================');

    console.log('\nPASSED TESTS');

    if (!passed.length) {
        console.log('- None');
    }

    passed.forEach((result, index) => {
        console.log(
            `${index + 1}. PASS - ${result.name}`
        );
    });

    console.log('\nFAILED TESTS');

    if (!failed.length) {
        console.log('- None');
    }

    failed.forEach((result, index) => {
        console.log(
            `${index + 1}. FAIL - ${result.name}` +
            (result.details
                ? ` (${result.details})`
                : '')
        );
    });

    console.log('\nSKIPPED TESTS');

    if (!skipped.length) {
        console.log('- None');
    }

    skipped.forEach((result, index) => {
        console.log(
            `${index + 1}. SKIP - ${result.name}` +
            (result.details
                ? ` (${result.details})`
                : '')
        );
    });

    console.log('\n----------------------------------------');
    console.log(`Passed:  ${passed.length}`);
    console.log(`Failed:  ${failed.length}`);
    console.log(`Skipped: ${skipped.length}`);
    console.log(`Total:   ${results.length}`);
    console.log('----------------------------------------');

    if (failed.length === 0) {
        console.log('\nRESULT: ALL EXECUTED TESTS PASSED');
    } else {
        console.log('\nRESULT: SOME TESTS FAILED');
    }

    console.log('');

    process.exitCode =
        failed.length > 0
            ? 1
            : 0;
};


/*
========================================
Run All Tests
========================================
*/

const run = async () => {

    console.log('========================================');
    console.log('SMARTWALK EXTENDED E2E TESTS');
    console.log('========================================');
    console.log(`Backend: ${BACKEND_URL}`);
    console.log(`AI:      ${AI_URL}`);

    if (!SENSOR_API_KEY) {
        console.log(
            '\nWARNING: SENSOR_API_KEY is missing. API-key success tests may fail.'
        );
    }

    await loginAllRoles();
    await testAuthentication();

    await testAlerts();
    await testAnalytics();

    await testCrosswalks();
    await testCameras();
    await testLeds();

    await testUsers();

    await testBackendDetect();
    await testFastApi();

    printReport();
};

run().catch((error) => {

    record(
        'FAIL',
        'Unexpected test runner error',
        error.message
    );

    printReport();
});
