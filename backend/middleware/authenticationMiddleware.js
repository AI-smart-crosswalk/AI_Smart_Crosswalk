// PROVENANCE: [YOSSEF] his JWT auth middleware.
/* ============================================================
 * SANDBOX FILE - SETTLED. From Yossef's branch (you had no middleware). Verifies the JWT and attaches req.user. Wrap protected routes with it.
 * ============================================================ */

import jwt from "jsonwebtoken";

const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ message: "Access token is required" });
        }
        const token = authHeader.split(" ")[1];      // "Bearer <token>"
        if (!token) {
            return res.status(401).json({ message: "Invalid token" });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;                            // attach user to the request
        next();
    } catch (error) {
        return res.status(401).json({ message: "Token is invalid or expired" });
    }
};

export default authMiddleware;
