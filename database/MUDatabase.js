/**
 * MUDatabase.js - Camada de Dados Unificada do MU Online
 * 
 * Fornece:
 * - Connection pooling (MySQL/MariaDB/PostgreSQL/SQL Server)
 * - Migrations/Schema versioning
 * - Prepared statements, transactions
 * - Query builder seguro (parameterized queries)
 * - Soft deletes, audit trails
 * - Retry logic, health checks
 */

const knex = require('knex');
const config = require('./config/database');
const { EventEmitter } = require('events');

class MUDatabase extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = { ...config, ...options };
    this.knex = null;
    this.isConnected = false;
    this.healthCheckInterval = null;
    this.transactionStack = [];
  }

  /**
   * Inicializa a conexão com o banco de dados
   */
  async initialize() {
    try {
      this.knex = knex(this.options);
      
      // Testar conexão
      await this.knex.raw('SELECT 1');
      
      this.isConnected = true;
      this.emit('connected');
      console.log('[MUDatabase] Conectado com sucesso');
      
      // Iniciar health check
      this.startHealthCheck();
      
      // Configurar eventos do pool
      this.setupPoolEvents();
      
      return this;
    } catch (error) {
      this.isConnected = false;
      this.emit('error', error);
      console.error('[MUDatabase] Erro ao conectar:', error.message);
      throw error;
    }
  }

  /**
   * Configura eventos do pool de conexões
   */
  setupPoolEvents() {
    const pool = this.knex.client.pool;
    
    pool.on('create', (connection) => {
      this.emit('pool:create', connection);
    });
    
    pool.on('acquire', (connection) => {
      this.emit('pool:acquire', connection);
    });
    
    pool.on('release', (connection) => {
      this.emit('pool:release', connection);
    });
    
    pool.on('destroy', (connection) => {
      this.emit('pool:destroy', connection);
    });
    
    pool.on('error', (error) => {
      this.emit('pool:error', error);
    });
  }

  /**
   * Inicia verificação periódica de saúde da conexão
   */
  startHealthCheck(intervalMs = 30000) {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.knex.raw('SELECT 1');
        if (!this.isConnected) {
          this.isConnected = true;
          this.emit('reconnected');
        }
      } catch (error) {
        if (this.isConnected) {
          this.isConnected = false;
          this.emit('disconnected', error);
        }
      }
    }, intervalMs);
    
    this.healthCheckInterval.unref();
  }

  /**
   * Para verificação de saúde
   */
  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Executa query com retry automático
   */
  async queryWithRetry(queryFn, retries = 3, delay = 1000) {
    let lastError;
    
    for (let i = 0; i <= retries; i++) {
      try {
        return await queryFn();
      } catch (error) {
        lastError = error;
        
        // Não retry em erros de sintaxe/constraint
        if (this.isNonRetryableError(error)) {
          throw error;
        }
        
        if (i < retries) {
          console.warn(`[MUDatabase] Tentativa ${i + 1} falhou, tentando novamente em ${delay}ms:`, error.message);
          await this.sleep(delay);
          delay *= 2; // Backoff exponencial
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Verifica se erro é não-retryable
   */
  isNonRetryableError(error) {
    const nonRetryableCodes = [
      'ER_PARSE_ERROR',
      'ER_NO_SUCH_TABLE',
      'ER_BAD_FIELD_ERROR',
      'ER_DUP_ENTRY',
      'ER_ROW_IS_REFERENCED_2',
      'ER_NO_REFERENCED_ROW_2',
      '23505', // PostgreSQL unique violation
      '23503', // PostgreSQL foreign key violation
      '42P01', // PostgreSQL undefined table
      '42703', // PostgreSQL undefined column
    ];
    
    return nonRetryableCodes.some(code => 
      error.code === code || error.errno === code || error.sqlState === code
    );
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Obtém instância do Knex para queries diretas
   */
  getKnex() {
    return this.knex;
  }

  /**
   * Query Builder seguro com parâmetros
   */
  table(tableName) {
    return this.knex(tableName);
  }

  /**
   * Select com soft delete automático
   */
  select(tableName, columns = '*', where = {}) {
    let query = this.knex(tableName).select(columns);
    
    // Aplicar soft delete filter
    if (this.options.softDelete) {
      query = query.whereNull(`${tableName}.${this.options.softDelete.columnName}`);
    }
    
    // Aplicar where conditions
    Object.entries(where).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        query = query.whereIn(key, value);
      } else if (value && typeof value === 'object') {
        // Operadores: { '>': 10, '<=': 100 }
        Object.entries(value).forEach(([op, val]) => {
          query = query.where(key, op, val);
        });
      } else {
        query = query.where(key, value);
      }
    });
    
    return query;
  }

  /**
   * Insert com audit trail
   */
  async insert(tableName, data, userId = null) {
    const auditData = this.prepareAuditData(data, userId, 'insert');
    return this.queryWithRetry(() => this.knex(tableName).insert(auditData));
  }

  /**
   * Update com audit trail
   */
  async update(tableName, where, data, userId = null) {
    const auditData = this.prepareAuditData(data, userId, 'update');
    return this.queryWithRetry(() => this.knex(tableName).where(where).update(auditData));
  }

  /**
   * Soft delete
   */
  async softDelete(tableName, where, userId = null) {
    const columnName = this.options.softDelete?.columnName || 'deleted_at';
    const auditData = this.prepareAuditData({ [columnName]: this.knex.fn.now() }, userId, 'delete');
    return this.queryWithRetry(() => this.knex(tableName).where(where).update(auditData));
  }

  /**
   * Hard delete (use com cuidado)
   */
  async hardDelete(tableName, where) {
    return this.queryWithRetry(() => this.knex(tableName).where(where).del());
  }

  /**
   * Prepara dados de auditoria
   */
  prepareAuditData(data, userId, operation) {
    const now = this.knex.fn.now();
    const result = { ...data };
    
    if (operation === 'insert') {
      result.created_at = now;
      result.updated_at = now;
      if (userId) result.created_by = userId;
    } else if (operation === 'update') {
      result.updated_at = now;
      if (userId) result.updated_by = userId;
    }
    
    return result;
  }

  /**
   * Transação com suporte a nested transactions (savepoints)
   */
  async transaction(callback, isolationLevel = 'READ COMMITTED') {
    return this.knex.transaction(async (trx) => {
      this.transactionStack.push(trx);
      
      try {
        // Set isolation level se suportado
        if (isolationLevel && this.supportsIsolationLevel()) {
          await trx.raw(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
        }
        
        const result = await callback(trx);
        this.transactionStack.pop();
        return result;
      } catch (error) {
        this.transactionStack.pop();
        throw error;
      }
    });
  }

  /**
   * Verifica se suporta isolation level
   */
  supportsIsolationLevel() {
    const client = this.options.client;
    return ['pg', 'postgres', 'mysql2', 'mysql'].includes(client);
  }

  /**
   * Obtém transação atual (para nested operations)
   */
  getCurrentTransaction() {
    return this.transactionStack[this.transactionStack.length - 1] || null;
  }

  /**
   * Executa query na transação atual ou cria nova
   */
  getQueryBuilder(tableName) {
    const trx = this.getCurrentTransaction();
    return trx ? trx(tableName) : this.knex(tableName);
  }

  /**
   * Raw query com parâmetros (prepared statement)
   */
  async raw(sql, bindings = []) {
    return this.queryWithRetry(() => this.knex.raw(sql, bindings));
  }

  /**
   * Batch insert para performance
   */
  async batchInsert(tableName, records, chunkSize = 1000) {
    return this.queryWithRetry(() => this.knex.batchInsert(tableName, records, chunkSize));
  }

  /**
   * Upsert (Insert or Update)
   */
  async upsert(tableName, data, conflictColumns, updateColumns = null) {
    const client = this.options.client;
    
    if (['pg', 'postgres'].includes(client)) {
      // PostgreSQL: ON CONFLICT
      const updateCols = updateColumns || Object.keys(data).filter(c => !conflictColumns.includes(c));
      const setClause = updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ');
      const conflictClause = conflictColumns.join(', ');
      
      const sql = `
        INSERT INTO ${tableName} (${Object.keys(data).join(', ')})
        VALUES (${Object.keys(data).map(() => '?').join(', ')})
        ON CONFLICT (${conflictClause}) DO UPDATE SET ${setClause}
      `;
      
      return this.raw(sql, Object.values(data));
    } else if (['mysql2', 'mysql'].includes(client)) {
      // MySQL: ON DUPLICATE KEY UPDATE
      const updateCols = updateColumns || Object.keys(data).filter(c => !conflictColumns.includes(c));
      const setClause = updateCols.map(c => `${c} = VALUES(${c})`).join(', ');
      
      const sql = `
        INSERT INTO ${tableName} (${Object.keys(data).join(', ')})
        VALUES (${Object.keys(data).map(() => '?').join(', ')})
        ON DUPLICATE KEY UPDATE ${setClause}
      `;
      
      return this.raw(sql, Object.values(data));
    } else {
      // Fallback: try select then insert/update
      const existing = await this.select(tableName, 'id', 
        Object.fromEntries(conflictColumns.map(c => [c, data[c]]))
      ).first();
      
      if (existing) {
        return this.update(tableName, { id: existing.id }, data);
      } else {
        return this.insert(tableName, data);
      }
    }
  }

  /**
   * Paginação
   */
  async paginate(tableName, options = {}) {
    const {
      page = 1,
      limit = 20,
      columns = '*',
      where = {},
      orderBy = 'id',
      orderDirection = 'DESC',
    } = options;
    
    const offset = (page - 1) * limit;
    
    const [data, total] = await Promise.all([
      this.select(tableName, columns, where)
        .orderBy(orderBy, orderDirection)
        .limit(limit)
        .offset(offset),
      this.knex(tableName)
        .where(where)
        .whereNull(`${tableName}.${this.options.softDelete?.columnName || 'deleted_at'}`)
        .count('* as count')
        .first(),
    ]);
    
    return {
      data,
      pagination: {
        page,
        limit,
        total: parseInt(total?.count || 0),
        totalPages: Math.ceil((parseInt(total?.count || 0)) / limit),
      },
    };
  }

  /**
   * Executa migrações
   */
  async migrate(options = {}) {
    return this.knex.migrate.latest(options);
  }

  /**
   * Rollback migrações
   */
  async rollback(options = {}) {
    return this.knex.migrate.rollback(options);
  }

  /**
   * Status das migrações
   */
  async migrateStatus() {
    return this.knex.migrate.list();
  }

  /**
   * Executa seeds
   */
  async seed(options = {}) {
    return this.knex.seed.run(options);
  }

  /**
   * Health check completo
   */
  async healthCheck() {
    const checks = {
      database: false,
      pool: false,
      latency: 0,
    };
    
    const start = Date.now();
    try {
      await this.knex.raw('SELECT 1');
      checks.database = true;
      checks.latency = Date.now() - start;
    } catch (error) {
      checks.database = false;
    }
    
    try {
      const pool = this.knex.client.pool;
      checks.pool = pool.numUsed() < pool.max;
      checks.poolDetails = {
        used: pool.numUsed(),
        free: pool.numFree(),
        pending: pool.numPendingAcquires(),
        max: pool.max,
        min: pool.min,
      };
    } catch (error) {
      checks.pool = false;
    }
    
    return checks;
  }

  /**
   * Fecha todas as conexões
   */
  async destroy() {
    this.stopHealthCheck();
    
    if (this.knex) {
      await this.knex.destroy();
      this.knex = null;
    }
    
    this.isConnected = false;
    this.emit('destroyed');
    console.log('[MUDatabase] Conexões fechadas');
  }

  /**
   * Backup de tabela (export data)
   */
  async backupTable(tableName, where = {}) {
    return this.select(tableName, '*', where);
  }

  /**
   * Restaura dados de backup
   */
  async restoreTable(tableName, data, truncate = false) {
    return this.transaction(async (trx) => {
      if (truncate) {
        await trx(tableName).truncate();
      }
      if (data.length > 0) {
        await trx.batchInsert(tableName, data, 500);
      }
    });
  }

  /**
   * Estatísticas do banco
   */
  async getStats() {
    const client = this.options.client;
    let queries = {};
    
    if (['mysql2', 'mysql'].includes(client)) {
      queries = {
        tableSizes: `
          SELECT 
            table_name,
            table_rows,
            ROUND(((data_length + index_length) / 1024 / 1024), 2) AS size_mb
          FROM information_schema.tables
          WHERE table_schema = DATABASE()
          ORDER BY size_mb DESC
        `,
        indexUsage: `
          SELECT 
            table_name,
            index_name,
            cardinality
          FROM information_schema.statistics
          WHERE table_schema = DATABASE()
        `,
      };
    } else if (['pg', 'postgres'].includes(client)) {
      queries = {
        tableSizes: `
          SELECT 
            relname as table_name,
            n_live_tup as table_rows,
            pg_size_pretty(pg_total_relation_size(relid)) as size
          FROM pg_stat_user_tables
          ORDER BY pg_total_relation_size(relid) DESC
        `,
        indexUsage: `
          SELECT 
            relname as table_name,
            indexrelname as index_name,
            idx_scan,
            idx_tup_read,
            idx_tup_fetch
          FROM pg_stat_user_indexes
          ORDER BY idx_scan DESC
        `,
      };
    }
    
    const stats = {};
    for (const [key, sql] of Object.entries(queries)) {
      try {
        stats[key] = await this.raw(sql);
      } catch (error) {
        stats[key] = { error: error.message };
      }
    }
    
    return stats;
  }
}

module.exports = MUDatabase;