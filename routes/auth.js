// src/routes/auth.js (REVISED - Promise/Async Style)
const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { sendEmail } = require('../services/emailService');
const dbPool = require('../db'); // Use pool, renamed variable for clarity
const authenticateToken = require('../middleware/authenticateToken'); // Adjust path as needed
const router = express.Router();
const saltRounds = 10;

// === LOGIN ROUTE ===
router.post('/login', async (req, res) => { // Make handler async
    console.log("[API Router] POST /login - Request received");
    const { username, password } = req.body; // 'username' corresponds to uname in DB

    // Validation
    if (!username || !password) {
        // *** CHANGED RESPONSE ***
        return res.status(400).json({ errorCode: 'API_AUTH_MISSING_FIELDS' });
    }

    try {
        // Find User by Username
        const findUserSql = "SELECT id, uname, pwrd, isVerified, is_admin FROM user WHERE uname = ?";
        const [results] = await dbPool.execute(findUserSql, [username]);

        // Handle User Not Found OR Password Mismatch (Combined for security)
        // Check if user exists first
        if (results.length === 0) {
            console.log(`[API Router /login] Login attempt failed: User not found for identifier "${username}"`);
            // *** CHANGED RESPONSE (Use generic invalid credentials) ***
            return res.status(401).json({ errorCode: 'API_AUTH_INVALID_CREDENTIALS' }); // 401 Unauthorized
        }

        // User Found - Proceed to check password and verification
        const user = results[0];
        const storedHash = user.pwrd;

        // Check if Verified (BEFORE checking password hash)
        if (!user.isVerified) {
            console.warn(`[API Router /login] Login attempt BLOCKED for unverified user: ${user.uname} (ID: ${user.id})`);
            // *** CHANGED RESPONSE ***
            return res.status(403).json({ errorCode: 'API_AUTH_ACCOUNT_NOT_VERIFIED' }); // 403 Forbidden
        }

        // Compare submitted password with stored hash
        const isMatch = await bcrypt.compare(password, storedHash);

        // Handle Password Mismatch
        if (!isMatch) {
            console.log(`[API Router /login] Login attempt failed: Incorrect password for user "${user.uname}"`);
             // *** CHANGED RESPONSE (Use generic invalid credentials) ***
            return res.status(401).json({ errorCode: 'API_AUTH_INVALID_CREDENTIALS' }); // 401 Unauthorized
        }

        // --- Passwords Match & User Verified! ---
        console.log(`[API Router /login] Login successful for user "${user.uname}" (ID: ${user.id})`);

        // Create JWT payload
        const payload = {
            userId: user.id,
            username: user.uname,
            is_admin: user.is_admin
        };
        const secretKey = process.env.JWT_SECRET;
        if (!secretKey) {
            console.error("FATAL ERROR: JWT_SECRET is not defined!");
            // *** CHANGED RESPONSE ***
            return res.status(500).json({ errorCode: 'API_SERVER_ERROR_GENERIC' }); // Use generic server error
        }
        const options = { expiresIn: '1h' };
        const token = jwt.sign(payload, secretKey, options);

        // --- Success Response ---
        // *** CHANGED RESPONSE (Removed message, only send token) ***
        return res.status(200).json({ token: token });

    } catch (error) { // Catch errors from DB query or bcrypt
        console.error("[API Router /login] Error during login process:", error);
        // *** CHANGED RESPONSE ***
        return res.status(500).json({ errorCode: 'API_SERVER_ERROR_GENERIC' });
    }
}); // End POST /login


router.post('/register', async (req, res) => {
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

        // --- 4️⃣ Optional: Send verification email (if not relying on Cognito's built-in email verification) ---
        // const verificationToken = crypto.randomBytes(32).toString('hex');
        // ... store token, send email ...

        // --- 5️⃣ Success response ---
        return res.status(201).json({ messageCode: 'API_AUTH_REGISTRATION_SUCCESS_VERIFY_EMAIL' });

    } catch (error) {
        console.error("[API Router /register] Error:", error);
        const errorCode = error.code || 'API_SERVER_ERROR_GENERIC';
        return res.status(500).json({ errorCode });
    }
});



router.get('/quota-status', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    try {
        const sql = "SELECT used_quota, upload_quota FROM user WHERE id = ?";
        const [results] = await dbPool.execute(sql, [userId]);
        if (results.length === 0) {
            return res.status(404).json({ errorCode: 'API_USER_NOT_FOUND' }); // Need this code
        }
        const quota = {
            used: parseInt(results[0].used_quota, 10) || 0,
            allowed: parseInt(results[0].upload_quota, 10) || 0
        };
        res.status(200).json(quota);
    } catch (error) {
        console.error(`Error fetching quota for user ${userId}:`, error);
        res.status(500).json({ errorCode: 'API_SERVER_ERROR_GENERIC' });
    }
});

module.exports = router;