// src/routes/download.js
const express = require('express');
const router = express.Router();
const { s3, bucketName } = require('../aws-config'); // Assuming shared AWS config
const authenticateToken = require('../middleware/authenticateToken'); // Assuming auth is needed

// GET /download?key=...
router.get('/', authenticateToken, async (req, res) => { // Added authenticateToken based on previous examples
    console.log("[API Router] GET /download - Request received");
    const objectKey = req.query.key;

    if (!objectKey || typeof objectKey !== 'string') { // Added type check for robustness
        console.error("[API Router] GET /download - Object key is missing or invalid!");
        // *** CHANGED RESPONSE ***
        // Use a specific error code for missing/invalid key parameter
        return res.status(400).json({ errorCode: 'API_DOWNLOAD_MISSING_KEY' });
    }

    // Extract filename (ensure objectKey is treated as string)
    const filename = String(objectKey).split('/').pop();

    const params = {
        Bucket: bucketName,
        Key: objectKey,
        Expires: 60 * 5, // 5 minutes
        // Tell S3 to suggest 'filename' when browser downloads via the URL
        ResponseContentDisposition: `attachment; filename="${filename}"`
    };

    try {
        const signedUrl = await s3.getSignedUrlPromise('getObject', params);
        console.log(`[API Router] GET /download - Generated download URL for: ${objectKey}`);
        // --- Success Response (Unchanged - returns data directly) ---
        res.json({ downloadUrl: signedUrl });

    } catch (err) {
        console.error(`[API Router] GET /download - Error generating presigned URL for ${objectKey}:`, err);
        // *** CHANGED RESPONSE ***
        // Use the generic server error code for S3 or other unexpected issues
        res.status(500).json({ errorCode: 'API_SERVER_ERROR_GENERIC' });
    }
});

module.exports = router;