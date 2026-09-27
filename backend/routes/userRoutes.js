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
import authenticate from "../middleware/authenticationMiddleware.js";
import authorize from "../middleware/authorizationMiddleware.js";

const router = express.Router();

// The only public auth endpoint.
router.post("/login", userService.login);

// Admin-only user management. authenticate verifies the JWT and attaches
// req.user; authorize then checks req.user.role. (userService also still checks
// role === 'Admin' internally - kept as a second guard, safe to leave in place.)
router.post("/register", authenticate, authorize("Admin"), userService.createUser);   // path kept for the frontend; NOT public
router.get("/", authenticate, authorize("Admin"), userService.getAllUsers);
router.put("/:id", authenticate, authorize("Admin"), userService.updateUser);
router.patch("/:id/status", authenticate, authorize("Admin"), userService.setUserStatus);
router.delete("/:id", authenticate, authorize("Admin"), userService.deleteUser);

export default router;
