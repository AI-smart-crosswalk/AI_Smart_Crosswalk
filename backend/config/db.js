/*
========================================
This file connects the backend
to the MongoDB database.

It loads the database connection
string from the environment variables
and establishes the connection
when the server starts.

Used by:
- app.js
========================================
*/

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';

// Use public DNS servers.
// This helps avoid DNS lookup
// issues with MongoDB Atlas.
dns.setServers(['8.8.8.8', '1.1.1.1']);

// Load the environment variables.
dotenv.config();

/*
========================================
Connect to the MongoDB database.

Uses the connection string
defined in the .env file.

Stops the server if the
connection fails.
========================================
*/
const connectDB = async () => {

    try {

        // Connect to MongoDB.
        const conn = await mongoose.connect(
            process.env.MONGO_URI
        );

        // Display the connected host.
        console.log(
            `MongoDB Connected: ${conn.connection.host}`
        );

    } catch (error) {

        // Display the connection error.
        console.error(
            `Error: ${error.message}`
        );

        // Stop the application.
        process.exit(1);

    }

};

export default connectDB;