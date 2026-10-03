/**
 * EventLogDB.js - Sistema de Logs/Auditoria do MU Online
 * 
 * Funcionalidades:
 * - Login/Logout, Trade, PK, ItemDrop/Pickup, ChaosMachine, Quest
 * - Cheat detection logs, GM command logs
 * - Auditoria de itens (dupe detection, trade logs)
 * - Particionamento por data, compressão, retention policies
 */

const MUDatabase = require('./MUDatabase');

class EventLogDB {
  constructor(database) {
    this.db = database;
    
    // Tabelas de log
    this.tables = {
      login: 'event_login',
      logout: 'event_logout',
      trade: 'event_trade',
      pk: 'event_pk',
      item_drop: 'event_item_drop',
      item_pickup: 'event_item_pickup',
      chaos_machine: 'event_chaos_machine',
      quest: 'event_quest',
      gm_command: 'event_gm_command',
      cheat_detection: 'event_cheat_detection',
      item_audit: 'event_item_audit',
      guild: 'event_guild',
      warehouse: 'event_warehouse',
      party: 'event_party',
      mail: 'event_mail',
      purchase: 'event_purchase',
    };
    
    // Categorias para queries
    this.categories = {
      player: ['login', 'logout', 'trade', 'pk', 'item_drop', 'item_pickup', 'quest', 'party', 'mail'],
      system: ['chaos_machine', 'guild', 'warehouse', 'purchase'],
      security: ['gm_command', 'cheat_detection', 'item_audit'],
    };
    
    // Configurações
    this.config = {
      partitionByMonth: true,
      retentionDays: {
        login: 90,
        logout: 90,
        trade: 180,
        pk: 180,
        item_drop: 30,
        item_pickup: 30,
        chaos_machine: 180,
        quest: 180,
        gm_command: 365,
        cheat_detection: 365,
        item_audit: 365,
        guild: 180,
        warehouse: 180,
        party: 90,
        mail: 180,
        purchase: 365,
      },
      batchSize: 1000,
      flushInterval: 5000, // 5 segundos
      compressOldLogs: true,
      enableRealTimeAlerts: true,
    };
    
    // Buffer para batch inserts
    this.buffers = {};
    this.flushTimers = {};
    this.alertCallbacks = [];
  }

  /**
   * Inicializa todas as tabelas de log
   */
  async initializeTables() {
    const db = this.db.getKnex();
    
    // Schema base para logs comuns
    const baseSchema = (table) => {
      table.increments('id').primary();
      table.integer('account_id').unsigned().nullable();
      table.integer('character_id').unsigned().nullable();
      table.string('character_name', 10).nullable();
      table.string('ip', 45).nullable();
      table.string('hwid', 64).nullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.index(['account_id', 'created_at']);
      table.index(['character_id', 'created_at']);
      table.index(['created_at']);
    };
    
    // Login logs
    await this.createLogTable(this.tables.login, (table) => {
      baseSchema(table);
      table.boolean('success').notNullable();
      table.string('failure_reason', 100).nullable();
      table.string('user_agent', 500).nullable();
      table.string('server_id', 20).nullable();
    });

    // Logout logs
    await this.createLogTable(this.tables.logout, (table) => {
      baseSchema(table);
      table.integer('session_duration').defaultTo(0); // segundos
      table.string('logout_type', 20).defaultTo('normal'); // normal, crash, kick, gm
      table.string('last_map', 50).nullable();
      table.integer('last_x').nullable();
      table.integer('last_y').nullable();
    });

    // Trade logs
    await this.createLogTable(this.tables.trade, (table) => {
      baseSchema(table);
      table.integer('target_account_id').unsigned().nullable();
      table.integer('target_character_id').unsigned().nullable();
      table.string('target_name', 10).nullable();
      table.string('trade_type', 20).notNullable(); // player, personal_shop, npc
      table.json('items_given').nullable();
      table.json('items_received').nullable();
      table.bigint('zen_given').defaultTo(0);
      table.bigint('zen_received').defaultTo(0);
      table.boolean('completed').defaultTo(true);
      table.string('cancel_reason', 100).nullable();
      table.index(['target_character_id', 'created_at']);
    });

    // PK logs
    await this.createLogTable(this.tables.pk, (table) => {
      baseSchema(table);
      table.integer('victim_character_id').unsigned().nullable();
      table.string('victim_name', 10).nullable();
      table.integer('victim_level').nullable();
      table.string('killer_name', 10).nullable();
      table.integer('killer_level').nullable();
      table.string('pk_type', 20).defaultTo('normal'); // normal, self_defense, duel, guild_war
      table.integer('map_number').nullable();
      table.integer('map_x').nullable();
      table.integer('map_y').nullable();
      table.json('victim_items_lost').nullable();
      table.integer('pk_level_before').nullable();
      table.integer('pk_level_after').nullable();
      table.index(['victim_character_id', 'created_at']);
    });

    // Item Drop logs
    await this.createLogTable(this.tables.item_drop, (table) => {
      baseSchema(table);
      table.integer('item_id').notNullable();
      table.integer('item_level').defaultTo(0);
      table.integer('item_durability').defaultTo(0);
      table.integer('item_option1').defaultTo(0);
      table.integer('item_option2').defaultTo(0);
      table.integer('item_option3').defaultTo(0);
      table.integer('item_exc_option').defaultTo(0);
      table.integer('item_ancient_option').defaultTo(0);
      table.integer('socket_count').defaultTo(0);
      table.json('socket_options').nullable();
      table.string('serial', 32).nullable();
      table.integer('map_number').nullable();
      table.integer('map_x').nullable();
      table.integer('map_y').nullable();
      table.string('drop_type', 20).defaultTo('monster'); // monster, player_death, trade, delete
      table.integer('source_id').nullable(); // Monster ID ou Character ID
      table.index(['serial', 'created_at']);
      table.index(['map_number', 'created_at']);
    });

    // Item Pickup logs
    await this.createLogTable(this.tables.item_pickup, (table) => {
      baseSchema(table);
      table.integer('item_id').notNullable();
      table.integer('item_level').defaultTo(0);
      table.integer('item_durability').defaultTo(0);
      table.integer('item_option1').defaultTo(0);
      table.integer('item_option2').defaultTo(0);
      table.integer('item_option3').defaultTo(0);
      table.integer('item_exc_option').defaultTo(0);
      table.integer('item_ancient_option').defaultTo(0);
      table.integer('socket_count').defaultTo(0);
      table.json('socket_options').nullable();
      table.string('serial', 32).nullable();
      table.integer('map_number').nullable();
      table.integer('map_x').nullable();
      table.integer('map_y').nullable();
      table.string('pickup_type', 20).defaultTo('ground'); // ground, trade, personal_shop
      table.integer('source_character_id').nullable();
      table.index(['serial', 'created_at']);
      table.index(['source_character_id', 'created_at']);
    });

    // Chaos Machine logs
    await this.createLogTable(this.tables.chaos_machine, (table) => {
      baseSchema(table);
      table.integer('mix_type').notNullable(); // Tipo da mixagem
      table.json('input_items').nullable(); // Itens usados
      table.json('output_items').nullable(); // Itens resultantes
      table.boolean('success').notNullable();
      table.integer('success_rate').nullable(); // Taxa de sucesso
      table.bigint('zen_cost').defaultTo(0);
      table.string('result', 50).nullable(); // success, fail, destroyed
    });

    // Quest logs
    await this.createLogTable(this.tables.quest, (table) => {
      baseSchema(table);
      table.integer('quest_id').notNullable();
      table.string('quest_name', 100).nullable();
      table.string('action', 20).notNullable(); // start, progress, complete, fail, abandon
      table.integer('progress_value').defaultTo(0);
      table.json('rewards').nullable();
      table.index(['quest_id', 'created_at']);
    });

    // GM Command logs
    await this.createLogTable(this.tables.gm_command, (table) => {
      baseSchema(table);
      table.string('command', 100).notNullable();
      table.json('parameters').nullable();
      table.string('target_name', 10).nullable();
      table.integer('target_account_id').nullable();
      table.integer('target_character_id').nullable();
      table.boolean('success').defaultTo(true);
      table.string('result_message', 500).nullable();
      table.integer('gm_level').nullable();
      table.index(['command', 'created_at']);
      table.index(['target_character_id', 'created_at']);
    });

    // Cheat Detection logs
    await this.createLogTable(this.tables.cheat_detection, (table) => {
      baseSchema(table);
      table.string('detection_type', 50).notNullable(); // speedhack, wallhack, dupe, packet_edit, etc
      table.string('severity', 20).defaultTo('medium'); // low, medium, high, critical
      table.text('details').nullable();
      table.json('evidence').nullable(); // Packet dumps, screenshots refs, etc
      table.boolean('action_taken').defaultTo(false);
      table.string('action_type', 50).nullable(); // warning, kick, ban, log_only
      table.boolean('false_positive').defaultTo(false);
      table.integer('reviewed_by').nullable(); // GM ID
      table.timestamp('reviewed_at').nullable();
      table.index(['detection_type', 'created_at']);
      table.index(['severity', 'created_at']);
    });

    // Item Audit logs (para anti-dupe, trade tracking)
    await this.createLogTable(this.tables.item_audit, (table) => {
      baseSchema(table);
      table.string('action', 30).notNullable(); // create, move, trade, drop, pickup, destroy, upgrade, socket, dupe_check
      table.integer('item_id').notNullable();
      table.integer('item_level').defaultTo(0);
      table.integer('item_durability').defaultTo(0);
      table.integer('item_option1').defaultTo(0);
      table.integer('item_option2').defaultTo(0);
      table.integer('item_option3').defaultTo(0);
      table.integer('item_exc_option').defaultTo(0);
      table.integer('item_ancient_option').defaultTo(0);
      table.integer('socket_count').defaultTo(0);
      table.json('socket_options').nullable();
      table.string('serial', 32).nullable();
      table.string('from_location', 50).nullable(); // inventory, vault, trade, ground, chaos, etc
      table.string('to_location', 50).nullable();
      table.integer('from_character_id').nullable();
      table.integer('to_character_id').nullable();
      table.integer('from_account_id').nullable();
      table.integer('to_account_id').nullable();
      table.string('reason', 100).nullable();
      table.boolean('flagged').defaultTo(false); // Marcado para revisão
      table.index(['serial', 'created_at']);
      table.index(['item_id', 'created_at']);
      table.index(['from_character_id', 'to_character_id', 'created_at']);
      table.index(['flagged', 'created_at']);
    });

    // Guild logs
    await this.createLogTable(this.tables.guild, (table) => {
      baseSchema(table);
      table.integer('guild_id').unsigned().nullable();
      table.string('guild_name', 8).nullable();
      table.string('action', 30).notNullable(); // create, join, leave, kick, promote, demote, war_declare, war_end, vault_deposit, vault_withdraw, alliance
      table.string('target_name', 10).nullable();
      table.json('data').nullable();
    });

    // Warehouse logs
    await this.createLogTable(this.tables.warehouse, (table) => {
      baseSchema(table);
      table.string('action', 20).notNullable(); // deposit, withdraw, move, expand
      table.integer('slot').nullable();
      table.integer('item_id').defaultTo(0);
      table.integer('item_level').defaultTo(0);
      table.integer('item_durability').defaultTo(0);
      table.integer('item_option1').defaultTo(0);
      table.integer('item_option2').defaultTo(0);
      table.integer('item_option3').defaultTo(0);
      table.integer('item_exc_option').defaultTo(0);
      table.integer('item_ancient_option').defaultTo(0);
      table.integer('socket_count').defaultTo(0);
      table.json('socket_options').nullable();
      table.string('serial', 32).nullable();
      table.integer('stack_count').defaultTo(1);
      table.bigint('zen_change').defaultTo(0);
      table.index(['serial', 'created_at']);
    });

    // Party logs
    await this.createLogTable(this.tables.party, (table) => {
      baseSchema(table);
      table.integer('party_id').unsigned().nullable();
      table.string('action', 20).notNullable(); // create, join, leave, disband, kick, leader_change
      table.integer('target_character_id').nullable();
      table.string('target_name', 10).nullable();
      table.json('members').nullable();
    });

    // Mail logs
    await this.createLogTable(this.tables.mail, (table) => {
      baseSchema(table);
      table.integer('mail_id').unsigned().nullable();
      table.string('action', 20).notNullable(); // send, receive, read, delete, claim_item, claim_zen
      table.integer('sender_id').nullable();
      table.string('sender_name', 10).nullable();
      table.integer('recipient_id').nullable();
      table.string('recipient_name', 10).nullable();
      table.string('subject', 100).nullable();
      table.json('items').nullable();
      table.bigint('zen_amount').defaultTo(0);
      table.index(['recipient_id', 'created_at']);
    });

    // Purchase logs (cash shop)
    await this.createLogTable(this.tables.purchase, (table) => {
      baseSchema(table);
      table.string('transaction_id', 64).nullable();
      table.string('product_id', 50).nullable();
      table.string('product_name', 100).nullable();
      table.integer('category').nullable(); // 1=items, 2=services, 3=packages
      table.integer('quantity').defaultTo(1);
      table.bigint('price_coin').defaultTo(0);
      table.bigint('price_ruud').defaultTo(0);
      table.bigint('price_zen').defaultTo(0);
      table.string('payment_method', 30).nullable();
      table.string('payment_status', 20).defaultTo('completed'); // pending, completed, failed, refunded
      table.json('items_received').nullable();
      table.index(['transaction_id']);
      table.index(['payment_status', 'created_at']);
    });

    console.log('[EventLogDB] Todas as tabelas de log criadas');
  }

  /**
   * Helper para criar tabela de log
   */
  async createLogTable(tableName, schemaFn) {
    const db = this.db.getKnex();
    const exists = await db.schema.hasTable(tableName);
    if (!exists) {
      await db.schema.createTable(tableName, schemaFn);
    }
    // Inicializar buffer
    this.buffers[tableName] = [];
    this.startFlushTimer(tableName);
  }

  /**
   * Inicia timer de flush periódico
   */
  startFlushTimer(tableName) {
    this.flushTimers[tableName] = setInterval(() => {
      this.flushBuffer(tableName).catch(err => 
        console.error(`[EventLogDB] Erro ao flush ${tableName}:`, err.message)
      );
    }, this.config.flushInterval);
    this.flushTimers[tableName].unref();
  }

  /**
   * Adiciona entrada ao buffer
   */
  async log(tableName, data) {
    if (!this.buffers[tableName]) {
      this.buffers[tableName] = [];
    }
    
    this.buffers[tableName].push({
      ...data,
      created_at: new Date(),
    });
    
    // Flush imediato se buffer cheio
    if (this.buffers[tableName].length >= this.config.batchSize) {
      await this.flushBuffer(tableName);
    }
  }

  /**
   * Flush do buffer para o banco
   */
  async flushBuffer(tableName) {
    const buffer = this.buffers[tableName];
    if (!buffer || buffer.length === 0) return;
    
    this.buffers[tableName] = [];
    
    try {
      const knex = this.db.getKnex();
      await knex.batchInsert(tableName, buffer, this.config.batchSize);
      
      // Verificar alertas para logs de segurança
      if (this.config.enableRealTimeAlerts) {
        this.checkAlerts(tableName, buffer);
      }
    } catch (error) {
      // Recolocar no buffer em caso de erro
      this.buffers[tableName] = [...buffer, ...this.buffers[tableName]];
      throw error;
    }
  }

  /**
   * Verifica alertas em tempo real
   */
  checkAlerts(tableName, entries) {
    for (const entry of entries) {
      // Alertas de cheat detection
      if (tableName === this.tables.cheat_detection && entry.severity === 'critical') {
        this.triggerAlert('cheat_critical', entry);
      }
      
      // Alertas de GM commands suspeitos
      if (tableName === this.tables.gm_command) {
        const suspiciousCommands = ['ban', 'unban', 'giveitem', 'setlevel', 'setzen', 'spawn'];
        if (suspiciousCommands.some(cmd => entry.command.includes(cmd))) {
          this.triggerAlert('gm_suspicious_command', entry);
        }
      }
      
      // Alertas de item audit (dupe detection)
      if (tableName === this.tables.item_audit && entry.flagged) {
        this.triggerAlert('item_dupe_suspected', entry);
      }
      
      // Alertas de PK excessivo
      if (tableName === this.tables.pk && entry.pk_type === 'normal') {
        // Verificar se player está PKando muito
        this.checkExcessivePK(entry.character_id);
      }
    }
  }

  /**
   * Trigger de alerta
   */
  triggerAlert(type, data) {
    for (const callback of this.alertCallbacks) {
      try {
        callback(type, data);
      } catch (err) {
        console.error('[EventLogDB] Erro em callback de alerta:', err.message);
      }
    }
  }

  /**
   * Registra callback para alertas
   */
  onAlert(callback) {
    this.alertCallbacks.push(callback);
  }

  /**
   * Verifica PK excessivo
   */
  async checkExcessivePK(characterId) {
    const recent = await this.db.getKnex()(this.tables.pk)
      .where('character_id', characterId)
      .where('created_at', '>=', this.db.getKnex().raw("DATE_SUB(NOW(), INTERVAL 1 HOUR)"))
      .count('* as c')
      .first();
    
    if (parseInt(recent?.c || 0) > 20) {
      this.triggerAlert('excessive_pk', { character_id: characterId, count: recent.c });
    }
  }

  // ============ MÉTODOS PÚBLICOS DE LOG ============

  /**
   * Log de login
   */
  async logLogin(data) {
    return this.log(this.tables.login, data);
  }

  /**
   * Log de logout
   */
  async logLogout(data) {
    return this.log(this.tables.logout, data);
  }

  /**
   * Log de trade
   */
  async logTrade(data) {
    return this.log(this.tables.trade, data);
  }

  /**
   * Log de PK
   */
  async logPK(data) {
    return this.log(this.tables.pk, data);
  }

  /**
   * Log de item drop
   */
  async logItemDrop(data) {
    return this.log(this.tables.item_drop, data);
  }

  /**
   * Log de item pickup
   */
  async logItemPickup(data) {
    return this.log(this.tables.item_pickup, data);
  }

  /**
   * Log de chaos machine
   */
  async logChaosMachine(data) {
    return this.log(this.tables.chaos_machine, data);
  }

  /**
   * Log de quest
   */
  async logQuest(data) {
    return this.log(this.tables.quest, data);
  }

  /**
   * Log de comando GM
   */
  async logGMCommand(data) {
    return this.log(this.tables.gm_command, data);
  }

  /**
   * Log de detecção de cheat
   */
  async logCheatDetection(data) {
    return this.log(this.tables.cheat_detection, data);
  }

  /**
   * Log de auditoria de item
   */
  async logItemAudit(data) {
    return this.log(this.tables.item_audit, data);
  }

  /**
   * Log de guild
   */
  async logGuild(data) {
    return this.log(this.tables.guild, data);
  }

  /**
   * Log de warehouse
   */
  async logWarehouse(data) {
    return this.log(this.tables.warehouse, data);
  }

  /**
   * Log de party
   */
  async logParty(data) {
    return this.log(this.tables.party, data);
  }

  /**
   * Log de mail
   */
  async logMail(data) {
    return this.log(this.tables.mail, data);
  }

  /**
   * Log de compra
   */
  async logPurchase(data) {
    return this.log(this.tables.purchase, data);
  }

  // ============ MÉTODOS DE QUERY ============

  /**
   * Busca logs com filtros
   */
  async getLogs(tableName, filters = {}, options = {}) {
    const { limit = 100, offset = 0, orderBy = 'created_at', orderDirection = 'DESC', startDate = null, endDate = null } = options;
    
    let query = this.db.getKnex()(tableName);
    
    // Aplicar filtros
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        query = query.where(key, value);
      }
    }
    
    // Filtros de data
    if (startDate) query = query.where('created_at', '>=', startDate);
    if (endDate) query = query.where('created_at', '<=', endDate);
    
    return query
      .orderBy(orderBy, orderDirection)
      .limit(limit)
      .offset(offset);
  }

  /**
   * Busca logs de um personagem
   */
  async getCharacterLogs(characterId, categories = null, options = {}) {
    const tablesToSearch = categories 
      ? categories.flatMap(c => this.categories[c] || [c])
      : Object.values(this.tables);
    
    const results = {};
    
    for (const tableName of tablesToSearch) {
      const logs = await this.getLogs(tableName, { character_id: characterId }, options);
      if (logs.length > 0) {
        results[tableName] = logs;
      }
    }
    
    return results;
  }

  /**
   * Busca logs de uma conta
   */
  async getAccountLogs(accountId, categories = null, options = {}) {
    const tablesToSearch = categories 
      ? categories.flatMap(c => this.categories[c] || [c])
      : Object.values(this.tables);
    
    const results = {};
    
    for (const tableName of tablesToSearch) {
      const logs = await this.getLogs(tableName, { account_id: accountId }, options);
      if (logs.length > 0) {
        results[tableName] = logs;
      }
    }
    
    return results;
  }

  /**
   * Busca trades entre dois personagens
   */
  async getTradeHistory(characterId1, characterId2, limit = 50) {
    return this.db.getKnex()(this.tables.trade)
      .where(function() {
        this.where('character_id', characterId1).where('target_character_id', characterId2);
      })
      .orWhere(function() {
        this.where('character_id', characterId2).where('target_character_id', characterId1);
      })
      .orderBy('created_at', 'DESC')
      .limit(limit);
  }

  /**
   * Busca histórico de item por serial
   */
  async getItemHistoryBySerial(serial) {
    const tables = [this.tables.item_audit, this.tables.item_drop, this.tables.item_pickup, this.tables.trade, this.tables.chaos_machine, this.tables.warehouse];
    const results = {};
    
    for (const table of tables) {
      const logs = await this.db.getKnex()(table)
        .where('serial', serial)
        .orderBy('created_at', 'ASC');
      if (logs.length > 0) {
        results[table] = logs;
      }
    }
    
    return results;
  }

  /**
   * Detecta possíveis dupes por serial
   */
  async detectDupeSerials(minOccurrences = 2) {
    const tables = [this.tables.item_audit, 'character_inventory', 'character_equipment', 'warehouse', 'guild_vault'];
    const serialCounts = {};
    
    for (const table of tables) {
      try {
        const rows = await this.db.getKnex()(table)
          .whereNotNull('serial')
          .where('serial', '!=', '')
          .select('serial');
        
        for (const row of rows) {
          serialCounts[row.serial] = (serialCounts[row.serial] || 0) + 1;
        }
      } catch (e) {
        // Tabela pode não existir
      }
    }
    
    return Object.entries(serialCounts)
      .filter(([_, count]) => count >= minOccurrences)
      .map(([serial, count]) => ({ serial, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Obtém estatísticas de logs
   */
  async getLogStats(days = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const stats = {};
    
    for (const [name, tableName] of Object.entries(this.tables)) {
      try {
        const count = await this.db.getKnex()(tableName)
          .where('created_at', '>=', startDate)
          .count('* as c')
          .first();
        stats[name] = { count: parseInt(count?.c || 0), retentionDays: this.config.retentionDays[name] };
      } catch (e) {
        stats[name] = { count: 0, error: e.message };
      }
    }
    
    return stats;
  }

  /**
   * Limpa logs antigos baseado na retention policy
   */
  async cleanupOldLogs() {
    const results = {};
    
    for (const [name, tableName] of Object.entries(this.tables)) {
      const retentionDays = this.config.retentionDays[name] || 90;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      try {
        const deleted = await this.db.getKnex()(tableName)
          .where('created_at', '<', cutoffDate)
          .del();
        results[name] = { deleted, cutoffDate };
      } catch (e) {
        results[name] = { error: e.message };
      }
    }
    
    return results;
  }

  /**
   * Exporta logs para análise (CSV/JSON)
   */
  async exportLogs(tableName, filters = {}, format = 'json') {
    const logs = await this.getLogs(tableName, filters, { limit: 10000 });
    
    if (format === 'csv') {
      if (logs.length === 0) return '';
      const headers = Object.keys(logs[0]).join(',');
      const rows = logs.map(log => Object.values(log).map(v => 
        typeof v === 'object' ? JSON.stringify(v) : String(v).replace(/"/g, '""')
      ).map(v => `"${v}"`).join(','));
      return [headers, ...rows].join('\n');
    }
    
    return JSON.stringify(logs, null, 2);
  }

  /**
   * Para todos os timers de flush
   */
  stop() {
    for (const timer of Object.values(this.flushTimers)) {
      clearInterval(timer);
    }
    this.flushTimers = {};
    
    // Flush final de todos os buffers
    for (const tableName of Object.keys(this.buffers)) {
      this.flushBuffer(tableName).catch(err => 
        console.error(`[EventLogDB] Erro no flush final de ${tableName}:`, err.message)
      );
    }
  }

  /**
   * Força flush de todos os buffers
   */
  async flushAll() {
    for (const tableName of Object.keys(this.buffers)) {
      await this.flushBuffer(tableName);
    }
  }
}

module.exports = EventLogDB;