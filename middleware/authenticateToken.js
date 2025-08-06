// middleware/authenticateToken.js
const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
    console.log('[Auth Middleware] Checking token...');

    // Get token from the Authorization header
    // Format is usually: "Bearer TOKEN_STRING"
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Extract the token part

    // If no token is present in the header
    if (token == null) {
        console.log('[Auth Middleware] No token found in Authorization header.');
        // 401 Unauthorized - Authentication credentials missing
        return res.status(401).json({ errorCode: 'API_AUTH_FORBIDDEN' }); // Needs key in locales
    }

    // Verify the token
    jwt.verify(token, process.env.JWT_SECRET, (err, decodedPayload) => {
        // Check for errors during verification (expired, invalid signature etc.)
        if (err) {
            console.error('[Auth Middleware] Token verification failed:', err.message);
            // 403 Forbidden - Client has credentials but they are invalid/insufficient
            return res.status(403).json({ errorCode: 'API_AUTH_TOKEN_INVALID_OR_EXPIRED' });
        }

        // --- Token is valid! ---
        // The decodedPayload contains { userId: ..., username: ... } (from when you signed it)
        console.log('[Auth Middleware] Token verified successfully. Payload:', decodedPayload);

        // Attach the decoded payload to the request object for later use in route handlers
        // A common convention is to attach it to 'req.user'
        req.user = decodedPayload;
        req.userName = decodedPayload.username,
        req.is_admin = decodedPayload.is_admin // <<< Extract is_admin

        // Pass control to the next middleware or the actual route handler
        next();
    });
}

// Export the middleware function so it can be required elsewhere
module.exports = authenticateToken;