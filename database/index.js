/**
 * Database Module - Barrel Export
 * 
 * MU Online Database Layer
 * Exporta todos os módulos de persistência
 */

const MUDatabase = require('./MUDatabase');
const AccountSystem = require('./AccountSystem');
const CharacterDB = require('./CharacterDB');
const WarehouseSystem = require('./WarehouseSystem');
const GuildDB = require('./GuildDB');
const RankingSystem = require('./RankingSystem');
const EventLogDB = require('./EventLogDB');
const dbConfig = require('./config/database');

/**
 * Inicializa todo o sistema de banco de dados
 * @param {Object} options - Opções de configuração
 * @returns {Object} Instâncias de todos os sistemas
 */
async function initializeDatabase(options = {}) {
  // Criar instância do database principal
  const database = new MUDatabase(options);
  
  try {
    await database.initialize();
  } catch (error) {
    console.error('[Database] Falha ao conectar:', error.message);
    throw error;
  }
  
  // Criar instâncias dos sistemas
  const accountSystem = new AccountSystem(database);
  const characterDB = new CharacterDB(database);
  const warehouseSystem = new WarehouseSystem(database);
  const guildDB = new GuildDB(database);
  const rankingSystem = new RankingSystem(database);
  const eventLogDB = new EventLogDB(database);
  
  // Inicializar tabelas em paralelo
  await Promise.all([
    accountSystem.initializeTables(),
    characterDB.initializeTables(),
    warehouseSystem.initializeTables(),
    guildDB.initializeTables(),
    rankingSystem.initializeTables(),
    eventLogDB.initializeTables(),
  ]);
  
  // Iniciar atualizações periódicas de ranking
  rankingSystem.startPeriodicUpdates();
  
  console.log('[Database] Todos os sistemas inicializados com sucesso');
  
  return {
    database,
    accountSystem,
    characterDB,
    warehouseSystem,
    guildDB,
    rankingSystem,
    eventLogDB,
    config: dbConfig,
  };
}

/**
 * Fecha todas as conexões
 */
async function closeDatabase(systems) {
  if (systems.rankingSystem) {
    systems.rankingSystem.stopPeriodicUpdates();
  }
  
  if (systems.eventLogDB) {
    systems.eventLogDB.stop();
  }
  
  if (systems.database) {
    await systems.database.destroy();
  }
  
  console.log('[Database] Todas as conexões fechadas');
}

/**
 * Health check completo
 */
async function healthCheck(systems) {
  const dbHealth = await systems.database.healthCheck();
  
  const rankingStats = await systems.rankingSystem.getStats();
  const logStats = await systems.eventLogDB.getLogStats();
  
  return {
    database: dbHealth,
    rankings: rankingStats,
    logs: logStats,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Executa migrações pendentes
 */
async function runMigrations(database, options = {}) {
  return database.migrate(options);
}

/**
 * Rollback migrações
 */
async function rollbackMigrations(database, options = {}) {
  return database.rollback(options);
}

/**
 * Executa seeds
 */
async function runSeeds(database, options = {}) {
  return database.seed(options);
}

/**
 * Cria backup de tabelas principais
 */
async function backupDatabase(systems, tables = null) {
  const defaultTables = [
    'accounts',
    'characters',
    'warehouse',
    'guilds',
    'guild_members',
    'guild_vault',
  ];
  
  const tablesToBackup = tables || defaultTables;
  const backup = {};
  
  for (const table of tablesToBackup) {
    try {
      backup[table] = await systems.database.backupTable(table);
    } catch (error) {
      backup[table] = { error: error.message };
    }
  }
  
  return backup;
}

/**
 * Restaura backup
 */
async function restoreDatabase(systems, backupData) {
  for (const [table, data] of Object.entries(backupData)) {
    if (data.error) continue;
    await systems.database.restoreTable(table, data, true);
  }
  return true;
}

// Exportações
module.exports = {
  // Classes principais
  MUDatabase,
  AccountSystem,
  CharacterDB,
  WarehouseSystem,
  GuildDB,
  RankingSystem,
  EventLogDB,
  
  // Configuração
  config: dbConfig,
  
  // Funções utilitárias
  initializeDatabase,
  closeDatabase,
  healthCheck,
  runMigrations,
  rollbackMigrations,
  runSeeds,
  backupDatabase,
  restoreDatabase,
  
  // Constantes úteis
  constants: {
    // Classes
    CHARACTER_CLASSES: {
      DARK_WIZARD: 0,
      SOUL_MASTER: 1,
      GRAND_MASTER: 2,
      DARK_KNIGHT: 3,
      BLADE_KNIGHT: 4,
      BLADE_MASTER: 5,
      FAIRY_ELF: 6,
      MUSE_ELF: 7,
      HIGH_ELF: 8,
      MAGIC_GLADIATOR: 16,
      DUEL_MASTER: 17,
      DARK_LORD: 32,
      LORD_EMPEROR: 33,
      SUMMONER: 48,
      BLOODY_SUMMONER: 49,
      DIMENSION_MASTER: 50,
      RAGE_FIGHTER: 64,
      FIST_MASTER: 65,
    },
    
    // Guild Ranks
    GUILD_RANKS: {
      MASTER: 0,
      ASSISTANT: 1,
      BATTLE_MASTER: 2,
      REGULAR: 3,
    },
    
    // VIP Types
    VIP_TYPES: {
      NONE: 0,
      BRONZE: 1,
      SILVER: 2,
      GOLD: 3,
      PLATINUM: 4,
    },
    
    // Account Block Codes
    BLOCK_CODES: {
      NORMAL: 0,
      TEMP_BAN: 1,
      PERM_BAN: 2,
    },
    
    // Ranking Types
    RANKING_TYPES: {
      LEVEL: 'level',
      MASTER_LEVEL: 'master_level',
      PK: 'pk',
      GENS: 'gens',
      RESET: 'reset',
    },
  },
};

module.exports.default = module.exports;