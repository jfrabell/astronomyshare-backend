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


// === REGISTRATION ROUTE ===
router.post('/register', async (req, res) => {
    console.log("[API Router] POST /register - Request received");
    const { uname, email, pwrd } = req.body;

    // --- Validation ---
    if (!uname || !email || !pwrd) {
        // *** CHANGED RESPONSE ***
        return res.status(400).json({ errorCode: 'API_AUTH_MISSING_FIELDS' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
         // *** CHANGED RESPONSE ***
        return res.status(400).json({ errorCode: 'API_AUTH_INVALID_EMAIL_FORMAT' });
    }
    const minPasswordLength = 8;
    if (pwrd.length < minPasswordLength) {
         // *** CHANGED RESPONSE ***
         // Note: Frontend already checks this, but good to have backend validation too.
         // The frontend won't easily be able to use the {{min}} interpolation from here though.
         // Sending the code is better, frontend can handle displaying the specific length rule.
        return res.status(400).json({ errorCode: 'API_AUTH_PASSWORD_TOO_SHORT' });
    }
    // --- End Validation ---
    // -- TODO: Sanitize User inputs --

    try {
        console.log("TRY_BLOCK: Entered main try block."); // <-- ADD
        // Check if username or email already exists
        const checkUserSql = "SELECT id, uname, email FROM user WHERE uname = ? OR email = ?";
        console.log("TRY_BLOCK: About to check existing user."); // <-- ADD
        const [existingUsers] = await dbPool.execute(checkUserSql, [uname, email]);
        console.log(`TRY_BLOCK: Existing user check completed. Found: ${existingUsers.length}`); // <-- ADD

        if (existingUsers.length > 0) {
            console.log("TRY_BLOCK: User/Email already exists."); // <-- ADD
            if (existingUsers[0].uname === uname) {
                return res.status(409).json({ errorCode: 'API_AUTH_USERNAME_TAKEN' });
            } else {
                return res.status(409).json({ errorCode: 'API_AUTH_EMAIL_TAKEN' });
            }
        }

        // User does not exist, hash password
        console.log("TRY_BLOCK: About to hash password."); // <-- ADD
        // --- Ensure bcrypt and saltRounds are defined ---
        if (typeof bcrypt === 'undefined' || typeof saltRounds === 'undefined') { throw new Error("bcrypt or saltRounds not defined!"); }
        const hashedPassword = await bcrypt.hash(pwrd, saltRounds);
        console.log("TRY_BLOCK: Password hashed."); // <-- ADD

        // Insert the new user
        const defaultQuota = 1073741824;
        const usedQuota = 0;
        const insertUserSql = "INSERT INTO user (uname, email, pwrd, upload_quota, used_quota) VALUES (?, ?, ?, ?, ?)";
        console.log("TRY_BLOCK: About to insert user."); // <-- ADD
        const [insertResult] = await dbPool.execute(insertUserSql, [uname, email, hashedPassword, defaultQuota, usedQuota]);
        const newUserId = insertResult.insertId;
        console.log("[API Router /register] New user inserted:", uname, "ID:", newUserId); // Keep original log

        // --- START VERIFICATION LOGIC ---
        console.log("TRY_BLOCK: Starting verification logic."); // <-- ADD
        // --- Ensure crypto is defined ---
        if (typeof crypto === 'undefined') { throw new Error("crypto module not defined!"); }
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const storeTokenSql = "UPDATE user SET verificationToken = ?, verificationTokenExpires = ? WHERE id = ?";
        console.log("TRY_BLOCK: About to store verification token."); // <-- ADD
        await dbPool.execute(storeTokenSql, [verificationToken, verificationTokenExpires, newUserId]);
        console.log(`[API Router /register] Verification token stored for user ID: ${newUserId}`); // Keep original log

        // --- Send Email ---
        console.log("TRY_BLOCK: Preparing to send email."); // <-- ADD
        // --- Ensure APP_BASE_URL is defined ---
        if (!process.env.APP_BASE_URL) { throw new Error("APP_BASE_URL environment variable not set!");}
        const verificationLink = `${process.env.APP_BASE_URL}/api/verify-email?token=${verificationToken}`;
        try {
            console.log(`[API Router /register] Attempting to send verification email to ${email}`); // Keep original log
            // --- Ensure sendEmail function is defined ---
            if (typeof sendEmail === 'undefined') { throw new Error("sendEmail function not defined!"); }

            await sendEmail({
                to: email,
                subject: 'Verify Your AstronomyShare Account',
                text: `Welcome! Please verify your email by clicking this link: ${verificationLink}`,
                html: `<p>Welcome!</p><p>Please verify your email by clicking this link:</p><p><a href="${verificationLink}">Verify Account</a></p><p>Link: ${verificationLink}</p>`
            });

            console.log(`[API Router /register] Verification email queued for ${email}`); // Keep original log
        } catch (emailError) {
            console.error(`[API Router /register] CRITICAL: Failed to send verification email to ${email}`, emailError);
            // Continue even if email fails
        }
        // --- END OF EMAIL SENDING SECTION ---

        // --- Success Response ---
        console.log("TRY_BLOCK: Reaching final success return."); // <-- ADD
        return res.status(201).json({
            messageCode: 'API_AUTH_REGISTRATION_SUCCESS_VERIFY_EMAIL'
        });

    } catch (error) { // Catch errors from DB queries or bcrypt
        // --- Ensure this logs the FULL error object ---
        console.error("[API Router /register] Error during registration process (in CATCH block):", error); // <-- Log full error
        // Ensure headers aren't already sent before sending response
        if (!res.headersSent) {
             return res.status(500).json({ errorCode: 'API_SERVER_ERROR_GENERIC' });
        } else {
             console.error("[API Router /register] Headers already sent, could not send 500 error response.");
        }
    }
}); // End POST /register


router.get('/verify-email', async (req, res) => {
    console.log("[API Router] GET /verify-email - Request received");
    const { token } = req.query; // Get token from query parameter ?token=...

    if (!token) {
        console.log("[API Router /verify-email] No token provided.");
        // TODO: Redirect to a frontend error page or show generic message
        // *** CHANGED RESPONSE ***
        return res.status(400).json({ errorCode: 'API_AUTH_TOKEN_MISSING' });
    }

    console.log(`[API Router /verify-email] Received token: ${token}`);

    try {
        // 1. Find user by token, ensuring they are not already verified
        const findUserSql = "SELECT id, verificationTokenExpires FROM user WHERE verificationToken = ? AND isVerified = 0";
        const [users] = await dbPool.execute(findUserSql, [token]);

        if (users.length === 0) {
            console.log(`[API Router /verify-email] Invalid or already used token: ${token}`);
            // TODO: Redirect to an frontend error page (invalid token)
            // *** CHANGED RESPONSE (Use same code for invalid/expired) ***
            return res.status(400).json({ errorCode: 'API_AUTH_TOKEN_INVALID_OR_EXPIRED' });
        }

        const user = users[0];
        const expires = user.verificationTokenExpires;

        // 2. Check if token is expired
        if (expires < new Date()) {
            console.log(`[API Router /verify-email] Expired token for user ID: ${user.id}`);
            // TODO: Optionally, delete the expired token here or implement resend logic
            // TODO: Redirect to an frontend error page (expired token)
            // *** CHANGED RESPONSE (Use same code for invalid/expired) ***
            return res.status(400).json({ errorCode: 'API_AUTH_TOKEN_INVALID_OR_EXPIRED' });
        }

        // 3. Token is valid and not expired - Mark user as verified
        console.log(`[API Router /verify-email] Valid token. Verifying user ID: ${user.id}`);
        const verifyUserSql = "UPDATE user SET isVerified = 1, verificationToken = NULL, verificationTokenExpires = NULL WHERE id = ?";
        await dbPool.execute(verifyUserSql, [user.id]);

        console.log(`[API Router /verify-email] User ID: ${user.id} successfully verified.`);

        // --- Success Redirect (Remains Unchanged) ---
        // This redirects the user's BROWSER to the login page, where the
        // frontend Login.js component will see "?verified=true" and display its message.
        // No JSON body needed here.
        return res.redirect('/login?verified=true');

    } catch (error) { // Catch errors from DB queries
        console.error("[API Router /verify-email] Error during verification process:", error);
        // TODO: Redirect to a generic error page on frontend
        // *** CHANGED RESPONSE ***
        return res.status(500).json({ errorCode: 'API_SERVER_ERROR_GENERIC' });
    }
}); // End GET /verify-email

router.post('/forgot-password', async (req, res) => {
    console.log("[API Router] POST /forgot-password - Request received");
    const { email } = req.body;

    // --- Validation ---
    if (!email) {
        // *** CHANGED RESPONSE ***
        return res.status(400).json({ errorCode: 'API_AUTH_MISSING_FIELDS' });
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        // For security, don't tell the user the format was invalid.
        // Log it server-side but return the generic success response anyway.
        console.log(`[API Router /forgot-password] Invalid email format received: ${email}, sending generic success response.`);
        // *** CHANGED RESPONSE (use messageCode) ***
        return res.status(200).json({ messageCode: 'API_AUTH_FORGOT_PASSWORD_SENT' });
    }
    // --- End Validation ---

    try {
        // 1. Find user by email - Make sure they are also verified!
        const findUserSql = "SELECT id, email, isVerified, uname FROM user WHERE email = ?";
        const [users] = await dbPool.execute(findUserSql, [email]);

        // 2. Handle User Found & Verified Scenario
        if (users.length > 0 && users[0].isVerified) {
            const user = users[0];
            console.log(`[API Router /forgot-password] Verified user found for email ${email}. ID: ${user.id}`);

            // Generate, store token, and send email (existing logic is good)
            const resetToken = crypto.randomBytes(32).toString('hex');
            const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
            const storeTokenSql = "UPDATE user SET passwordResetToken = ?, passwordResetTokenExpires = ? WHERE id = ?";
            await dbPool.execute(storeTokenSql, [resetToken, resetTokenExpires, user.id]);
            console.log(`[API Router /forgot-password] Password reset token stored for user ID: ${user.id}`);

            const resetLink = `${process.env.APP_BASE_URL}/reset-password?token=${resetToken}`;

            try {
                await sendEmail({ 
        // This handles both string and array, but for transactional, 'to' should be a string
        to: email,
        subject: 'Reset your password at AstronomyShare.com',
        text: `You requested a password rest.  Please do so by clicking this link: ${resetLink}`,
        html: `<p>Hello from Astronomyshare.com!</p><p>Please do so by clicking this link:</p><p><a href="${resetLink}">Change my password</a></p><p>Link: ${resetLink}</p>`

                 }); // Your existing email sending logic
                console.log(`[API Router /forgot-password] Password reset email queued via Mailgun for ${email}`);
            } catch (emailError) {
                console.error(`[API Router /forgot-password] CRITICAL: Failed to send password reset email to ${email} for user ID ${user.id}`, emailError);
                // Log error, but proceed to generic success response
            }
        } else if (users.length > 0 && !users[0].isVerified) {
            // User found but email not verified - DO NOTHING, send generic success
            console.log(`[API Router /forgot-password] Request received for unverified email: ${email}, sending generic success response.`);
        } else {
            // User not found - DO NOTHING, send generic success
            console.log(`[API Router /forgot-password] No user found for email: ${email}, sending generic success response.`);
        }

        // --- Generic Success Response ---
        // SECURITY: Always send this generic response unless input validation failed (e.g., missing email)
        // *** CHANGED RESPONSE (use messageCode) ***
        return res.status(200).json({ messageCode: 'API_AUTH_FORGOT_PASSWORD_SENT' });

    } catch (error) {
        console.error("[API Router /forgot-password] Error during process:", error);
        // SECURITY: Send generic success response even on server error for this specific flow.
        // Log the actual error server-side for debugging.
        // *** CHANGED RESPONSE (use messageCode) ***
        return res.status(200).json({ messageCode: 'API_AUTH_FORGOT_PASSWORD_SENT' });
        // If you preferred to send a 500:
        // return res.status(500).json({ errorCode: 'API_SERVER_ERROR_GENERIC' });
    }
}); // End POST /forgot-password

// routes/auth.js (or similar)

// Assuming requires for express, router, bcrypt, dbPool, crypto are above
// Assuming saltRounds is defined

router.post('/reset-password', async (req, res) => {
    console.log("[API Router] POST /reset-password - Request received");
    const { token, newPassword } = req.body;

    // 1. Basic Input Validation
    if (!token || !newPassword) {
        // *** CHANGED RESPONSE ***
        return res.status(400).json({ errorCode: 'API_AUTH_MISSING_FIELDS' });
    }

    const minPasswordLength = 8; // Ensure this matches frontend validation
    if (newPassword.length < minPasswordLength) {
        // *** CHANGED RESPONSE ***
        return res.status(400).json({ errorCode: 'API_AUTH_PASSWORD_TOO_SHORT' });
    }
    // Add other password complexity rules here if you have them

    try {
        // 2. Find user by the non-expired password reset token
        // We select expiry just to confirm row exists and then check date in code
        const findUserSql = "SELECT id, passwordResetTokenExpires FROM user WHERE passwordResetToken = ?";
        const [users] = await dbPool.execute(findUserSql, [token]);

        // 3. Validate Token Existence
        if (users.length === 0) {
            console.log(`[API Router /reset-password] Invalid or already used token received.`);
            // *** CHANGED RESPONSE (Use consistent invalid/expired code) ***
            return res.status(400).json({ errorCode: 'API_AUTH_TOKEN_INVALID_OR_EXPIRED' });
        }

        const user = users[0];
        const expires = user.passwordResetTokenExpires;

        // 4. Validate Token Expiry
        if (!expires || expires < new Date()) {
            console.log(`[API Router /reset-password] Expired token received for user ID: ${user.id}`);
            // *** CHANGED RESPONSE (Use consistent invalid/expired code) ***
            return res.status(400).json({ errorCode: 'API_AUTH_TOKEN_INVALID_OR_EXPIRED' });
        }

        // --- Token is valid and not expired ---

        // 5. Hash the new password
        console.log(`[API Router /reset-password] Valid token. Resetting password for user ID: ${user.id}`);
        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

        // 6. Update user's password and clear the reset token fields in DB
        const updateUserSql = "UPDATE user SET pwrd = ?, passwordResetToken = NULL, passwordResetTokenExpires = NULL WHERE id = ?";
        await dbPool.execute(updateUserSql, [hashedNewPassword, user.id]);

        console.log(`[API Router /reset-password] Password successfully reset for user ID: ${user.id}`);

        // 7. Send success response
        // *** CHANGED RESPONSE (Use messageCode) ***
        return res.status(200).json({ messageCode: 'API_AUTH_PASSWORD_RESET_SUCCESS' });

    } catch (error) {
        console.error("[API Router /reset-password] Error during password reset process:", error);
        // *** CHANGED RESPONSE ***
        return res.status(500).json({ errorCode: 'API_SERVER_ERROR_GENERIC' });
    }
}); // End POST /reset-password

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