/*
========================================
Middleware responsible for user authorization
based on roles.

The middleware checks whether the authenticated
user has permission to access a specific route.

If the user's role is allowed, the request
proceeds to the next step. Otherwise, access
is denied.
========================================
*/

const authorize = (...allowedRoles) => {

    return (req, res, next) => {

        // Check if the user's role is allowed.
        if (!allowedRoles.includes(req.user.role)) {

            return res.status(403).json({
                message: "Access denied"
            });

        }

        // Continue to the next middleware or route.
        next();

    };

};

export default authorize;