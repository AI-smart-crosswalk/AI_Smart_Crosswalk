/*
========================================
This middleware protects endpoints
used by authenticated users.

It verifies the JWT token sent in
the Authorization header and
attaches the authenticated user
information to the request.

Required header:
Authorization: Bearer <JWT_TOKEN>

Used by:
- Protected routes that require
  user authentication.
========================================
*/

import jwt from "jsonwebtoken";

const authMiddleware = (req, res, next) => {

    // Get the Authorization header.
    const authHeader = req.headers.authorization;

    // Verify that the header exists.
    if (!authHeader) {

        // Return an authentication error.
        return res.status(401).json({
            message: "Access token is required"
        });

    }

    // Extract the JWT token from the header.
    const token = authHeader.split(" ")[1];

    // Verify that the token exists.
    if (!token) {

        // Return an authentication error.
        return res.status(401).json({
            message: "Invalid token"
        });

    }

    try {

        // Verify and decode the JWT token.
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        // Store the user information
        // for the next middleware.
        req.user = decoded;

        // Continue to the next middleware.
        next();

    } catch (error) {

        // Return an authentication error.
        return res.status(401).json({
            message: "Token is invalid or expired"
        });

    }

};

export default authMiddleware;