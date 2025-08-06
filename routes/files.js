// src/routes/files.js
const express = require('express');
const router = express.Router();
const dbpool = require('../db');
const { s3, bucketName } = require('../aws-config');
const authenticateToken = require('../middleware/authenticateToken'); // Ensure you have this middleware

// Added authenticateToken middleware
router.delete('/', authenticateToken, async (req, res) => {
    console.log("[API Router] DELETE /files - Request received");
    const loggedInUserId = req.user.userId; // Get user ID from token payload
    const objectKey = req.query.key;
    const isAdmin = !!req.user.is_admin;


    // 1. Basic Input Validation
    if (!objectKey || typeof objectKey !== 'string') {
        // *** CHANGED RESPONSE ***
        return res.status(400).json({ errorCode: 'API_FILE_MISSING_KEY' }); // Use a specific key
    }

    try {
        // --- Authorization Check ---
        console.log(`[API Router] DELETE /files - Checking ownership for key: ${objectKey}`);
        const getImageOwnerSql = "SELECT user_id FROM images WHERE s3_key = ? LIMIT 1";
        const [images] = await dbpool.execute(getImageOwnerSql, [objectKey]);

        if (images.length === 0) {
            // File not found in DB. Could be already deleted or never confirmed.
            // Responding with success prevents potential info leaks and handles cases where S3 object might still exist.
            console.warn(`[API Router] DELETE /files - Key not found in DB during ownership check: ${objectKey}. Assuming already deleted or invalid.`);
            return res.status(200).json({ messageCode: 'API_FILE_DELETE_SUCCESS' }); // Treat as success (idempotent)
            // Alternatively, if you want strictness:
            // return res.status(404).json({ errorCode: 'API_FILE_NOT_FOUND' });
        }

        const imageOwnerId = images[0].user_id;

     // *** MODIFIED AUTH CHECK ***
        // Check if the user is NOT the owner AND ALSO NOT an admin
        if (imageOwnerId !== loggedInUserId && !isAdmin) {
            console.warn(`[API Router] DELETE /files - FORBIDDEN: Non-admin User ${loggedInUserId} attempted to delete file owned by ${imageOwnerId}. Key: ${objectKey}`);
            return res.status(403).json({ errorCode: 'API_AUTH_FORBIDDEN' }); // 403 Forbidden
        }
        // --- End Authorization Check ---

        // --- User is authorized (either owner OR admin), proceed with deletion ---
        console.log(`[API Router] DELETE /files - User ${loggedInUserId} (isAdmin: ${isAdmin}) authorized. Proceeding with delete.`); // Updated log

        // 1. Delete from S3
        const params = { Bucket: bucketName, Key: objectKey };
        console.log(`[API Router] DELETE /files - Attempting to delete S3 object: ${objectKey}`);
        await s3.deleteObject(params).promise();
        console.log(`[API Router] DELETE /files - S3 object delete command sent: ${objectKey}`);

        // 2. Delete from images table (Only owner OR admin can reach here)
        console.log(`[API Router] DELETE /files - Attempting to delete DB record for key: ${objectKey}`);
        // Use original logic, maybe add WHERE user_id = imageOwnerId for extra check? Or rely on auth check above.
        const deleteImageSql = "DELETE FROM images WHERE s3_key = ?";
        const [deleteResult] = await dbpool.execute(deleteImageSql, [objectKey]);

        if (deleteResult.affectedRows > 0) {
            console.log(`[API Router] DELETE /files - Successfully deleted ${deleteResult.affectedRows} DB record(s) for key: ${objectKey}.`);
        } else {
            console.warn(`[API Router] DELETE /files - No matching DB record found/deleted for key: ${objectKey} (might already be deleted).`);
        }

        // Send Success Response
        return res.status(200).json({ messageCode: 'API_FILE_DELETE_SUCCESS' });

    } catch (error) { // Catch errors from DB queries or S3 delete
        console.error('[API Router] DELETE /files - Error during delete process:', error);
        if (!res.headersSent) {
            return res.status(500).json({ errorCode: 'API_SERVER_ERROR_GENERIC' });
        }
    }
});

module.exports = router;