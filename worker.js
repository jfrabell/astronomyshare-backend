// worker.js - To be run inside the Fargate container

const AWS = require('aws-sdk');
const archiver = require('archiver');
const { PassThrough } = require('stream');
const https = require('https');

// --- Configuration from Environment Variables ---

// These are passed in from the RunTask command in uploads.js
const BATCH_ID = process.env.BATCH_ID;
const FILE_LIST_JSON = process.env.FILE_LIST;
const CALLBACK_URL = process.env.CALLBACK_URL;

// These should be set in the Fargate Task Definition's environment variables
const SOURCE_BUCKET = process.env.S3_BUCKET_NAME;
const GLACIER_BUCKET = process.env.GLACIER_BUCKET_NAME;

const s3 = new AWS.S3();

// Helper function to report status back to the main application
async function reportStatus(status, data = {}) {
    console.log(`[Worker] Reporting status '${status}' to: ${CALLBACK_URL}`);
    const payload = JSON.stringify({
        batch_id: BATCH_ID,
        status,
        ...data
    });

    return new Promise((resolve, reject) => {
        const req = https.request(CALLBACK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`Callback failed with status: ${res.statusCode}`));
            }
            resolve();
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// Main worker logic
async function main() {
    console.log(`[Worker] Starting process for BATCH_ID: ${BATCH_ID}`);

    // --- Validate Environment Variables ---
    if (!BATCH_ID || !FILE_LIST_JSON || !CALLBACK_URL || !SOURCE_BUCKET || !GLACIER_BUCKET) {
        console.error("[Worker] FATAL: Missing one or more required environment variables.");
        // We can't report failure if CALLBACK_URL is missing, so just exit.
        process.exit(1);
    }

    const fileList = JSON.parse(FILE_LIST_JSON);
    if (!fileList || fileList.length === 0) {
        throw new Error("File list is empty.");
    }

    try {
        // 1. Create the zip file as a stream
        const zipStream = new PassThrough();
        const archive = archiver('zip', { zlib: { level: 9 } });

        archive.on('error', (err) => { throw err; });
        archive.pipe(zipStream);

        console.log(`[Worker] Zipping ${fileList.length} files...`);
        for (const file of fileList) {
            const s3Stream = s3.getObject({ Bucket: SOURCE_BUCKET, Key: file.s3_key }).createReadStream();
            s3Stream.on('error', (err) => {
                console.error(`[Worker] Error reading S3 object ${file.s3_key}`, err);
                archive.emit('error', new Error(`Failed to read ${file.s3_key}: ${err.message}`));
            });
            archive.append(s3Stream, { name: file.original_filename });
        }
        archive.finalize();
        console.log('[Worker] Archiver finalized.');

        // 2. Upload the zip stream to S3
        const zipFileName = `zips/batch_${BATCH_ID}.zip`;
        console.log(`[Worker] Uploading zip file to s3://${SOURCE_BUCKET}/${zipFileName}`);
        const uploadResult = await s3.upload({
            Bucket: SOURCE_BUCKET,
            Key: zipFileName,
            Body: zipStream,
        }).promise();
        console.log(`[Worker] Zip file upload complete: ${uploadResult.Location}`);

        // 3. Move original files to cold storage
        console.log(`[Worker] Moving ${fileList.length} original files to Glacier...`);
        const movePromises = fileList.map(file => async () => {
            await s3.copyObject({
                Bucket: GLACIER_BUCKET,
                Key: file.s3_key,
                CopySource: `${SOURCE_BUCKET}/${file.s3_key}`,
                StorageClass: 'GLACIER_IR',
            }).promise();
            await s3.deleteObject({ Bucket: SOURCE_BUCKET, Key: file.s3_key }).promise();
        });
        await Promise.all(movePromises.map(p => p()));
        console.log('[Worker] All files moved to Glacier.');

        // 4. Report completion back to your website
        await reportStatus('completed', { zip_file_location: uploadResult.Location });

        console.log(`[Worker] Batch ${BATCH_ID} processed successfully.`);
        process.exit(0); // Success exit code

    } catch (error) {
        console.error(`[Worker] FATAL ERROR processing batch ${BATCH_ID}:`, error);
        await reportStatus('failed', { error_message: error.message });
        process.exit(1); // Failure exit code
    }
}

main();