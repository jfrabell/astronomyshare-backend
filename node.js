// node.js (Corrected Structure)

require('dotenv').config(); // MUST be first

// --- Core Requires ---
const express = require('express');
const http = require('http');
const cors = require('cors');
// --- Removed requires handled in routers or config files (bcrypt, jwt, mysql, aws-sdk) ---

// --- Initialize App ---
const app = express();

// --- Global Middleware ---
app.use(cors());
app.use(express.json());
// const upload = multer(); // Only initialize if needed globally or pass to specific routers

// --- Shared Configurations ---
const db = require('./db'); // Require shared DB connection (ensure db.js connects)
const { s3, bucketName } = require('./aws-config'); // Require shared S3/bucketName (ensure aws-config.js exists)

// --- Require Routers ---
const targetRoutes = require('./routes/targets');
const uploadRoutes = require('./routes/uploads');
const fileRoutes = require('./routes/files');
const authRoutes = require('./routes/auth');
const downloadRoutes = require('./routes/download');
const imageRoutes = require('./routes/images');

// --- Mount Routers ---
app.use('/targets', targetRoutes);
app.use('/uploads', uploadRoutes); // Will contain POST /uploads later
app.use('/files', fileRoutes);     // Contains GET / and DELETE /
app.use('/download', downloadRoutes); // Contains GET 
app.use('/images', imageRoutes); // <-- Add this line
console.log('DEBUG: About to mount /mailgun router...'); // <-- ADD THIS
app.use('/', authRoutes);         // Contains /login, /register


// --- Image Count Route - move if I keep it --- 
app.get('/image-count', async (req, res) => {
    console.log("[API] GET /stats/image-count - Request received");
    const sql = "SELECT COUNT(*) as imageCount FROM images"; // Count rows in the final images table

    try {
        // Using await with the database pool object (ensure 'db' is your pool)
        const [results] = await db.query(sql);
        const imageCount = results[0].imageCount; // Get the count value

        console.log(`[API] GET /stats/image-count - Found ${imageCount} images.`);
        res.status(200).json({ imageCount: imageCount }); // Send count as JSON

    } catch (err) {
        console.error("[API] GET /stats/image-count - DB Error:", err);
        res.status(500).json({ message: "Error fetching image count." });
    }
});

// --- Start Server ---
const httpServer = http.createServer(app);
httpServer.listen(3001, () => {
    console.log('HTTP server listening on port 3001');
});
