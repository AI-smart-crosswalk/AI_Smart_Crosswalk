/*
========================================
User Model

This model represents a system user who logs
into the SmartWalk dashboard (for example an
Admin, Manager, Dispatcher, or Technician).
It stores the user's code, full name, username,
hashed password, role, account status, optional
contact details, last login time, and creation time.

Notes:
- Users are created only by an Admin
  (there is no public registration).
- Login is performed using the username, not email.
- idNumber, phone, email and address are optional
  and not unique - see the comment on email below.
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

    // Optional contact/identity details, set by the Admin. Not unique on
    // purpose - a unique index on email is what broke user creation before,
    // since Mongo treats every missing field as the same null value.
    idNumber: {
        type: String,
        default: "",
        trim: true
    },

    // User email address.
    email: {
        type: String,
        default: "",
        trim: true,
        lowercase: true
    },

    // User phone number.
    phone: {
        type: String,
        default: "",
        trim: true
    },

    // User home address.
    address: {
        type: String,
        default: "",
        trim: true
    },

    // Hashed password (bcrypt). The plain password is never saved.
    passwordHash: {
        type: String,
        required: true
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