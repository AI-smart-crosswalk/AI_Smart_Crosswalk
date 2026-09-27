// PROVENANCE: [RACHE] your model (fields must match Yossef's auth).
/* ============================================================
 * SANDBOX FILE - SETTLED. From your real repo (branch sprint4-rache), then changed: (Users are created only by an Admin; no email, login is by username.)
 * ============================================================ */

/**
 * models/user.js
 * --------------
 * Mongoose schema for a system user (operator / admin) who logs into the
 * dashboard. Passwords are stored hashed, never in plain text.
 */
import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    id: { type: String, required: true },                       // user code
    name: { type: String, required: true, trim: true },         // full name (set by the Admin)
    username: { type: String, required: true, unique: true },   // login name
    passwordHash: { type: String, required: true },             // hashed password (never plain)
    // permission level - frontend routes to a dashboard based on this
    role: { type: String, enum: ['Admin', 'Manager', 'Dispatcher', 'Technician']},
    // account state - lets an Admin suspend a user without deleting them
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    lastLogin: { type: Date, default: null },                   // null = never logged in yet
    createdAt: { type: Date, default: Date.now }                // account creation time
});

const User = mongoose.model("User", userSchema);
export default User;
