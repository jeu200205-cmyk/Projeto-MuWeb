/**
 * Database Configuration for MU Online
 * Supports: MySQL/MariaDB, PostgreSQL, SQL Server
 */

module.exports = {
  // Default database client
  client: process.env.DB_CLIENT || 'mysql2', // mysql2, pg, mssql

  // Connection settings
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'muonline',
    password: process.env.DB_PASSWORD || 'muonline123',
    database: process.env.DB_NAME || 'muonline',
    
    // For SQL Server
    // instanceName: process.env.DB_INSTANCE || 'SQLEXPRESS',
    // domain: process.env.DB_DOMAIN || '',
    
    // SSL options (for production)
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  },

  // Connection Pool Settings
  pool: {
    min: parseInt(process.env.DB_POOL_MIN) || 2,
    max: parseInt(process.env.DB_POOL_MAX) || 20,
    acquireTimeoutMillis: 60000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200,
    propagateCreateError: false,
  },

  // Migration Settings
  migrations: {
    tableName: 'knex_migrations',
    directory: './database/migrations',
    loadExtensions: ['.js'],
  },

  // Seed Settings
  seeds: {
    directory: './database/seeds',
    loadExtensions: ['.js'],
  },

  // Query Builder Options
  useNullAsDefault: true,

  // Debug mode
  debug: process.env.DB_DEBUG === 'true',

  // Retry Logic
  retry: {
    enabled: true,
    maxRetries: 3,
    retryDelay: 1000,
  },

  // Soft Delete Column
  softDelete: {
    columnName: 'deleted_at',
    overrideMethods: ['select', 'update', 'delete', 'del'],
  },

  // Audit Trail Settings
  audit: {
    enabled: true,
    tableName: 'audit_logs',
    columns: ['created_at', 'updated_at', 'deleted_at', 'created_by', 'updated_by'],
  },
};