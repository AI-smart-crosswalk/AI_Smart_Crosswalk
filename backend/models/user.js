/*
========================================
User Model

This model represents a system user who logs
into the SmartWalk dashboard (for example an
Admin, Manager, Dispatcher, or Technician).
It stores the user's code, full name, username,
hashed password, role, account status,
last login time, and creation time.

Notes:
- Users are created only by an Admin
  (there is no public registration).
- There is no email. Login is by username.
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
    id: { type: String, required: true },

    // Full name, set by the Admin. Extra spaces are trimmed.
    name: { type: String, required: true, trim: true },

    // Login name. Must be unique (no two users with the same username).
    username: { type: String, required: true, unique: true },

    // Hashed password (bcrypt). The plain password is never saved.
    passwordHash: { type: String, required: true },

    // Permission level. The frontend opens a dashboard based on this role.
    role: { type: String, enum: ['Admin', 'Manager', 'Dispatcher', 'Technician']},

    // Account state. Lets an Admin suspend a user without deleting them.
    // Suspended users cannot log in.
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },

    // Last login time. null = the user has never logged in yet.
    lastLogin: { type: Date, default: null },

    // Account creation time.
    createdAt: { type: Date, default: Date.now }
});

// Create the User model from the schema.
const User = mongoose.model("User", userSchema);
export default User;
