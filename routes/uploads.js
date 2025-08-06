//
// PASTE THIS ENTIRE BLOCK INTO YOUR uploads.js FILE
//

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dbpool = require('../db');
const { s3, bucketName } = require('../aws-config');
const authenticateToken = require('../middleware/authenticateToken');

// --- AWS SNS SETUP ---
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const { ECSClient, RunTaskCommand } = require("@aws-sdk/client-ecs"); // Import ECS client
const snsClient = new SNSClient({ region: process.env.AWS_REGION });
const BATCH_COMPLETE_TOPIC_ARN = process.env.BATCH_COMPLETE_TOPIC_ARN;


// =================================================================
// --- ROUTE 1: INITIATE UPLOAD (POST /) ---
// =================================================================
router.post('/', authenticateToken, async (req, res) => {
    console.log("[API Router] POST /uploads - V2 Project-based request received");
    const userId = req.user.userId;
    const username = req.user.username;

    const { finalTargetName, project_name, image_type, filenames } = req.body;

    // --- Validation ---
    if (!finalTargetName || !image_type || !Array.isArray(filenames) || filenames.length === 0) {
        return res.status(400).json({ errorCode: 'API_UPLOAD_MISSING_FIELDS' });
    }
    const validImageTypes = ['light', 'dark', 'flat', 'bias', 'dark_flat'];
    if (!validImageTypes.includes(image_type)) {
        return res.status(400).json({ errorCode: 'API_UPLOAD_INVALID_IMAGE_TYPE' });
    }

    let connection;
    try {
        // --- Start Transaction ---
        connection = await dbpool.getConnection();
        await connection.beginTransaction();
        console.log("[API Router] DB Connection acquired & Transaction started for upload initiation.");

        // --- Find or Create Target ---
        let targetId;
        const findTargetSql = "SELECT target_id FROM targets WHERE LOWER(target_name) = LOWER(?) LIMIT 1";
        const [targetResults] = await connection.execute(findTargetSql, [finalTargetName]);
        if (targetResults.length > 0) {
            targetId = targetResults[0].target_id;
        } else {
            const insertTargetSql = "INSERT INTO targets (target_name) VALUES (?)";
            const [insertResult] = await connection.execute(insertTargetSql, [finalTargetName]);
            targetId = insertResult.insertId;
        }
        console.log(`[API Router] Using target_id: ${targetId}`);

        // --- Find or Create Project ---
        let projectId;
        const findProjectSql = "SELECT project_id FROM projects WHERE user_id = ? AND target_id = ? LIMIT 1";
        const [projectResults] = await connection.execute(findProjectSql, [userId, targetId]);
        if (projectResults.length > 0) {
            projectId = projectResults[0].project_id;
        } else {
            const newProjectName = project_name || `${username}'s ${finalTargetName} Project`;
            const insertProjectSql = "INSERT INTO projects (user_id, target_id, project_name) VALUES (?, ?, ?)";
            const [insertResult] = await connection.execute(insertProjectSql, [userId, targetId, newProjectName]);
            projectId = insertResult.insertId;
        }
        console.log(`[API Router] Using project_id: ${projectId}`);
        
        // --- Create the Upload Batch ---
        const batchInsertSql = `INSERT INTO upload_batches (user_id, target_id, project_id, total_files_expected, status) VALUES (?, ?, ?, ?, 'initiated')`;
        const [batchResult] = await connection.execute(batchInsertSql, [userId, targetId, projectId, filenames.length]);
        const batch_id = batchResult.insertId;
        console.log(`[API Router] Created upload_batches record. batch_id: ${batch_id}`);

        // --- Create Temporary Upload Records ---
        const tempUploadPromises = filenames.map(originalFilename => {
            const s3Key = `${process.env.STAGE || 'dev'}/uploads/${userId}/${projectId}/${batch_id}/${uuidv4()}-${originalFilename}`;
            const insertSql = `
                INSERT INTO temporary_uploads (user_id, target_id, project_id, batch_id, image_type, s3_bucket, s3_key, original_filename, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_confirmation')
            `;
            return connection.execute(insertSql, [userId, targetId, projectId, batch_id, image_type, bucketName, s3Key, originalFilename]);
        });
        await Promise.all(tempUploadPromises);
        console.log(`[API Router] All temporary records created for batch_id: ${batch_id}`);

        // --- Generate Presigned URLs ---
        const getKeysSql = "SELECT original_filename, s3_key FROM temporary_uploads WHERE batch_id = ?";
        const [tempRecords] = await connection.execute(getKeysSql, [batch_id]);
        const presignedUrlPromises = tempRecords.map(record => {
            const s3Params = { Bucket: bucketName, Key: record.s3_key, Expires: 7200 };
            return s3.getSignedUrlPromise('putObject', s3Params).then(url => ({
                originalFilename: record.original_filename, s3Key: record.s3_key, presignedUrl: url
            }));
        });
        const resolvedUploadData = await Promise.all(presignedUrlPromises);

        // --- Commit and Respond ---
        await connection.commit();
        res.status(200).json({
            message: 'Batch created and ready for upload.',
            project_id: projectId,
            batch_id: batch_id,
            uploads: resolvedUploadData
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("[API Router] POST /uploads - Error during initiation phase:", error);
        res.status(500).json({ errorCode: 'API_SERVER_ERROR_GENERIC' });
    } finally {
        if (connection) connection.release();
    }
});


// =================================================================
// --- ROUTE 2: CONFIRM UPLOAD (POST /confirm) ---
// =================================================================
router.post('/confirm', async (req, res) => {
    console.log('[API Router] POST /uploads/confirm - Confirmation received');

    // --- Webhook Secret Validation ---
    const receivedSecret = req.headers['x-webhook-secret'];
    const expectedSecret = process.env.WEBHOOK_SECRET;
    if (!expectedSecret || !receivedSecret || receivedSecret !== expectedSecret) {
        console.warn("[API Router] /confirm - Invalid or missing webhook secret.");
        return res.status(403).json({ errorCode: 'API_AUTH_INVALID_WEBHOOK_SECRET' });
    }

    // --- Body Validation ---
    const { s3Bucket, s3Key, size } = req.body;
    if (!s3Bucket || !s3Key || size === undefined) {
        return res.status(400).json({ errorCode: 'API_UPLOAD_CONFIRM_MISSING_DETAILS' });
    }
    const uploadedFileSize = parseInt(size, 10);
    
    let connection;
    try {
        // --- Start DB Transaction ---
        connection = await dbpool.getConnection();
        await connection.beginTransaction();

        // --- Find matching record ---
        const findSql = "SELECT * FROM temporary_uploads WHERE s3_key = ? AND status = 'pending_confirmation' FOR UPDATE";
        const [tempResults] = await connection.execute(findSql, [s3Key]);

        if (tempResults.length === 0) {
            await connection.commit(); // Nothing to do, but commit to release lock
            return res.status(200).json({ messageCode: 'API_UPLOAD_CONFIRM_NO_PENDING_RECORD' });
        }
        
        const tempRecord = tempResults[0];
        const { temp_id, user_id, project_id, batch_id, image_type } = tempRecord;
        console.log(`[API Router /confirm] Found temp_id: ${temp_id} for project_id: ${project_id}`);
        
        // --- (Optional Quota/File Type validation would go here) ---

        // --- Main Logic ---
        const insertImageSql = `
            INSERT INTO images (user_id, target_id, project_id, batch_id, image_type, s3_bucket, s3_key, original_filename, file_size_bytes, content_type, focal_length, exposure_time, filters_used, telescope_type, camera_model, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const insertImageParams = [ user_id, tempRecord.target_id, batch_id, project_id, image_type, s3Bucket, s3Key, tempRecord.original_filename, uploadedFileSize, req.body.contentType, tempRecord.focal_length, tempRecord.exposure_time, tempRecord.filters_used, tempRecord.telescope_type, tempRecord.camera_model, tempRecord.created_at ];
        await connection.execute(insertImageSql, insertImageParams);
        console.log(`[API Router /confirm] Inserted into 'images' table.`);

        const deleteSql = "DELETE FROM temporary_uploads WHERE temp_id = ?";
        await connection.execute(deleteSql, [temp_id]);
        
        // --- Update Project & Batch Status ---
        const flagColumn = `has_${image_type}s`;
        const validFlags = ['has_darks', 'has_flats', 'has_biases', 'has_dark_flats'];
        if (validFlags.includes(flagColumn)) {
            const updateProjectSql = `UPDATE projects SET ${flagColumn} = TRUE WHERE project_id = ?`;
            await connection.execute(updateProjectSql, [project_id]);
        }
        
        const updateBatchSql = "UPDATE upload_batches SET files_confirmed_count = files_confirmed_count + 1 WHERE batch_id = ?";
        await connection.execute(updateBatchSql, [batch_id]);

        const checkBatchSql = "SELECT files_confirmed_count, total_files_expected FROM upload_batches WHERE batch_id = ?";
        const [batchStatus] = await connection.execute(checkBatchSql, [batch_id]);
        
        if (batchStatus.length > 0 && batchStatus[0].files_confirmed_count >= batchStatus[0].total_files_expected) {
            
            const setZippingSql = "UPDATE upload_batches SET status = 'zipping' WHERE batch_id = ?";
            await connection.execute(setZippingSql, [batch_id]);
            
            // --- Trigger ECS/Fargate Task ---
            console.log(`[API Router /confirm] BATCH COMPLETE! Triggering ECS/Fargate task for batch_id: ${batch_id}`);

            // Fetch the list of *confirmed* files from the 'images' table now.
            const getFilesSql = "SELECT s3_key, original_filename FROM images WHERE batch_id = ?";
            const [files] = await connection.execute(getFilesSql, [batch_id]);

            // Calculate total size to help the orchestrator decide
            const getTotalSizeSql = "SELECT SUM(file_size_bytes) as total_size FROM images WHERE batch_id = ?";
            const [[{ total_size }]] = await connection.execute(getTotalSizeSql, [batch_id]);

            const ecsClient = new ECSClient({ region: process.env.AWS_REGION });
            const taskParams = {
                cluster: process.env.ECS_CLUSTER_ARN, // Replace with your ECS cluster ARN
                taskDefinition: process.env.ECS_TASK_DEFINITION_ARN, // Replace with your task definition ARN
                launchType: 'FARGATE', // Or 'EC2' if you're using EC2 launch type
                networkConfiguration: {
                    awsvpcConfiguration: {
                        subnets: [process.env.ECS_SUBNET_ID], // Replace with your subnet ID
                        securityGroups: [process.env.ECS_SECURITY_GROUP_ID], // Replace with your security group ID
                        assignPublicIp: 'ENABLED' // Or 'DISABLED' depending on your VPC setup
                    }
                },
                overrides: {
                    containerOverrides: [
                        {
                            name: 'zipping-container', // Replace with your container name
                            environment: [
                                { name: 'BATCH_ID', value: batch_id.toString() },
                                { name: 'FILE_LIST', value: JSON.stringify(files) }, // Pass the file list
                                { name: 'TOTAL_SIZE_BYTES', value: total_size.toString() },
                                { name: 'CALLBACK_URL', value: `${process.env.APP_BASE_URL}/api/batch-complete` }
                            ]
                        }
                    ]
                }
            };
            const runTaskCommand = new RunTaskCommand(taskParams);
            const runTaskResponse = await ecsClient.send(runTaskCommand);
            console.log("[API Router /confirm] ECS/Fargate task started:", runTaskResponse);
        }
        
        // --- Commit and Respond ---
        await connection.commit();
        res.status(200).json({ messageCode: 'API_UPLOAD_CONFIRM_SUCCESS' });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error(`[API Router /confirm] Error processing confirmation for s3_key ${s3Key}:`, error);
        res.status(500).json({ errorCode: 'API_SERVER_ERROR_GENERIC' });
    } finally {
        if (connection) connection.release();
    }
});


module.exports = router;