// register-handler function, file name index.js
const dbPool = require('../shared/db');
const { CognitoIdentityServiceProviderClient, AdminCreateUserCommand } = require("@aws-sdk/client-cognito-identity-provider");

// Define CORS headers. Best practice is to use an environment variable for the origin in production.
const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.FRONTEND_URL || 'http://localhost:3000',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
};

const cognitoClient = new CognitoIdentityServiceProviderClient({});

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

    const { uname, email, given_name, pwrd } = body;

    // --- Validation ---
    if (!uname || !email || !given_name || !pwrd) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ errorCode: 'API_AUTH_MISSING_FIELDS' }) };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ errorCode: 'API_AUTH_INVALID_EMAIL_FORMAT' }) };
    }

    // --- Check DB for duplicate username ---
    const [existingUserByUname] = await dbPool.execute(
      "SELECT id FROM user WHERE uname = ?",
      [uname]
    );
    if (existingUserByUname.length > 0) {
      return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ errorCode: 'API_AUTH_USERNAME_TAKEN' }) };
    }

    // --- Check DB for duplicate email ---
    const [existingUserByEmail] = await dbPool.execute(
      "SELECT id FROM user WHERE email = ?",
      [email]
    );
    if (existingUserByEmail.length > 0) {
      return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ errorCode: 'API_AUTH_EMAIL_TAKEN' }) };
    }

    // --- Atomic Registration Process ---
    let cognito_sub; // This will hold the new user's sub from Cognito
    let dbUserCreated = false;

    try {
      // Step 1: Create the Cognito User
      const createUserCommand = new AdminCreateUserCommand({
        UserPoolId: process.env.REACT_APP_COGNITO_USER_POOL_ID,
        Username: uname,
        TemporaryPassword: pwrd,
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "given_name", Value: given_name },
          { Name: "email_verified", Value: "true" } // We control this flow, so we can consider it verified
        ],
        MessageAction: "SUPPRESS" // We will handle our own welcome/verification email logic if needed
      });

      const cognitoResponse = await cognitoClient.send(createUserCommand);
      cognito_sub = cognitoResponse.User.Attributes.find(attr => attr.Name === 'sub').Value;

      if (!cognito_sub) {
        // This should theoretically not happen if the user creation was successful
        throw new Error("Cognito user created but sub not found.");
      }

      // Step 2: Insert user into our RDS database
      const defaultQuota = 1073741824;
      const usedQuota = 0;
      await dbPool.execute(
        `INSERT INTO user (uname, email, given_name, cognito_sub, upload_quota, used_quota)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uname, email, given_name, cognito_sub, defaultQuota, usedQuota]
      );
      dbUserCreated = true; // Mark DB user as created

      // If both succeed, return success
      return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ messageCode: 'API_AUTH_REGISTRATION_SUCCESS_VERIFY_EMAIL' }) };

    } catch (err) {
      console.error("Registration failed, attempting rollback if necessary.", err);
      // If Cognito user was created but DB insert failed, we must roll back Cognito.
      if (cognito_sub && !dbUserCreated) {
          console.log(`Cognito user ${uname} was created, but DB insert failed. Rolling back Cognito user.`);
          // Call the rollback handler logic directly or invoke it
          const rollbackCommand = new AdminDeleteUserCommand({ UserPoolId: process.env.REACT_APP_COGNITO_USER_POOL_ID, Username: uname });
          await cognitoClient.send(rollbackCommand);
          console.log(`Successfully rolled back Cognito user ${uname}.`);
      }
      // Return a generic server error to the client
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ errorCode: 'API_SERVER_ERROR_GENERIC' }) };
    }
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ errorCode: err.code || 'API_SERVER_ERROR_GENERIC' }) };
  }
};
