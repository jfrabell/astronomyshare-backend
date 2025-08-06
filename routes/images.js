// src/routes/images.js
const express = require('express');
const router = express.Router();
const dbPool = require('../db');
const authenticateToken = require('../middleware/authenticateToken');

// GET /images - Fetch paginated and filtered images
router.get('/', authenticateToken, async (req, res) => {
    console.log("[API Router] GET /images - Request received. Query:", req.query);
    const userId = req.user.userId; // Assuming this remains for potential future use or logging

    try {
        // --- Step 1: Extract & Validate Pagination Parameters ---
        const page = parseInt(req.query.page, 10) || 1;
        let limit = parseInt(req.query.limit, 10) || 25;
        limit = Math.max(1, Math.min(limit, 100));

        if (page < 1) {
            // Basic validation for page number
            // *** CHANGED RESPONSE ***
            // Added 'parameter' field for context
            return res.status(400).json({ errorCode: 'API_INVALID_PARAMETER', parameter: 'page' });
        }
        const offset = (page - 1) * limit;

        // --- Step 2: Extract Filter Parameters ---
        const targetNameFilter = req.query.target;
        const focalLengthFilter = req.query.focalLength ? parseInt(req.query.focalLength, 10) : null;

        // --- Step 3: Build Dynamic WHERE Clauses and Parameters ---
        const whereClauses = [];
        const sqlParams = [];

        // --- Filter by status/visibility (Example: Add this) ---
        // whereClauses.push("i.status = ?"); // Replace with your actual status column/value
        // sqlParams.push('approved'); // Example value

        // Add optional user filters
        if (targetNameFilter) {
            whereClauses.push("t.target_name = ?");
            sqlParams.push(targetNameFilter);
        }
        if (focalLengthFilter && !isNaN(focalLengthFilter)) {
            whereClauses.push("i.focal_length = ?");
            sqlParams.push(focalLengthFilter);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // --- Step 4: Construct SQL Queries ---
        const countSql = `SELECT COUNT(*) as totalItems FROM images i JOIN targets t ON i.target_id = t.target_id ${whereSql}`;
        const dataSql = `
            SELECT
                i.image_id, i.user_id, i.target_id, i.s3_key, i.original_filename,
                i.file_size_bytes, i.content_type, i.focal_length, i.exposure_time,
                i.filters_used, i.telescope_type, i.camera_model, i.created_at,
                t.target_name, t.description as target_description
            FROM images i
            JOIN targets t ON i.target_id = t.target_id
            ${whereSql}
            ORDER BY i.created_at DESC
            LIMIT ? OFFSET ?`;
        const dataParams = [...sqlParams, limit, offset];

        console.log("[API Router] GET /images - Count SQL:", dbPool.format(countSql, sqlParams));
        console.log("[API Router] GET /images - Data SQL:", dbPool.format(dataSql, dataParams));

        // --- Step 5: Execute Queries ---
        const [countResultPromise, dataResultPromise] = [
            dbPool.query(countSql, sqlParams),
            dbPool.query(dataSql, dataParams)
        ];
        const [[countResult], [imageResults]] = await Promise.all([countResultPromise, dataResultPromise]);
        const totalItems = countResult[0].totalItems;
        const totalPages = Math.ceil(totalItems / limit);

        console.log(`[API Router] GET /images - Found ${totalItems} total items matching criteria, returning page ${page} of ${totalPages}.`);

        // --- Step 6: Send Paginated Response (Success - Unchanged) ---
        res.status(200).json({
            images: imageResults,
            pagination: {
                currentPage: page,
                limit: limit,
                totalPages: totalPages,
                totalItems: totalItems
            }
        });

    } catch (error) { // Catch errors from validation or DB queries
        console.error("[API Router] GET /images - Error:", error);
        if (!res.headersSent) {
            // *** CHANGED RESPONSE ***
            res.status(500).json({ errorCode: 'API_SERVER_ERROR_GENERIC' });
        }
    }
}); // End router.get('/')

module.exports = router;