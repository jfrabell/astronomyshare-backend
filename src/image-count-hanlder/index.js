// backend/image-count-handler.js
const db = require('../shared/db'); // Your existing database connection

exports.handler = async (event) => {
  console.log("[API] GET /image-count - Request received");
  const sql = "SELECT COUNT(*) as imageCount FROM images";

  try {
    const [results] = await db.query(sql);
    const imageCount = results[0].imageCount;
    console.log(`[API] GET /image-count - Found ${imageCount} images.`);

    // Return a specific JSON structure that API Gateway understands
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageCount: imageCount }),
    };

  } catch (err) {
    console.error("[API] GET /image-count - DB Error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Error fetching image count." }),
    };
  }
};