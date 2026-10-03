/**
 * RankingSystem.js - Sistema de Rankings do MU Online
 * 
 * Funcionalidades:
 * - Level Ranking (Top 100)
 * - PK Ranking
 * - Master Level Ranking
 * - Gens Ranking
 * - Battle Core, Devil Square, Blood Castle, Chaos Castle rankings
 * - Atualização periódica, cache
 */

const MUDatabase = require('./MUDatabase');

class RankingSystem {
  constructor(database) {
    this.db = database;
    this.tableName = 'rankings';
    this.historyTable = 'ranking_history';
    this.eventRankingTable = 'event_rankings';
    
    // Tipos de ranking
    this.rankingTypes = {
      level: 'level',
      master_level: 'master_level',
      pk: 'pk',
      gens: 'gens',
      reset: 'reset',
      battle_core: 'battle_core',
      devil_square: 'devil_square',
      blood_castle: 'blood_castle',
      chaos_castle: 'chaos_castle',
      illusion_temple: 'illusion_temple',
      imperial_guardian: 'imperial_guardian',
      double_goer: 'double_goer',
    };
    
    // Configurações
    this.config = {
      topLimit: 100,
      updateInterval: 5 * 60 * 1000, // 5 minutos
      historyRetentionDays: 30,
      cacheEnabled: true,
      cacheTTL: 60000, // 1 minuto
    };
    
    this.cache = new Map();
    this.updateTimers = new Map();
  }

  /**
   * Inicializa tabelas
   */
  async initializeTables() {
    const db = this.db.getKnex();
    
    // Tabela principal de rankings
    await db.schema.hasTable(this.tableName).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.tableName, (table) => {
          table.increments('id').primary();
          table.string('type', 30).notNullable(); // Tipo do ranking
          table.integer('character_id').unsigned().notNullable();
          table.string('name', 10).notNullable();
          table.integer('class').notNullable();
          table.integer('level').defaultTo(0);
          table.bigint('exp').defaultTo(0);
          table.integer('reset_count').defaultTo(0);
          table.integer('master_level').defaultTo(0);
          table.bigint('master_exp').defaultTo(0);
          table.integer('pk_count').defaultTo(0);
          table.integer('pk_level').defaultTo(0);
          table.bigint('gens_contribution').defaultTo(0);
          table.integer('gens_rank').defaultTo(0);
          table.integer('gens_family').defaultTo(0);
          table.bigint('score').defaultTo(0); // Score genérico
          table.integer('rank_position').defaultTo(0);
          table.integer('prev_rank_position').defaultTo(0);
          table.integer('rank_change').defaultTo(0); // +1 subiu, -1 desceu, 0 igual
          table.json('extra_data').nullable(); // Dados extras por tipo
          table.timestamp('calculated_at').defaultTo(db.fn.now());
          table.timestamp('updated_at').defaultTo(db.fn.now());
          
          table.unique(['type', 'character_id']);
          table.index(['type', 'rank_position']);
          table.index(['character_id']);
          table.index(['calculated_at']);
        });
        console.log('[RankingSystem] Tabela rankings criada');
      }
    });

    // Tabela de histórico de rankings
    await db.schema.hasTable(this.historyTable).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.historyTable, (table) => {
          table.increments('id').primary();
          table.string('type', 30).notNullable();
          table.integer('character_id').unsigned().notNullable();
          table.string('name', 10).notNullable();
          table.integer('rank_position').defaultTo(0);
          table.bigint('score').defaultTo(0);
          table.json('snapshot').nullable(); // Snapshot completo do personagem
          table.timestamp('recorded_at').defaultTo(db.fn.now());
          
          table.index(['type', 'recorded_at']);
          table.index(['character_id', 'recorded_at']);
        });
        console.log('[RankingSystem] Tabela ranking_history criada');
      }
    });

    // Tabela de rankings de eventos
    await db.schema.hasTable(this.eventRankingTable).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.eventRankingTable, (table) => {
          table.increments('id').primary();
          table.string('event_type', 30).notNullable(); // devil_square, blood_castle, etc
          table.integer('character_id').unsigned().notNullable();
          table.string('name', 10).notNullable();
          table.integer('class').notNullable();
          table.integer('round').defaultTo(0); // Rodada atual
          table.integer('best_round').defaultTo(0); // Melhor rodada
          table.integer('score').defaultTo(0); // Pontuação
          table.integer('kills').defaultTo(0);
          table.integer('deaths').defaultTo(0);
          table.integer('completion_time').defaultTo(0); // Tempo em segundos
          table.integer('reward_tier').defaultTo(0); // Tier de recompensa
          table.json('rewards').nullable(); // Recompensas recebidas
          table.timestamp('event_date').defaultTo(db.fn.now());
          table.timestamp('created_at').defaultTo(db.fn.now());
          
          table.index(['event_type', 'event_date']);
          table.index(['character_id', 'event_date']);
          table.index(['event_type', 'score']);
        });
        console.log('[RankingSystem] Tabela event_rankings criada');
      }
    });
  }

  /**
   * Atualiza todos os rankings
   */
  async updateAllRankings() {
    const types = Object.values(this.rankingTypes);
    const results = {};
    
    for (const type of types) {
      try {
        results[type] = await this.updateRanking(type);
      } catch (error) {
        console.error(`[RankingSystem] Erro ao atualizar ranking ${type}:`, error.message);
        results[type] = { error: error.message };
      }
    }
    
    return results;
  }

  /**
   * Atualiza ranking específico
   */
  async updateRanking(type) {
    const knex = this.db.getKnex();
    const charsTable = 'characters';
    
    let query;
    let orderBy = 'DESC';
    let scoreField = 'level';
    
    switch (type) {
      case this.rankingTypes.level:
        query = knex(charsTable)
          .whereNull('deleted_at')
          .where('level', '>', 0)
          .select('id', 'name', 'class', 'level', 'exp', 'reset_count', 'master_level', 'master_exp', 'pk_count', 'pk_level', 'gens_contribution', 'gens_rank', 'gens_family')
          .orderBy('level', 'DESC')
          .orderBy('exp', 'DESC')
          .orderBy('reset_count', 'DESC');
        scoreField = 'level';
        break;
        
      case this.rankingTypes.master_level:
        query = knex(charsTable)
          .whereNull('deleted_at')
          .where('master_level', '>', 0)
          .select('id', 'name', 'class', 'level', 'exp', 'reset_count', 'master_level', 'master_exp', 'pk_count', 'pk_level', 'gens_contribution', 'gens_rank', 'gens_family')
          .orderBy('master_level', 'DESC')
          .orderBy('master_exp', 'DESC')
          .orderBy('level', 'DESC');
        scoreField = 'master_level';
        break;
        
      case this.rankingTypes.pk:
        query = knex(charsTable)
          .whereNull('deleted_at')
          .where('pk_count', '>', 0)
          .select('id', 'name', 'class', 'level', 'exp', 'reset_count', 'master_level', 'master_exp', 'pk_count', 'pk_level', 'gens_contribution', 'gens_rank', 'gens_family')
          .orderBy('pk_count', 'DESC')
          .orderBy('pk_level', 'DESC')
          .orderBy('level', 'DESC');
        scoreField = 'pk_count';
        break;
        
      case this.rankingTypes.gens:
        query = knex(charsTable)
          .whereNull('deleted_at')
          .where('gens_family', '>', 0)
          .select('id', 'name', 'class', 'level', 'exp', 'reset_count', 'master_level', 'master_exp', 'pk_count', 'pk_level', 'gens_contribution', 'gens_rank', 'gens_family')
          .orderBy('gens_contribution', 'DESC')
          .orderBy('gens_rank', 'DESC')
          .orderBy('level', 'DESC');
        scoreField = 'gens_contribution';
        break;
        
      case this.rankingTypes.reset:
        query = knex(charsTable)
          .whereNull('deleted_at')
          .where('reset_count', '>', 0)
          .select('id', 'name', 'class', 'level', 'exp', 'reset_count', 'master_level', 'master_exp', 'pk_count', 'pk_level', 'gens_contribution', 'gens_rank', 'gens_family')
          .orderBy('reset_count', 'DESC')
          .orderBy('level', 'DESC')
          .orderBy('exp', 'DESC');
        scoreField = 'reset_count';
        break;
        
      default:
        throw new Error(`Tipo de ranking desconhecido: ${type}`);
    }
    
    const characters = await query.limit(this.config.topLimit * 2); // Pegar mais para calcular mudanças
    
    return this.db.transaction(async (trx) => {
      // Limpar ranking antigo desse tipo
      await trx(this.tableName).where('type', type).del();
      
      // Inserir novos rankings
      const now = trx.fn.now();
      const records = characters.map((char, index) => {
        const position = index + 1;
        let score = 0;
        
        switch (scoreField) {
          case 'level':
            score = char.level;
            break;
          case 'master_level':
            score = char.master_level;
            break;
          case 'pk_count':
            score = char.pk_count;
            break;
          case 'gens_contribution':
            score = char.gens_contribution;
            break;
          case 'reset_count':
            score = char.reset_count;
            break;
        }
        
        return {
          type,
          character_id: char.id,
          name: char.name,
          class: char.class,
          level: char.level,
          exp: char.exp,
          reset_count: char.reset_count,
          master_level: char.master_level,
          master_exp: char.master_exp,
          pk_count: char.pk_count,
          pk_level: char.pk_level,
          gens_contribution: char.gens_contribution,
          gens_rank: char.gens_rank,
          gens_family: char.gens_family,
          score,
          rank_position: position,
          prev_rank_position: 0, // Será atualizado abaixo
          rank_change: 0,
          extra_data: {},
          calculated_at: now,
        };
      });
      
      if (records.length > 0) {
        await trx.batchInsert(this.tableName, records, 100);
      }
      
      // Calcular mudanças de posição comparando com histórico anterior
      await this.calculateRankChanges(trx, type);
      
      // Salvar snapshot no histórico (apenas top 10)
      await this.saveHistorySnapshot(trx, type, characters.slice(0, 10));
      
      // Invalidar cache
      this.invalidateCache(type);
      
      return { type, updated: records.length, topCount: Math.min(records.length, this.config.topLimit) };
    });
  }

  /**
   * Calcula mudanças de rank comparando com ranking anterior
   */
  async calculateRankChanges(trx, type) {
    const previousRanking = await trx(this.historyTable)
      .where('type', type)
      .orderBy('recorded_at', 'DESC')
      .limit(this.config.topLimit)
      .select('character_id', 'rank_position');
    
    const prevMap = {};
    previousRanking.forEach((r, idx) => {
      prevMap[r.character_id] = idx + 1;
    });
    
    const currentRanking = await trx(this.tableName)
      .where('type', type)
      .select('id', 'character_id', 'rank_position');
    
    for (const current of currentRanking) {
      const prevPos = prevMap[current.character_id];
      let change = 0;
      
      if (prevPos) {
        if (prevPos > current.rank_position) change = 1; // Subiu
        else if (prevPos < current.rank_position) change = -1; // Desceu
      }
      
      await trx(this.tableName)
        .where('id', current.id)
        .update({
          prev_rank_position: prevPos || 0,
          rank_change: change,
        });
    }
  }

  /**
   * Salva snapshot no histórico
   */
  async saveHistorySnapshot(trx, type, topCharacters) {
    const now = trx.fn.now();
    const records = topCharacters.map((char, index) => {
      let score = 0;
      switch (type) {
        case this.rankingTypes.level: score = char.level; break;
        case this.rankingTypes.master_level: score = char.master_level; break;
        case this.rankingTypes.pk: score = char.pk_count; break;
        case this.rankingTypes.gens: score = char.gens_contribution; break;
        case this.rankingTypes.reset: score = char.reset_count; break;
      }
      
      return {
        type,
        character_id: char.id,
        name: char.name,
        rank_position: index + 1,
        score,
        snapshot: JSON.stringify(char),
        recorded_at: now,
      };
    });
    
    if (records.length > 0) {
      await trx.batchInsert(this.historyTable, records);
    }
  }

  /**
   * Obtém ranking com cache
   */
  async getRanking(type, options = {}) {
    const { limit = this.config.topLimit, offset = 0, useCache = true } = options;
    const cacheKey = `${type}:${limit}:${offset}`;
    
    if (useCache && this.config.cacheEnabled && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.config.cacheTTL) {
        return cached.data;
      }
    }
    
    const data = await this.db.select(this.tableName, '*', { type })
      .orderBy('rank_position')
      .limit(limit)
      .offset(offset);
    
    if (useCache && this.config.cacheEnabled) {
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
    }
    
    return data;
  }

  /**
   * Obtém posição de um personagem no ranking
   */
  async getCharacterRank(type, characterId) {
    const entry = await this.db.select(this.tableName, '*', { type, character_id: characterId }).first();
    return entry || null;
  }

  /**
   * Obtém ranking ao redor de um personagem
   */
  async getRankingAroundCharacter(type, characterId, range = 5) {
    const entry = await this.getCharacterRank(type, characterId);
    if (!entry) return [];
    
    const start = Math.max(1, entry.rank_position - range);
    const end = entry.rank_position + range;
    
    return this.db.select(this.tableName, '*', { type })
      .whereBetween('rank_position', [start, end])
      .orderBy('rank_position');
  }

  /**
   * Registra resultado de evento
   */
  async recordEventResult(eventType, characterId, data) {
    const { name, class: charClass, round, score, kills = 0, deaths = 0, completionTime = 0, rewards = [] } = data;
    
    const bestRound = await this.getBestEventRound(eventType, characterId);
    const isNewBest = round > bestRound;
    
    await this.db.insert(this.eventRankingTable, {
      event_type: eventType,
      character_id: characterId,
      name,
      class: charClass,
      round,
      best_round: isNewBest ? round : bestRound,
      score,
      kills,
      deaths,
      completion_time: completionTime,
      reward_tier: this.calculateRewardTier(eventType, round, score),
      rewards: JSON.stringify(rewards),
    });
    
    // Atualizar ranking do evento se necessário
    if (isNewBest) {
      await this.updateEventRanking(eventType);
    }
    
    return { isNewBest, bestRound: isNewBest ? round : bestRound };
  }

  /**
   * Obtém melhor rodada de evento do personagem
   */
  async getBestEventRound(eventType, characterId) {
    const result = await this.db.getKnex()(this.eventRankingTable)
      .where('event_type', eventType)
      .where('character_id', characterId)
      .max('best_round as max')
      .first();
    return parseInt(result?.max || 0);
  }

  /**
   * Calcula tier de recompensa
   */
  calculateRewardTier(eventType, round, score) {
    // Lógica simplificada de tier
    if (round >= 7) return 3; // Top tier
    if (round >= 5) return 2; // Mid tier
    if (round >= 3) return 1; // Low tier
    return 0;
  }

  /**
   * Atualiza ranking de evento
   */
  async updateEventRanking(eventType) {
    // Implementar ranking específico do evento baseado em best_round, score, etc
    console.log(`[RankingSystem] Atualizando ranking de evento: ${eventType}`);
  }

  /**
   * Obtém ranking de evento
   */
  async getEventRanking(eventType, options = {}) {
    const { limit = this.config.topLimit, offset = 0, date = null } = options;
    
    let query = this.db.select(this.eventRankingTable, '*', { event_type: eventType })
      .orderBy('best_round', 'DESC')
      .orderBy('score', 'DESC')
      .orderBy('completion_time', 'ASC')
      .limit(limit)
      .offset(offset);
    
    if (date) {
      query = query.where('event_date', date);
    }
    
    return query;
  }

  /**
   * Obtém histórico de ranking de um personagem
   */
  async getCharacterHistory(characterId, type = null, limit = 50) {
    let query = this.db.select(this.historyTable, '*', { character_id: characterId })
      .orderBy('recorded_at', 'DESC')
      .limit(limit);
    
    if (type) query = query.where('type', type);
    
    return query;
  }

  /**
   * Obtém histórico de ranking por tipo
   */
  async getTypeHistory(type, limit = 100, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    return this.db.select(this.historyTable, '*', { type })
      .where('recorded_at', '>=', startDate)
      .orderBy('recorded_at', 'DESC')
      .limit(limit);
  }

  /**
   * Invalida cache de um tipo
   */
  invalidateCache(type = null) {
    if (type) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${type}:`)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  /**
   * Inicia atualização periódica
   */
  startPeriodicUpdates() {
    for (const type of Object.values(this.rankingTypes)) {
      const timer = setInterval(() => {
        this.updateRanking(type).catch(err => 
          console.error(`[RankingSystem] Erro na atualização periódica de ${type}:`, err.message)
        );
      }, this.config.updateInterval);
      
      timer.unref();
      this.updateTimers.set(type, timer);
    }
    console.log('[RankingSystem] Atualizações periódicas iniciadas');
  }

  /**
   * Para atualizações periódicas
   */
  stopPeriodicUpdates() {
    for (const timer of this.updateTimers.values()) {
      clearInterval(timer);
    }
    this.updateTimers.clear();
    console.log('[RankingSystem] Atualizações periódicas paradas');
  }

  /**
   * Limpa histórico antigo
   */
  async cleanupOldHistory() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.historyRetentionDays);
    
    return this.db.getKnex()(this.historyTable)
      .where('recorded_at', '<', cutoffDate)
      .del();
  }

  /**
   * Reseta ranking (para nova season)
   */
  async resetRanking(type) {
    await this.db.getKnex()(this.tableName).where('type', type).del();
    await this.db.getKnex()(this.historyTable).where('type', type).del();
    this.invalidateCache(type);
    return true;
  }

  /**
   * Obtém estatísticas do sistema de ranking
   */
  async getStats() {
    const stats = {};
    
    for (const type of Object.values(this.rankingTypes)) {
      const count = await this.db.getKnex()(this.tableName)
        .where('type', type)
        .count('* as c')
        .first();
      stats[type] = { entries: parseInt(count?.c || 0) };
    }
    
    const eventCounts = await this.db.getKnex()(this.eventRankingTable)
      .groupBy('event_type')
      .count('* as c')
      .select('event_type');
    
    stats.events = {};
    eventCounts.forEach(e => {
      stats.events[e.event_type] = parseInt(e.c);
    });
    
    return stats;
  }
}

module.exports = RankingSystem;