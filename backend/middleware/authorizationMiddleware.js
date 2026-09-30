/*
========================================
This middleware checks whether
the authenticated user has the
required role to access a route.

It compares the user's role with
the allowed roles defined for
the current endpoint.

Used after:
- authenticationMiddleware
========================================
*/

const authorize = (...allowedRoles) => {

    return (req, res, next) => {

        // Check whether the user's role is allowed.
        if (!allowedRoles.includes(req.user.role)) {

            // Return an authorization error.
            return res.status(403).json({
                message: "Access denied"
            });

        }

        // Continue to the next middleware or route.
        next();

    };

};

export default authorize;