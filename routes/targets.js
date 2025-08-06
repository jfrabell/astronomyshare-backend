// src/routes/targets.js
const express = require('express');
const router = express.Router();
const dbPool = require('../db'); // Use the promise-based pool
const authenticateToken = require('../middleware/authenticateToken'); // Assuming targets requires login? Add if needed.

// GET /targets - Fetch list of all targets
router.get('/', authenticateToken, async (req, res) => { // Added authenticateToken
    console.log("[API Router] GET /targets - Request received");

    // Optional Auth check if needed, req.user available from middleware

    const sql = "SELECT target_id, target_name, description FROM targets ORDER BY target_name ASC";

    try {
        const [results] = await dbPool.query(sql);

        const targets = results.map(row => ({
            // Keep mapping consistent with frontend expectations if needed
            // Or directly return row data if keys match
            value: row.target_name, // Changed 'id' to 'value' for react-select default
            label: row.description ? `${row.target_name} (${row.description})` : row.target_name, // Changed 'name' to 'label'
            // Keep original fields if needed elsewhere:
            target_id: row.target_id,
            target_name: row.target_name,
            description: row.description
        }));

        console.log(`[API Router] GET /targets - Sending ${targets.length} targets.`);
        // --- Success Response (Unchanged - returns data directly) ---
        res.status(200).json({ targets: targets });

    } catch (err) {
        // Catch errors from await dbPool.query()
        console.error("[API Router] GET /targets - Error fetching targets from DB:", err);
        if (!res.headersSent) {
            // *** CHANGED RESPONSE ***
            res.status(500).json({ errorCode: 'API_SERVER_ERROR_GENERIC' });
        }
    }
});

// Add other target-related routes here later (e.g., POST / to add new target?)

module.exports = router;