// db.js (Using Connection Pool with Promises)
const mysql = require('mysql2/promise'); // Still use promise wrapper
require('dotenv').config();

console.log('[DB] Creating connection pool...');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true, // Wait if pool is full (recommended)
    connectionLimit: 10,    // Adjust pool size as needed
    queueLimit: 0           // No limit on waiting queue
});

module.exports = pool; // Export the POOL object