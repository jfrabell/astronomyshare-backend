// backend/auth-handler.js
//adding a comment to rebuild the whole damn thing.

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { sendEmail } = require('./services/emailService');
const dbPool = require('./db');
const { authenticateToken } = require('./middleware/authenticateToken'); // We'll refactor this helper
const saltRounds = 10;

// --- INDIVIDUAL ROUTE HANDLERS ---

const login = async (event) => {
  const { username, password } = JSON.parse(event.body);
  if (!username || !password) {
    // In Lambda, we throw errors and let the main handler catch them
    throw { statusCode: 400, errorCode: 'API_AUTH_MISSING_FIELDS' };
  }

  const findUserSql = "SELECT id, uname, pwrd, isVerified, is_admin FROM user WHERE uname = ?";
  const [results] = await dbPool.execute(findUserSql, [username]);

  if (results.length === 0) {
    throw { statusCode: 401, errorCode: 'API_AUTH_INVALID_CREDENTIALS' };
  }

  const user = results[0];
  if (!user.isVerified) {
    throw { statusCode: 403, errorCode: 'API_AUTH_ACCOUNT_NOT_VERIFIED' };
  }

  const isMatch = await bcrypt.compare(password, user.pwrd);
  if (!isMatch) {
    throw { statusCode: 401, errorCode: 'API_AUTH_INVALID_CREDENTIALS' };
  }

  const payload = { userId: user.id, username: user.uname, is_admin: user.is_admin };
  const secretKey = process.env.JWT_SECRET;
  if (!secretKey) {
    throw { statusCode: 500, errorCode: 'API_SERVER_ERROR_GENERIC' };
  }
  const token = jwt.sign(payload, secretKey, { expiresIn: '1h' });

  return { token: token }; // Return the payload for the success response
};

const register = async (event) => {
    const { uname, email, pwrd } = JSON.parse(event.body);

    // --- Full Validation ---
    if (!uname || !email || !pwrd) {
        throw { statusCode: 400, errorCode: 'API_AUTH_MISSING_FIELDS' };
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw { statusCode: 400, errorCode: 'API_AUTH_INVALID_EMAIL_FORMAT' };
    }
    if (pwrd.length < 8) {
        throw { statusCode: 400, errorCode: 'API_AUTH_PASSWORD_TOO_SHORT' };
    }

    // --- Check for existing user (Corrected Logic) ---
    const checkUserSql = "SELECT uname, email FROM user WHERE uname = ? OR email = ?";
    const [existingUsers] = await dbPool.execute(checkUserSql, [uname, email]);

    if (existingUsers.length > 0) {
        if (existingUsers[0].uname === uname) {
            throw { statusCode: 409, errorCode: 'API_AUTH_USERNAME_TAKEN' };
        } else {
            throw { statusCode: 409, errorCode: 'API_AUTH_EMAIL_TAKEN' };
        }
    }

    // --- Hash password and insert user (Corrected SQL) ---
    const hashedPassword = await bcrypt.hash(pwrd, saltRounds);
    const defaultQuota = 1073741824; // 1 GB
    const usedQuota = 0;
    const insertUserSql = "INSERT INTO user (uname, email, pwrd, upload_quota, used_quota) VALUES (?, ?, ?, ?, ?)";
    const [insertResult] = await dbPool.execute(insertUserSql, [uname, email, hashedPassword, defaultQuota, usedQuota]);
    const newUserId = insertResult.insertId;

    // --- Create verification token and send email ---
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const storeTokenSql = "UPDATE user SET verificationToken = ?, verificationTokenExpires = ? WHERE id = ?";
    await dbPool.execute(storeTokenSql, [verificationToken, verificationTokenExpires, newUserId]);

    const verificationLink = `${process.env.APP_BASE_URL}/verify-email?token=${verificationToken}`;
    try {
        await sendEmail({
            to: email,
            subject: 'Verify Your AstronomyShare Account',
            text: `Welcome! Please verify your email by clicking this link: ${verificationLink}`,
            html: `<p>Welcome!</p><p>Please verify your email by clicking this link:</p><p><a href="${verificationLink}">Verify Account</a></p><p>Link: ${verificationLink}</p>`
        });
    } catch (emailError) {
        console.error(`[API] CRITICAL: Failed to send verification email to ${email}`, emailError);
        // Continue even if email fails.
    }

    // Return success payload
    return { messageCode: 'API_AUTH_REGISTRATION_SUCCESS_VERIFY_EMAIL' };
};

const verifyEmail = async (event) => {
    const { token } = event.queryStringParameters;
    if (!token) {
        throw { statusCode: 400, errorCode: 'API_AUTH_TOKEN_MISSING' };
    }

    const findUserSql = "SELECT id, verificationTokenExpires FROM user WHERE verificationToken = ? AND isVerified = 0";
    const [users] = await dbPool.execute(findUserSql, [token]);

    if (users.length === 0 || users[0].verificationTokenExpires < new Date()) {
        throw { statusCode: 400, errorCode: 'API_AUTH_TOKEN_INVALID_OR_EXPIRED' };
    }

    const user = users[0];
    const verifyUserSql = "UPDATE user SET isVerified = 1, verificationToken = NULL, verificationTokenExpires = NULL WHERE id = ?";
    await dbPool.execute(verifyUserSql, [user.id]);
    
    // This is how you return a redirect
    return {
        statusCode: 302,
        headers: {
            Location: '/login?verified=true',
        },
    };
};

const forgotPassword = async (event) => {
    console.log("[API] POST /forgot-password - Request received");
    const { email } = JSON.parse(event.body);

    // --- Validation ---
    if (!email) {
        throw { statusCode: 400, errorCode: 'API_AUTH_MISSING_FIELDS' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        console.log(`[API] Invalid email format: ${email}, sending generic success.`);
        // Per your security logic, we return a success message even for an invalid format
        return { messageCode: 'API_AUTH_FORGOT_PASSWORD_SENT' };
    }
    // --- End Validation ---

    try {
        const findUserSql = "SELECT id, email, isVerified, uname FROM user WHERE email = ?";
        const [users] = await dbPool.execute(findUserSql, [email]);

        if (users.length > 0 && users[0].isVerified) {
            const user = users[0];
            console.log(`[API] Verified user found for email ${email}. ID: ${user.id}`);

            const resetToken = crypto.randomBytes(32).toString('hex');
            const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
            const storeTokenSql = "UPDATE user SET passwordResetToken = ?, passwordResetTokenExpires = ? WHERE id = ?";
            await dbPool.execute(storeTokenSql, [resetToken, resetTokenExpires, user.id]);

            const resetLink = `${process.env.APP_BASE_URL}/reset-password?token=${resetToken}`;
            
            try {
                await sendEmail({
                    to: email,
                    subject: 'Reset your password at AstronomyShare.com',
                    text: `You requested a password reset. Please do so by clicking this link: ${resetLink}`,
                    html: `<p>Please reset your password by clicking this link:</p><p><a href="${resetLink}">Change my password</a></p>`
                });
                console.log(`[API] Password reset email queued for ${email}`);
            } catch (emailError) {
                console.error(`[API] CRITICAL: Failed to send password reset email to ${email}`, emailError);
                // Continue to the generic success response even if email fails
            }
        } else {
            // If user not found, or found but not verified, we log it and proceed to the generic success response
            console.log(`[API] No verified user found for email: ${email}, sending generic success.`);
        }

        // --- Generic Success Response (for security) ---
        return { messageCode: 'API_AUTH_FORGOT_PASSWORD_SENT' };

    } catch (error) {
        console.error("[API] Error during forgot-password process:", error);
        // Per your security logic, we still return a success message on a server error
        return { messageCode: 'API_AUTH_FORGOT_PASSWORD_SENT' };
    }
};

const resetPassword = async (event) => {
console.log("[API Router] POST /reset-password - Request received");
    const { token, newPassword } = JSON.parse(event.body);
    // 1. Basic Input Validation
    if (!token || !newPassword) {
        // *** CHANGED RESPONSE ***
        throw { statusCode: 400, errorCode: 'API_AUTH_MISSING_FIELDS' };
    }

    const minPasswordLength = 8; // Ensure this matches frontend validation
    if (newPassword.length < minPasswordLength) {
        throw { statusCode: 400, errorCode: 'API_AUTH_PASSWORD_TOO_SHORT' };
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
            throw { statusCode: 400, errorCode: 'API_AUTH_TOKEN_INVALID_OR_EXPIRED' };
        }

        const user = users[0];
        const expires = user.passwordResetTokenExpires;

        // 4. Validate Token Expiry
        if (!expires || expires < new Date()) {
            console.log(`[API Router /reset-password] Expired token received for user ID: ${user.id}`);
            // *** CHANGED RESPONSE (Use consistent invalid/expired code) ***
            throw { statusCode: 400, errorCode: 'API_AUTH_TOKEN_INVALID_OR_EXPIRED' };
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
        return { messageCode: 'API_AUTH_PASSWORD_RESET_SUCCESS' };

    } catch (error) {
      // If the error is one we've already formatted, re-throw it.
        if (error.statusCode) {
            throw error;
        } 
        // Otherwise, it's an unexpected server error.
        console.error("[API Router /reset-password] Error during password reset process:", error);
        // Throw a generic server error in the correct format for our handler
        throw { statusCode: 500, errorCode: 'API_SERVER_ERROR_GENERIC' }; 
    }    
};

const quotaStatus = async (event) => {
    // Here we call the authentication helper function first
    const user = authenticateToken(event); // This will throw an error if not authenticated
    
    const userId = user.userId;
    const sql = "SELECT used_quota, upload_quota FROM user WHERE id = ?";
    const [results] = await dbPool.execute(sql, [userId]);

    if (results.length === 0) {
        throw { statusCode: 404, errorCode: 'API_USER_NOT_FOUND' };
    }
    return {
        used: parseInt(results[0].used_quota, 10) || 0,
        allowed: parseInt(results[0].upload_quota, 10) || 0
    };
};


// --- ROUTER & MAIN HANDLER ---

const router = {
  '/login': login,
  '/register': register,
  '/verify-email': verifyEmail,
  '/forgot-password': forgotPassword,
  '/reset-password': resetPassword,
  '/quota-status': quotaStatus
};

exports.handler = async (event) => {
  // For HTTP APIs (payload format 2.0), the path is in event.rawPath.
  // For REST APIs (payload format 1.0), it's in event.path. This handles both.
  console.log('Request received for path:', event.path);
  const allowedOrigin = process.env.FRONTEND_URL || 'https://astronomyshare.com';


  // --- Handle CORS Preflight Requests ---
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204, // 204 No Content is the standard for preflight
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Headers": "Content-Type,Authorization", // Allow these headers
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS" // Allow these methods
      },
      body: '' // Body must be empty
    };
  }

  const routeHandler = router[event.path];
  if (routeHandler) {
    try {
      const result = await routeHandler(event);
      
      // Handle special case for redirect
      if (result.statusCode === 302) {
          return result;
      }
      
      // Standard success response
      return {
        statusCode: 200, // Or 201 for register
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowedOrigin },
        body: JSON.stringify(result),
      };
    } catch (err) {
      // Handle errors thrown from route handlers
      console.error("Error processing request:", err);
      return {
        statusCode: err.statusCode || 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowedOrigin },
        body: JSON.stringify({ errorCode: err.errorCode || 'API_SERVER_ERROR_GENERIC' }),
      };
    }
  }

  // 404 Not Found
  return {
    statusCode: 404,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowedOrigin },
    body: JSON.stringify({ message: 'Not Found' }),
  };
};