// PROVENANCE: [YOSSEF] his auth route.
/* ============================================================
 * SANDBOX FILE - SETTLED. Yossef's auth code (already integrated into your repo).
 * ============================================================ */

/*
========================================
routes/userRoutes.js
HTTP endpoints for users (mounted at /api/users):
  POST   /login    -> log in with username + password, receive a JWT (+ role)
  POST   /register -> create a user             (Admin only + token; there is no public registration)
  GET    /         -> list all users            (Admin only)
  PUT    /:id      -> update a user role/status  (Admin only)
  PATCH  /:id/status -> suspend / activate a user (Admin only) body: { "status": "suspended" | "active" }
  DELETE /:id      -> delete a user              (Admin only)
(Auth from Yossef's branch yosi-B1; CRUD added in Sprint 4 for the Admin dashboard.)
========================================
*/
import express from "express";
import userService from "../services/userService.js";
import authMiddleware from "../middleware/authenticationMiddleware.js";

const router = express.Router();

// The only public auth endpoint.
router.post("/login", userService.login);

// Admin-only user management. authMiddleware verifies the JWT and attaches
// req.user; the service methods then check req.user.role === 'Admin'.
router.post("/register", authMiddleware, userService.createUser);   // path kept for the frontend; NOT public
router.get("/", authMiddleware, userService.getAllUsers);
router.put("/:id", authMiddleware, userService.updateUser);
router.patch("/:id/status", authMiddleware, userService.setUserStatus);
router.delete("/:id", authMiddleware, userService.deleteUser);

export default router;
