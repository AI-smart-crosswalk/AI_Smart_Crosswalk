/*
========================================
User Model

This model represents a system user who logs
into the SmartWalk dashboard (for example an
Admin, Manager, Dispatcher, or Technician).

It stores the user's personal information,
login information, role, account status,
last login time, and creation time.

Notes:
- Users are created only by an Admin
  (there is no public registration).
- Login is performed using the username.
- Passwords are stored hashed, never in plain text.
========================================
*/

import mongoose from "mongoose";


/*
========================================
User Schema
========================================
*/

const userSchema = new mongoose.Schema({

    // User code (a UUID created by the server).
    id: {
        type: String,
        required: true
    },

    // Full name.
    name: {
        type: String,
        required: true,
        trim: true
    },

    // Login name.
    username: {
        type: String,
        required: true,
        unique: true
    },

    // Hashed password.
    passwordHash: {
        type: String,
        required: true
    },

    // User email address.
    email: {
        type: String,
        default: ""
    },

    // User phone number.
    phone: {
        type: String,
        default: ""
    },

    // User identification number.
    idNumber: {
        type: String,
        default: ""
    },

    // User home address.
    address: {
        type: String,
        default: ""
    },

    // Permission level.
    role: {
        type: String,
        enum: [
            'Admin',
            'Manager',
            'Dispatcher',
            'Technician'
        ]
    },

    // Account state.
    status: {
        type: String,
        enum: [
            'active',
            'suspended'
        ],
        default: 'active'
    },

    // Last login time.
    lastLogin: {
        type: Date,
        default: null
    },

    // Account creation time.
    createdAt: {
        type: Date,
        default: Date.now
    }

});


// Create the User model from the schema.
const User = mongoose.model(
    "User",
    userSchema
);

export default User;