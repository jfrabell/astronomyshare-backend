// auth-handler.js
const dbPool = require('./db');
const { userPool } = require('./cognito-config');

console.log("Cognito UserPoolId:", process.env.REACT_APP_COGNITO_USER_POOL_ID);
console.log("Cognito ClientId:", process.env.REACT_APP_COGNITO_CLIENT_ID);

exports.handler = async (event) => {
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
    if (!uname || !email || !pwrd || !given_name) {
      return { statusCode: 400, body: JSON.stringify({ errorCode: 'API_AUTH_MISSING_FIELDS' }) };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { statusCode: 400, body: JSON.stringify({ errorCode: 'API_AUTH_INVALID_EMAIL_FORMAT' }) };
    }

    if (pwrd.length < 8) {
      return { statusCode: 400, body: JSON.stringify({ errorCode: 'API_AUTH_PASSWORD_TOO_SHORT' }) };
    }

    // --- Cognito signup ---
    //const cognitoResult = await new Promise((resolve, reject) => {
    //  userPool.signUp(
    //    uname,
    //    pwrd,
    //    [
    //      { Name: 'email', Value: email },
    //      { Name: 'given_name', Value: given_name }
    //    ],
    //    null,
    //    (err, result) => (err ? reject(err) : resolve(result))
    //  );
    //});

    // --- Check DB duplicate ---
    const [existingUsers] = await dbPool.execute(
      "SELECT id FROM user WHERE uname = ? OR email = ?",
      [uname, email]
    );
    if (existingUsers.length > 0) {
      return { statusCode: 409, body: JSON.stringify({ errorCode: 'API_AUTH_USER_ALREADY_EXISTS' }) };
    }

    // --- Insert DB ---
    const defaultQuota = 1073741824;
    const usedQuota = 0;
    await dbPool.execute(
      `INSERT INTO user (uname, email, given_name, cognito_sub, upload_quota, used_quota)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uname, email, given_name, cognitoResult.userSub, defaultQuota, usedQuota]
    );

    return { statusCode: 201, body: JSON.stringify({ messageCode: 'API_AUTH_REGISTRATION_SUCCESS_VERIFY_EMAIL' }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ errorCode: err.code || 'API_SERVER_ERROR_GENERIC' }) };
  }
};
