// login-handler.js
const dbPool = require('../shared/db');

// In a real application, you would use a robust library like 'aws-jwt-verify'
// to securely validate the token from Cognito. For this example, we'll assume
// you have a utility function that does this. The key is that this handler
// receives a TOKEN, not a password.
// const { verifyCognitoToken } = require('./utils/auth');

const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.FRONTEND_URL || 'http://localhost:3000',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
};

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    try {
        // This is a placeholder for actual JWT verification.
        // The verifier would check the token's signature and expiration,
        // and throw an error if it's invalid.
        const tokenPayload = { sub: "placeholder-cognito-sub" }; // Replace with real verification
        // const token = event.headers.Authorization?.split(' ')[1];
        // if (!token) {
        //     return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ errorCode: 'API_AUTH_TOKEN_MISSING' }) };
        // }
        // const tokenPayload = await verifyCognitoToken(token);

        const cognitoSub = tokenPayload.sub;

        // Now that the user is authenticated, perform a backend action.
        // For example, update their last login timestamp.
        const [result] = await dbPool.execute(
            "UPDATE user SET last_login_at = NOW() WHERE cognito_sub = ?",
            [cognitoSub]
        );

        if (result.affectedRows === 0) {
            // This case is unlikely if registration works, but good to handle.
            console.warn(`Login hook failed: No user found in DB for cognito_sub: ${cognitoSub}`);
            return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ errorCode: 'API_USER_NOT_FOUND' }) };
        }

        console.log(`Successfully updated last_login_at for user with sub: ${cognitoSub}`);
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Login hook successful.' }) };

    } catch (err) {
        console.error("Login handler error:", err);
        // A real JWT verifier would throw specific errors for invalid/expired tokens
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ errorCode: 'API_SERVER_ERROR_GENERIC' }) };
    }
};
