/*
========================================
User Service

This file handles user operations.
It creates users, logs users in with JWT,
and lets the Admin manage users.
========================================
*/
import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/user.js";

// Search a user by MongoDB _id or by the custom id field.
const userFilter = (idParam) => (mongoose.isValidObjectId(idParam) ? { _id: idParam } : { id: idParam });

const MIN_PASSWORD_LENGTH = 6;
const ROLES = User.schema.path("role").enumValues;

/*
========================================
Create User (Admin only)
========================================
*/
const createUser = async (req, res) => {
    try {
        // Only an Admin can create users.
        if (req.user.role !== "Admin") {
            return res.status(403).json({ message: "Admin only" });
        }

        const { username, name, role, password, idNumber, phone, email, address } = req.body;

        // Check that all fields are valid.
        if (!username || !name || !password || !role) {
            return res.status(400).json({ message: "name, username, password and role are required" });
        }
        if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
            return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
        }
        if (!ROLES.includes(role)) {
            return res.status(400).json({ message: `Role must be one of: ${ROLES.join(", ")}` });
        }

        // Return an error if the username is already taken.
        const existingUser = await User.findOne({ username: username });
        if (existingUser) {
            return res.status(400).json({ message: "Username already exists" });
        }

        // Hash the password so it is never saved as plain text.
        const passwordHash = await bcrypt.hash(password, 10);

        // Save the new user in the database.
        const user = new User({
            id: crypto.randomUUID(),
            name: name,
            username: username,
            passwordHash: passwordHash,
            role: role,
            idNumber: idNumber,
            phone: phone,
            email: email,
            address: address,
        });
        await user.save();

        return res.status(201).json({
            message: "User created successfully",
            user: {
                _id: user._id, id: user.id, name: user.name, username: user.username, role: user.role, status: user.status,
                idNumber: user.idNumber, phone: user.phone, email: user.email, address: user.address,
            },
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

/*
========================================
Login
========================================
*/
const login = async (req, res) => {
    try {
        const username = req.body.username;
        const password = req.body.password;

        if (typeof username !== "string" || typeof password !== "string") {
            return res.status(400).json({ message: "username and password are required" });
        }

        // Find the user in the database.
        const user = await User.findOne({ username: username });
        if (!user) {
            return res.status(401).json({ message: "Invalid username or password" });
        }

        // Check the password against the saved hash.
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid username or password" });
        }

        // Suspended users cannot log in.
        if (user.status === "suspended") {
            return res.status(403).json({ message: "Account is suspended" });
        }

        // Save the login time.
        await User.updateOne({ _id: user._id }, { lastLogin: new Date() });

        // Create a token that is valid for 24 hours.
        // The role is saved in the token for permission checks.
        const token = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "24h" }
        );

        // Return the role so the frontend can open the right dashboard.
        return res.status(200).json({ token, role: user.role, username: user.username });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

/*
========================================
Get All Users (Admin only)
========================================
*/
const getAllUsers = async (req, res) => {
    try {
        if (req.user.role !== "Admin") {
            return res.status(403).json({ message: "Admin only" });
        }
        // Return all users without their password hash.
        const users = await User.find().select("-passwordHash");
        return res.status(200).json(users);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

/*
========================================
Update User (Admin only)
========================================
*/
const updateUser = async (req, res) => {
    try {
        if (req.user.role !== "Admin") {
            return res.status(403).json({ message: "Admin only" });
        }
        // Allow only safe fields to be updated (not the password).
        const { role, status, username, name, idNumber, phone, email, address } = req.body;
        const updates = {};
        if (role !== undefined) updates.role = role;
        if (status !== undefined) updates.status = status;
        if (username !== undefined) updates.username = username;
        if (name !== undefined) updates.name = name;
        if (idNumber !== undefined) updates.idNumber = idNumber;
        if (phone !== undefined) updates.phone = phone;
        if (email !== undefined) updates.email = email;
        if (address !== undefined) updates.address = address;

        const updated = await User.findOneAndUpdate(userFilter(req.params.id), updates, {
            new: true,            // Return the updated user.
            runValidators: true,  // Check the values against the schema.
        }).select("-passwordHash");

        // Return an error if the user was not found.
        if (!updated) {
            return res.status(404).json({ message: "User not found" });
        }
        return res.status(200).json(updated);
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
};

/*
========================================
Set User Status (Admin only)
========================================
*/
const setUserStatus = async (req, res) => {
    try {
        if (req.user.role !== "Admin") {
            return res.status(403).json({ message: "Admin only" });
        }
        // The status must be "active" or "suspended".
        const status = req.body.status;
        if (!User.schema.path("status").enumValues.includes(status)) {
            return res.status(400).json({ message: 'status must be "active" or "suspended"' });
        }
        const updated = await User.findOneAndUpdate(userFilter(req.params.id), { status }, { new: true })
            .select("-passwordHash");
        if (!updated) {
            return res.status(404).json({ message: "User not found" });
        }
        return res.status(200).json(updated);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

/*
========================================
Delete User (Admin only)
========================================
*/
const deleteUser = async (req, res) => {
    try {
        if (req.user.role !== "Admin") {
            return res.status(403).json({ message: "Admin only" });
        }
        const deleted = await User.findOneAndDelete(userFilter(req.params.id));
        if (!deleted) {
            return res.status(404).json({ message: "User not found" });
        }
        return res.status(200).json({ message: "User deleted" });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export default {
    createUser: createUser,
    login: login,
    getAllUsers: getAllUsers,
    updateUser: updateUser,
    setUserStatus: setUserStatus,
    deleteUser: deleteUser,
};
