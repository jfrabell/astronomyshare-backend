// backend/register-rollback-handler.js

const { CognitoIdentityServiceProviderClient, AdminDeleteUserCommand } = require("@aws-sdk/client-cognito-identity-provider");

const client = new CognitoIdentityServiceProviderClient({});

// Define CORS headers. Best practice is to use an environment variable for the origin in production.
const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.FRONTEND_URL || 'http://localhost:3000',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
};

exports.handler = async (event) => {
    // Handle CORS preflight requests sent by the browser
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Invalid JSON body' }) };
    }

    const { username } = body;

    if (!username) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Username is required for rollback.' }) };
    }

    const command = new AdminDeleteUserCommand({
        UserPoolId: process.env.REACT_APP_COGNITO_USER_POOL_ID, // Ensure this env var is available to the Lambda
        Username: username

    });

    try {
        // Use the AWS SDK v3 client to send the command
        await client.send(command);
        console.log(`Successfully rolled back and deleted Cognito user: ${username}`);
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Cognito user successfully deleted.' }) };
    } catch (error) {
        console.error(`CRITICAL: Failed to delete Cognito user ${username}:`, error);
        // This is a critical error. The user is now an orphan. This should be monitored.
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Failed to rollback Cognito user.' }) };
    }
};