// Update with your config settings.
require('dotenv').config(); // Load .env file variables into process.env

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
module.exports = {


  // Development Environment Configuration
  development: {
    client: 'mysql2', // Specify the driver
    connection: {
      host: process.env.DB_HOST || '127.0.0.1', // Use env var from local .env or default
      port: process.env.DB_PORT || 3306,     // Use env var from local .env or default
      user: process.env.DB_USER,             // Get from local .env
      password: process.env.DB_PASSWORD,         // Get from local .env
      database: process.env.DB_NAME             // Get from local .env
      // Add charset: 'utf8mb4' if needed
    },
    migrations: {
      directory: './migrations', // Path relative to knexfile.js
      tableName: 'knex_migrations' // Default table name for tracking migrations
    },
    seeds: {
      directory: './seeds'      // Path relative to knexfile.js (needs 'mkdir seeds')
    }
  },

  // Production Environment Configuration
  production: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST,             // Get from SERVER's .env
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,             // Get from SERVER's .env
      password: process.env.DB_PASSWORD,         // Get from SERVER's .env
      database: process.env.DB_NAME             // Get from SERVER's .env
      // Add other production-specific options like SSL if needed:
      // ssl: {
      //   rejectUnauthorized: true,
      //   // ca: fs.readFileSync('/path/to/prod/ca-certificate.pem'), // Example
      // }
    },
    pool: { // Optional: Connection pool settings for production
      min: 2,
      max: 10
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
       directory: './seeds'
    }
  }
};
