// aws-config.js (Example)
const AWS = require('aws-sdk');
require('dotenv').config();

// ---> ADD THESE TEMPORARY LOGS ---
console.log('--- Checking AWS Env Vars INSIDE aws-config.js ---');
console.log('AWS_ACCESS_KEY_ID loaded:', process.env.AWS_ACCESS_KEY_ID ? 'YES' : 'NO');
console.log('AWS_SECRET_ACCESS_KEY loaded:', process.env.AWS_SECRET_ACCESS_KEY ? 'YES' : 'NO');
console.log('S3_BUCKET_NAME loaded:', process.env.S3_BUCKET_NAME || 'MISSING (using fallback)');
console.log('--------------------------------------------------');
// ---> END LOGS ---

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'us-east-2', // Or your region
});

const bucketName = process.env.S3_BUCKET_NAME || 'astronomysharedata'; // Get from env

module.exports = { s3, bucketName };