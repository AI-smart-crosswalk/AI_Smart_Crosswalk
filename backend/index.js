/*
========================================
SmartWalk Backend Entry Point

This file starts the SmartWalk backend server.
It creates the HTTP server, initializes Socket.io,
connects to MongoDB, starts the live database listeners,
and begins listening for incoming requests.

Responsibilities:
- Load environment variables.
- Import the configured Express app.
- Create the HTTP server.
- Initialize Socket.io.
- Connect to MongoDB.
- Start the alert Change Stream.
- Start the user Change Stream.
- Start listening for incoming requests.

The Express configuration itself
is defined separately in app.js.
========================================
*/


// Load environment variables before other modules use them.
import 'dotenv/config';

// Import Node.js HTTP module.
import http from 'http';

// Import the configured Express application.
import app from './app.js';

// Import the MongoDB connection function.
import connectDB from './config/db.js';

// Import Socket.io initialization and database monitoring.
import {
    initSocket,
    watchAlerts,
    watchUsers
} from './config/socket.js';


/*
========================================
Create HTTP Server
========================================
*/

// Create an HTTP server using the Express application.
// This allows Express and Socket.io to use the same server.
const server =
    http.createServer(app);


/*
========================================
Initialize Socket.io
========================================
*/

// Attach Socket.io to the HTTP server.
// This enables real-time communication with the frontend.
initSocket(server);


/*
========================================
Connect to MongoDB
========================================
*/

// Connect the backend to MongoDB.
connectDB().then(
    () => {

        // Start watching the Alerts collection.
        watchAlerts();

        // Start watching the Users collection.
        watchUsers();

    }
);


/*
========================================
Configure Server Port
========================================
*/

// Use the environment port when deployed.
// Use port 3000 as the local fallback.
const PORT =
    process.env.PORT || 3000;


/*
========================================
Start Backend Server
========================================
*/

// Start listening for incoming HTTP and Socket.io connections.
server.listen(
    PORT,
    () => {

        // Confirm that the backend started successfully.
        console.log(
            `Server is running on port ${PORT}`
        );

    }
);