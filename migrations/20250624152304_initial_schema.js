/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    // User Table
    await knex.schema.createTable('user', function(table) {
        table.increments('id').primary().unsigned(); // Explicitly UNSIGNED for the primary key
        table.string('uname', 255).notNullable().unique();
        table.string('pwrd', 255).notNullable();
        table.string('email', 255).notNullable();
        table.boolean('isVerified').notNullable().defaultTo(false);
        table.string('verificationToken', 64).nullable();
        table.datetime('verificationTokenExpires').nullable();
        table.string('passwordResetToken', 64).nullable();
        table.datetime('passwordResetTokenExpires').nullable();
        table.bigInteger('upload_quota').notNullable();
        table.bigInteger('used_quota').notNullable();
        table.timestamp('registration_date').notNullable().defaultTo(knex.fn.now());
        table.boolean('is_admin').notNullable().defaultTo(false); // Added is_admin column here
    });

    // Targets Table
    await knex.schema.createTable('targets', function(table) {
        table.increments('target_id').primary().unsigned(); // PKs should generally be unsigned
        table.string('target_name', 255).notNullable().unique();
        table.text('description').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'));
    });


    await knex.schema.createTable('projects', function(table) {
    table.increments('project_id').primary().unsigned();
    
    table.integer('user_id').unsigned().notNullable();
    table.foreign('user_id').references('id').inTable('user').onDelete('CASCADE');

    table.integer('target_id').unsigned().notNullable();
    table.foreign('target_id').references('target_id').inTable('targets').onDelete('CASCADE');

    table.string('project_name', 255).notNullable();
    table.text('description').nullable();
    
    // --- Calibration Data Tracking ---
    table.boolean('has_darks').notNullable().defaultTo(false);
    table.boolean('has_flats').notNullable().defaultTo(false);
    table.boolean('has_biases').notNullable().defaultTo(false);
    table.boolean('has_dark_flats').notNullable().defaultTo(false); // Common for CMOS/DSLR

    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'));

    table.index(['user_id'], 'idx_project_user');
});


    await knex.schema.createTable('upload_batches', function(table) {
    table.increments('batch_id').primary().unsigned();
    
    table.integer('user_id').unsigned().notNullable();
    table.foreign('user_id').references('id').inTable('user').onDelete('CASCADE');
    
    table.integer('target_id').unsigned().notNullable();
    table.foreign('target_id').references('target_id').inTable('targets').onDelete('CASCADE');

    // --- NEW: Link to the project ---
    table.integer('project_id').unsigned().notNullable();
    table.foreign('project_id').references('project_id').inTable('projects').onDelete('CASCADE');

    table.integer('total_files_expected').notNullable();
    table.integer('files_confirmed_count').notNullable().defaultTo(0);
    
    table.string('status', 50).notNullable().defaultTo('initiated');
    table.text('status_message').nullable();

    table.string('zipped_s3_bucket', 255).nullable();
    table.string('zipped_s3_key', 1024).nullable();
    table.bigInteger('zipped_file_size_bytes').nullable();
    
    table.string('download_url_generated', 1024).nullable();
    table.datetime('download_url_expires_at').nullable();

    table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: false }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'));

    table.index(['project_id'], 'idx_batch_project'); // --- NEW index ---
    table.index(['user_id', 'target_id', 'status'], 'idx_batch_user_target_status');
    table.index(['status'], 'idx_batch_status');
    table.unique(['user_id', 'target_id', 'status'], 'uq_user_target_active_batch');
});


    await knex.schema.createTable('temporary_uploads', function(table) {
    table.increments('temp_id').primary();
    
    table.integer('user_id').unsigned().notNullable();
    table.foreign('user_id').references('id').inTable('user').onDelete('CASCADE');
    
    table.integer('target_id').unsigned().notNullable();
    table.foreign('target_id').references('target_id').inTable('targets').onDelete('CASCADE');

    table.integer('batch_id').unsigned().nullable();
    table.foreign('batch_id').references('batch_id').inTable('upload_batches').onDelete('SET NULL');
    
    table.integer('project_id').unsigned().notNullable(); // .after('batch_id') was removed
    table.foreign('project_id').references('project_id').inTable('projects').onDelete('CASCADE');
    
    const imageTypes = ['light', 'dark', 'flat', 'bias', 'dark_flat'];
    table.enum('image_type', imageTypes, {
        useNative: true,
        enumName: 'image_type_enum'
    }).notNullable();
    
    table.string('s3_bucket', 255).notNullable();
    table.string('s3_key', 1024).notNullable();
    table.string('original_filename', 255).notNullable();
    table.bigInteger('file_size_bytes').nullable();
    table.string('content_type', 100).nullable();
    table.integer('focal_length').nullable();
    table.decimal('exposure_time', 10, 3).nullable();
    table.string('filters_used', 255).nullable();
    table.string('telescope_type', 100).nullable();
    table.string('camera_model', 100).nullable();
    table.string('status', 50).notNullable().defaultTo('pending_confirmation');
    table.text('error_message').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index(['project_id'], 'idx_temp_project'); // Added index for the new column
    table.index(['user_id'], 'idx_temp_user');
    table.index(['target_id'], 'idx_temp_target');
    table.index(knex.raw('`s3_key`(255)'), 'idx_temp_s3_key');
    table.index(['status'], 'idx_temp_status');
    table.index(['created_at'], 'idx_temp_created_at');
});

    // Images Table (for tracking individual, processed files, potentially in cold storage)
    await knex.schema.createTable('images', function(table) {
    table.increments('image_id').primary();
    
    table.integer('user_id').unsigned().notNullable();
    table.foreign('user_id').references('id').inTable('user').onDelete('CASCADE');
    
    table.integer('target_id').unsigned().notNullable();
    table.foreign('target_id').references('target_id').inTable('targets').onDelete('CASCADE');

    table.integer('batch_id').unsigned().nullable();
    table.foreign('batch_id').references('batch_id').inTable('upload_batches').onDelete('SET NULL');

    // --- THIS IS THE MISSING PIECE ---
    table.integer('project_id').unsigned().notNullable();
    table.foreign('project_id').references('project_id').inTable('projects').onDelete('CASCADE');
    // --- END MISSING PIECE ---

    const imageTypes = ['light', 'dark', 'flat', 'bias', 'dark_flat'];
    table.enum('image_type', imageTypes, {
        useNative: true,
        enumName: 'image_type_enum'
    }).notNullable();

    table.string('s3_bucket', 255).notNullable();
    table.string('s3_key', 1024).notNullable();
    table.string('original_filename', 255).notNullable();
    table.bigInteger('file_size_bytes').nullable();
    table.string('content_type', 100).nullable();
    
    table.integer('focal_length').nullable();
    table.decimal('exposure_time', 10,3).nullable();
    table.string('filters_used', 255).nullable();
    table.string('telescope_type', 100).nullable();
    table.string('camera_model', 100).nullable();
    
    table.string('storage_class', 50).notNullable().defaultTo('STANDARD');
    table.boolean('is_zipped_original').notNullable().defaultTo(false);
    
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'));
    
    table.unique(knex.raw('`s3_key`(255)'), 'idx_unique_s3_key');
    table.index(['project_id'], 'idx_images_project_id'); // Added index for new column
    table.index(['user_id'], 'idx_images_user_id');
    table.index(['target_id'], 'idx_images_target_id');
    table.index(['batch_id'], 'idx_images_batch_id');
});

};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
    // Drop tables in reverse order of creation due to foreign key dependencies
    await knex.schema.dropTableIfExists('images');
    await knex.schema.dropTableIfExists('temporary_uploads');
    await knex.schema.dropTableIfExists('upload_batches');
    await knex.schema.dropTableIfExists('targets');
    await knex.schema.dropTableIfExists('user');
};