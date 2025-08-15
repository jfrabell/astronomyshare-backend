// auth-handler.js
const dbPool = require('./db');
const { userPool } = require('./cognito-config');

console.log("Cognito UserPoolId:", process.env.REACT_APP_COGNITO_USER_POOL_ID);
console.log("Cognito ClientId:", process.env.REACT_APP_COGNITO_CLIENT_ID);

// Define CORS headers. Best practice is to use an environment variable for the origin in production.
const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.FRONTEND_URL || 'http://localhost:3000',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
};

exports.handler = async (event) => {
  // Handle CORS preflight requests sent by the browser
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ''
    };
  }

  try {

    console.log("Event received by Lambda:", JSON.stringify(event, null, 2));

   
    let body;
if (typeof event.body === "string") {
  body = JSON.parse(event.body);
} else {
  body = event.body;
}

    // The password (pwrd) is handled by Cognito and is not needed here.
    const { uname, email, given_name, cognito_sub } = body;

    // --- Validation ---
    if (!uname || !email || !given_name || !cognito_sub) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ errorCode: 'API_AUTH_MISSING_FIELDS' }) };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ errorCode: 'API_AUTH_INVALID_EMAIL_FORMAT' }) };
    }

    // --- Check DB duplicate ---
    const [existingUsers] = await dbPool.execute(
      "SELECT id FROM user WHERE uname = ? OR email = ?",
      [uname, email]
    );
    if (existingUsers.length > 0) {
      return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ errorCode: 'API_AUTH_USER_ALREADY_EXISTS' }) };
    }

    // --- Insert DB ---
    const defaultQuota = 1073741824;
    const usedQuota = 0;
    await dbPool.execute(
      `INSERT INTO user (uname, email, given_name, cognito_sub, upload_quota, used_quota)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uname, email, given_name, cognito_sub, defaultQuota, usedQuota]
    );

    return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ messageCode: 'API_AUTH_REGISTRATION_SUCCESS_VERIFY_EMAIL' }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ errorCode: err.code || 'API_SERVER_ERROR_GENERIC' }) };
  }
};
