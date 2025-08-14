// src/auth0handler.js 

const express = require('express');
const serverless = require('serverless-http');
const dbPool = require('./db');
const { userPool } = require('./cognito-config');


const app = express();
app.use(express.json());


// === LOGIN ROUTE ===
app.post('/login', async (req, res) => {
    console.log("[API Router] POST /login - Request received");

    try {
        // You no longer fetch or check passwords
        // DB calls can be for user info only if needed

        return res.status(501).json({ 
            message: "Login logic now handled by Cognito. Backend password checks removed."
        });

    } catch (error) {
        console.error("[API Router /login] Error during login process:", error);
        return res.status(500).json({ errorCode: 'API_SERVER_ERROR_GENERIC' });
    }
});


app.post('/register', async (req, res) => {
    console.log("[API Router] POST /register - Request received");

    const { uname, email, given_name, pwrd } = req.body;

    // --- Validation ---
    if (!uname || !email || !pwrd || !given_name) {
        return res.status(400).json({ errorCode: 'API_AUTH_MISSING_FIELDS' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ errorCode: 'API_AUTH_INVALID_EMAIL_FORMAT' });
    }

    if (pwrd.length < 8) {
        return res.status(400).json({ errorCode: 'API_AUTH_PASSWORD_TOO_SHORT' });
    }

    try {
        // --- 1️⃣ Signup in Cognito ---
        const cognitoResult = await new Promise((resolve, reject) => {
            userPool.signUp(
                uname,
                pwrd,
                [
                    { Name: 'email', Value: email },
                    { Name: 'given_name', Value: given_name }
                ],
                null,
                (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                }
            );
        });

        console.log("[Register] Cognito signup successful!", cognitoResult);

        // --- 2️⃣ Check for existing DB user (optional but safe) ---
        const checkUserSql = "SELECT id FROM user WHERE uname = ? OR email = ?";
        const [existingUsers] = await dbPool.execute(checkUserSql, [uname, email]);
        if (existingUsers.length > 0) {
            return res.status(409).json({ errorCode: 'API_AUTH_USER_ALREADY_EXISTS' });
        }

        // --- 3️⃣ Insert into DB AFTER Cognito succeeds ---
        const defaultQuota = 1073741824;
        const usedQuota = 0;
        const insertUserSql = `
            INSERT INTO user (uname, email, given_name, cognito_sub, upload_quota, used_quota)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        await dbPool.execute(insertUserSql, [uname, email, given_name, cognitoResult.userSub, defaultQuota, usedQuota]);

        // --- 5️⃣ Success response ---
        return res.status(201).json({ messageCode: 'API_AUTH_REGISTRATION_SUCCESS_VERIFY_EMAIL' });

    } catch (error) {
        console.error("[API Router /register] Error:", error);
        const errorCode = error.code || 'API_SERVER_ERROR_GENERIC';
        return res.status(500).json({ errorCode });
    }
});

module.exports.handler = serverless(app);
