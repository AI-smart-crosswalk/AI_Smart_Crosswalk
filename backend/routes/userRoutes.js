/*
========================================
This file defines all HTTP endpoints
for user management.

These endpoints handle user
authentication and administrative
user management.
========================================
*/

import express from "express";
import userService from "../services/userService.js";
import authenticate from "../middleware/authenticationMiddleware.js";
import authorize from "../middleware/authorizationMiddleware.js";

const router = express.Router();

/*
========================================
Authenticate a user.

Verifies the username and password
and returns a JWT token.
========================================
*/
router.post("/login", userService.login);

/*
========================================
Create a new user.

Accessible only to Admin users.

Returns the created user.
========================================
*/
router.post("/register", authenticate, authorize("Admin"), userService.createUser);

/*
========================================
Return all users.

Accessible only to Admin users.
========================================
*/
router.get("/", authenticate, authorize("Admin"), userService.getAllUsers);

/*
========================================
Update an existing user.

Accessible only to Admin users.
========================================
*/
router.put("/:id", authenticate, authorize("Admin"), userService.updateUser);

/*
========================================
Update a user's status.

Used to activate or suspend
an existing user.

Accessible only to Admin users.
========================================
*/
router.patch("/:id/status", authenticate, authorize("Admin"), userService.setUserStatus);

/*
========================================
Delete a user.

Accessible only to Admin users.
========================================
*/
router.delete("/:id", authenticate, authorize("Admin"), userService.deleteUser);

export default router;