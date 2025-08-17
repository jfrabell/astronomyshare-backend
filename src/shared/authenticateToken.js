// middleware/authenticateToken.js
const jwt = require('jsonwebtoken');

// This is no longer Express middleware, but a helper function
const authenticateToken = (event) => {
    const authHeader = event.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token == null) {
        throw { statusCode: 401, errorCode: 'API_AUTH_TOKEN_MISSING' }; // 401 Unauthorized
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return decoded; // Return the user payload
    } catch (err) {
        throw { statusCode: 403, errorCode: 'API_AUTH_TOKEN_INVALID' }; // 403 Forbidden
    }
};

module.exports = { authenticateToken };