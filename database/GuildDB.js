/**
 * GuildDB.js - Sistema de Guilds do MU Online
 * 
 * Funcionalidades:
 * - Guild (Name, Mark[8x8], Master, Score, Members, Notice, WarState, WarScore)
 * - Members: Name, Rank (Master/Assistant/BattleMaster/Regular), Contribution, Online
 * - Guild War: declaração, score, kill count, reward
 * - Guild Vault (Vault separado), Guild Alliance
 */

const MUDatabase = require('./MUDatabase');
const crypto = require('crypto');

class GuildDB {
  constructor(database) {
    this.db = database;
    this.tableName = 'guilds';
    this.memberTable = 'guild_members';
    this.warTable = 'guild_wars';
    this.vaultTable = 'guild_vault';
    this.allianceTable = 'guild_alliances';
    this.logTable = 'guild_logs';
    
    // Ranks
    this.ranks = {
      0: 'Master',
      1: 'Assistant',
      2: 'Battle Master',
      3: 'Regular',
    };
    
    // Configurações
    this.config = {
      minLevel: 10,
      maxMembers: 100,
      createCost: 1000000, // 1M zen
      markSize: 64, // 8x8 = 64 bytes
      warDuration: 60 * 60 * 1000, // 1 hora
      warKillReward: 100, // Score por kill
      maxAlliances: 3,
      vaultBaseSlots: 120,
      vaultMaxSlots: 480,
    };
  }

  /**
   * Inicializa tabelas
   */
  async initializeTables() {
    const db = this.db.getKnex();
    
    // Tabela principal de guilds
    await db.schema.hasTable(this.tableName).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.tableName, (table) => {
          table.increments('id').primary();
          table.string('name', 8).unique().notNullable(); // Max 8 chars no MU
          table.binary('mark', this.config.markSize).nullable(); // 8x8 bitmap
          table.integer('master_id').unsigned().notNullable(); // Character ID do master
          table.string('master_name', 10).notNullable();
          table.bigint('score').defaultTo(0); // Guild score
          table.integer('member_count').defaultTo(1);
          table.integer('max_members').defaultTo(this.config.maxMembers);
          table.text('notice').nullable();
          table.tinyint('war_state').defaultTo(0); // 0=peace, 1=declared, 2=war, 3=ended
          table.bigint('war_score').defaultTo(0);
          table.integer('war_kills').defaultTo(0);
          table.integer('war_deaths').defaultTo(0);
          table.integer('enemy_guild_id').nullable(); // Guild ID inimigo na guerra
          table.datetime('war_declared_at').nullable();
          table.datetime('war_ends_at').nullable();
          table.integer('level').defaultTo(1); // Guild level
          table.bigint('exp').defaultTo(0); // Guild exp
          table.json('settings').nullable(); // Configurações
          table.timestamp('created_at').defaultTo(db.fn.now());
          table.timestamp('updated_at').defaultTo(db.fn.now());
          table.timestamp('deleted_at').nullable();
          
          table.foreign('master_id').references('id').inTable('characters').onDelete('RESTRICT');
          table.index(['name']);
          table.index(['master_id']);
          table.index(['war_state']);
          table.index(['score']);
        });
        console.log('[GuildDB] Tabela guilds criada');
      }
    });

    // Tabela de membros
    await db.schema.hasTable(this.memberTable).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.memberTable, (table) => {
          table.increments('id').primary();
          table.integer('guild_id').unsigned().notNullable();
          table.integer('character_id').unsigned().notNullable();
          table.string('name', 10).notNullable();
          table.tinyint('rank').defaultTo(3); // 0=Master, 1=Assistant, 2=BattleMaster, 3=Regular
          table.bigint('contribution').defaultTo(0); // Contribuição total
          table.bigint('contribution_day').defaultTo(0); // Contribuição diária
          table.bigint('contribution_week').defaultTo(0); // Contribuição semanal
          table.boolean('is_online').defaultTo(false);
          table.datetime('last_online').nullable();
          table.datetime('joined_at').defaultTo(db.fn.now());
          table.timestamp('created_at').defaultTo(db.fn.now());
          table.timestamp('updated_at').defaultTo(db.fn.now());
          
          table.foreign('guild_id').references('id').inTable(this.tableName).onDelete('CASCADE');
          table.foreign('character_id').references('id').inTable('characters').onDelete('CASCADE');
          table.unique(['guild_id', 'character_id']);
          table.index(['guild_id', 'rank']);
          table.index(['character_id']);
          table.index(['is_online']);
        });
        console.log('[GuildDB] Tabela guild_members criada');
      }
    });

    // Tabela de guerras
    await db.schema.hasTable(this.warTable).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.warTable, (table) => {
          table.increments('id').primary();
          table.integer('guild_id_1').unsigned().notNullable();
          table.integer('guild_id_2').unsigned().notNullable();
          table.integer('declared_by').unsigned().notNullable(); // Guild ID que declarou
          table.tinyint('state').defaultTo(1); // 1=declared, 2=active, 3=ended, 4=cancelled
          table.bigint('score_1').defaultTo(0);
          table.bigint('score_2').defaultTo(0);
          table.integer('kills_1').defaultTo(0);
          table.integer('kills_2').defaultTo(0);
          table.integer('deaths_1').defaultTo(0);
          table.integer('deaths_2').defaultTo(0);
          table.datetime('starts_at').nullable();
          table.datetime('ends_at').nullable();
          table.json('rewards').nullable(); // Recompensas para vencedor
          table.timestamp('created_at').defaultTo(db.fn.now());
          table.timestamp('updated_at').defaultTo(db.fn.now());
          
          table.foreign('guild_id_1').references('id').inTable(this.tableName).onDelete('CASCADE');
          table.foreign('guild_id_2').references('id').inTable(this.tableName).onDelete('CASCADE');
          table.index(['guild_id_1', 'state']);
          table.index(['guild_id_2', 'state']);
          table.index(['state']);
        });
        console.log('[GuildDB] Tabela guild_wars criada');
      }
    });

    // Tabela do vault da guild
    await db.schema.hasTable(this.vaultTable).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.vaultTable, (table) => {
          table.increments('id').primary();
          table.integer('guild_id').unsigned().notNullable();
          table.integer('slot').notNullable();
          table.integer('item_id').defaultTo(0);
          table.integer('level').defaultTo(0);
          table.integer('durability').defaultTo(0);
          table.integer('option1').defaultTo(0);
          table.integer('option2').defaultTo(0);
          table.integer('option3').defaultTo(0);
          table.integer('exc_option').defaultTo(0);
          table.integer('ancient_option').defaultTo(0);
          table.integer('socket_count').defaultTo(0);
          table.json('socket_options').nullable();
          table.string('serial', 32).nullable();
          table.integer('stack_count').defaultTo(1);
          table.integer('deposited_by').unsigned().nullable(); // Character ID
          table.timestamp('created_at').defaultTo(db.fn.now());
          table.timestamp('updated_at').defaultTo(db.fn.now());
          
          table.foreign('guild_id').references('id').inTable(this.tableName).onDelete('CASCADE');
          table.foreign('deposited_by').references('id').inTable('characters').onDelete('SET NULL');
          table.unique(['guild_id', 'slot']);
          table.index(['guild_id']);
          table.index(['serial']);
        });
        console.log('[GuildDB] Tabela guild_vault criada');
      }
    });

    // Tabela de alianças
    await db.schema.hasTable(this.allianceTable).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.allianceTable, (table) => {
          table.increments('id').primary();
          table.integer('guild_id_1').unsigned().notNullable();
          table.integer('guild_id_2').unsigned().notNullable();
          table.integer('requested_by').unsigned().notNullable();
          table.tinyint('state').defaultTo(1); // 1=pending, 2=active, 3=rejected, 4=cancelled
          table.timestamp('created_at').defaultTo(db.fn.now());
          table.timestamp('updated_at').defaultTo(db.fn.now());
          
          table.foreign('guild_id_1').references('id').inTable(this.tableName).onDelete('CASCADE');
          table.foreign('guild_id_2').references('id').inTable(this.tableName).onDelete('CASCADE');
          table.unique(['guild_id_1', 'guild_id_2']);
          table.index(['guild_id_1', 'state']);
          table.index(['guild_id_2', 'state']);
        });
        console.log('[GuildDB] Tabela guild_alliances criada');
      }
    });

    // Tabela de logs
    await db.schema.hasTable(this.logTable).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.logTable, (table) => {
          table.increments('id').primary();
          table.integer('guild_id').unsigned().notNullable();
          table.integer('character_id').unsigned().nullable();
          table.string('action', 50).notNullable(); // create, join, leave, kick, promote, demote, war_declare, war_end, vault_deposit, vault_withdraw, alliance_request, alliance_accept
          table.string('target_name', 10).nullable(); // Nome do alvo (se aplicável)
          table.json('data').nullable(); // Dados extras
          table.string('ip', 45).nullable();
          table.timestamp('created_at').defaultTo(db.fn.now());
          
          table.foreign('guild_id').references('id').inTable(this.tableName).onDelete('CASCADE');
          table.foreign('character_id').references('id').inTable('characters').onDelete('SET NULL');
          table.index(['guild_id', 'created_at']);
          table.index(['action']);
          table.index(['character_id']);
        });
        console.log('[GuildDB] Tabela guild_logs criada');
      }
    });
  }

  /**
   * Cria nova guild
   */
  async createGuild(masterCharacterId, name, mark = null) {
    return this.db.transaction(async (trx) => {
      // Validações
      if (!name || name.length < 3 || name.length > 8) {
        throw new Error('Nome da guild deve ter entre 3 e 8 caracteres');
      }

      // Verificar se master existe e não está em outra guild
      const master = await trx('characters').where('id', masterCharacterId).first();
      if (!master) throw new Error('Personagem não encontrado');
      if (master.level < this.config.minLevel) {
        throw new Error(`Level mínimo para criar guild: ${this.config.minLevel}`);
      }
      if (master.guild_id) {
        throw new Error('Personagem já pertence a uma guild');
      }

      // Verificar nome único
      const existing = await trx(this.tableName).where('name', name).first();
      if (existing) throw new Error('Nome de guild já existe');

      // Verificar zen
      if (master.zen < this.config.createCost) {
        throw new Error(`Zen insuficiente (necessário: ${this.config.createCost})`);
      }

      // Cobrar zen
      await trx('characters').where('id', masterCharacterId).decrement('zen', this.config.createCost);

      // Criar guild
      const [guildId] = await trx(this.tableName).insert({
        name,
        mark: mark ? Buffer.from(mark) : null,
        master_id: masterCharacterId,
        master_name: master.name,
        member_count: 1,
      });

      // Adicionar master como membro
      await trx(this.memberTable).insert({
        guild_id: guildId,
        character_id: masterCharacterId,
        name: master.name,
        rank: 0, // Master
        contribution: 0,
        is_online: true,
        last_online: trx.fn.now(),
      });

      // Atualizar personagem
      await trx('characters').where('id', masterCharacterId).update({
        guild_id: guildId,
        guild_rank: 0,
      });

      // Inicializar vault
      await this.initializeVault(trx, guildId);

      // Log
      await this.logAction(trx, guildId, masterCharacterId, 'create', { name });

      return { guildId, name };
    });
  }

  /**
   * Inicializa vault da guild
   */
  async initializeVault(trx, guildId) {
    const slots = [];
    for (let i = 0; i < this.config.vaultBaseSlots; i++) {
      slots.push({
        guild_id: guildId,
        slot: i,
        item_id: 0,
        level: 0,
        durability: 0,
        option1: 0,
        option2: 0,
        option3: 0,
        exc_option: 0,
        ancient_option: 0,
        socket_count: 0,
        socket_options: null,
        serial: null,
        stack_count: 1,
      });
    }
    await trx.batchInsert(this.vaultTable, slots, 100);
  }

  /**
   * Busca guild por ID
   */
  async getGuildById(guildId) {
    return this.db.select(this.tableName, '*', { id: guildId }).first();
  }

  /**
   * Busca guild por nome
   */
  async getGuildByName(name) {
    return this.db.select(this.tableName, '*', { name }).first();
  }

  /**
   * Busca guild do personagem
   */
  async getCharacterGuild(characterId) {
    const character = await this.db.getKnex()('characters').where('id', characterId).select('guild_id').first();
    if (!character || !character.guild_id) return null;
    return this.getGuildById(character.guild_id);
  }

  /**
   * Lista membros da guild
   */
  async getGuildMembers(guildId, options = {}) {
    const { rank = null, onlineOnly = false, limit = 100, offset = 0 } = options;
    
    let query = this.db.select(this.memberTable, '*', { guild_id: guildId })
      .orderBy('rank')
      .orderBy('contribution', 'DESC')
      .limit(limit)
      .offset(offset);

    if (rank !== null) query = query.where('rank', rank);
    if (onlineOnly) query = query.where('is_online', true);

    return query;
  }

  /**
   * Obtém info de membro
   */
  async getMemberInfo(guildId, characterId) {
    return this.db.select(this.memberTable, '*', { guild_id: guildId, character_id: characterId }).first();
  }

  /**
   * Convida para guild
   */
  async inviteToGuild(guildId, inviterCharacterId, targetCharacterId) {
    return this.db.transaction(async (trx) => {
      const guild = await this.getGuildById(guildId);
      if (!guild) throw new Error('Guild não encontrada');

      const inviter = await this.getMemberInfo(guildId, inviterCharacterId);
      if (!inviter) throw new Error('Convidante não é membro da guild');
      if (inviter.rank > 1) throw new Error('Apenas Master e Assistant podem convidar');

      // Verificar se guild tem espaço
      if (guild.member_count >= guild.max_members) {
        throw new Error('Guild cheia');
      }

      // Verificar target
      const target = await trx('characters').where('id', targetCharacterId).first();
      if (!target) throw new Error('Personagem não encontrado');
      if (target.guild_id) throw new Error('Personagem já está em uma guild');
      if (target.level < this.config.minLevel) {
        throw new Error(`Personagem precisa ser level ${this.config.minLevel}+`);
      }

      // Aqui você implementaria sistema de convite pendente
      // Por simplicidade, adicionar direto
      return this.addMember(guildId, targetCharacterId, target.name, 3, inviterCharacterId);
    });
  }

  /**
   * Adiciona membro
   */
  async addMember(guildId, characterId, name, rank = 3, invitedBy = null) {
    return this.db.transaction(async (trx) => {
      const guild = await trx(this.tableName).where('id', guildId).first();
      if (!guild) throw new Error('Guild não encontrada');

      if (guild.member_count >= guild.max_members) {
        throw new Error('Guild cheia');
      }

      // Verificar se já é membro
      const existing = await trx(this.memberTable).where('guild_id', guildId).where('character_id', characterId).first();
      if (existing) throw new Error('Já é membro da guild');

      await trx(this.memberTable).insert({
        guild_id: guildId,
        character_id: characterId,
        name,
        rank,
        contribution: 0,
        is_online: true,
        last_online: trx.fn.now(),
      });

      await trx(this.tableName).where('id', guildId).increment('member_count', 1);
      await trx('characters').where('id', characterId).update({ guild_id: guildId, guild_rank: rank });

      await this.logAction(trx, guildId, invitedBy, 'join', { target_name: name, rank });

      return true;
    });
  }

  /**
   * Remove membro
   */
  async removeMember(guildId, characterId, removerCharacterId, reason = 'kicked') {
    return this.db.transaction(async (trx) => {
      const guild = await this.getGuildById(guildId);
      if (!guild) throw new Error('Guild não encontrada');

      const remover = await this.getMemberInfo(guildId, removerCharacterId);
      if (!remover) throw new Error('Removente não é membro da guild');

      const target = await this.getMemberInfo(guildId, characterId);
      if (!target) throw new Error('Alvo não é membro da guild');

      // Verificar permissão
      if (target.rank === 0) throw new Error('Não pode remover o Master');
      if (remover.rank >= target.rank && remover.rank !== 0) throw new Error('Sem permissão para remover este membro');

      await trx(this.memberTable).where('guild_id', guildId).where('character_id', characterId).del();
      await trx(this.tableName).where('id', guildId).decrement('member_count', 1);
      await trx('characters').where('id', characterId).update({ guild_id: null, guild_rank: null });

      await this.logAction(trx, guildId, removerCharacterId, 'leave', { target_name: target.name, reason });

      // Se era master, promover próximo
      if (target.rank === 0) {
        await this.promoteNewMaster(trx, guildId);
      }

      return true;
    });
  }

  /**
   * Promove novo master (quando master sai)
   */
  async promoteNewMaster(trx, guildId) {
    const assistant = await trx(this.memberTable)
      .where('guild_id', guildId)
      .where('rank', 1)
      .orderBy('contribution', 'DESC')
      .first();

    if (assistant) {
      await trx(this.memberTable).where('id', assistant.id).update({ rank: 0 });
      await trx(this.tableName).where('id', guildId).update({ 
        master_id: assistant.character_id,
        master_name: assistant.name,
      });
      await trx('characters').where('id', assistant.character_id).update({ guild_rank: 0 });
      
      await this.logAction(trx, guildId, assistant.character_id, 'promote', { 
        target_name: assistant.name, 
        new_rank: 0,
        reason: 'auto_promote' 
      });
    }
  }

  /**
   * Promove membro
   */
  async promoteMember(guildId, characterId, promoterCharacterId) {
    return this.db.transaction(async (trx) => {
      const promoter = await this.getMemberInfo(guildId, promoterCharacterId);
      if (!promoter || promoter.rank !== 0) throw new Error('Apenas Master pode promover');

      const target = await this.getMemberInfo(guildId, characterId);
      if (!target) throw new Error('Membro não encontrado');
      if (target.rank === 0) throw new Error('Já é Master');
      if (target.rank === 1) throw new Error('Já é Assistant');

      const newRank = target.rank - 1; // 2->1, 3->2
      await trx(this.memberTable).where('id', target.id).update({ rank: newRank });
      await trx('characters').where('id', characterId).update({ guild_rank: newRank });

      await this.logAction(trx, guildId, promoterCharacterId, 'promote', { 
        target_name: target.name, 
        new_rank: newRank 
      });

      return true;
    });
  }

  /**
   * Rebaixa membro
   */
  async demoteMember(guildId, characterId, demoterCharacterId) {
    return this.db.transaction(async (trx) => {
      const demoter = await this.getMemberInfo(guildId, demoterCharacterId);
      if (!demoter || demoter.rank !== 0) throw new Error('Apenas Master pode rebaixar');

      const target = await this.getMemberInfo(guildId, characterId);
      if (!target) throw new Error('Membro não encontrado');
      if (target.rank >= 3) throw new Error('Já é Regular');

      const newRank = Math.min(target.rank + 1, 3);
      await trx(this.memberTable).where('id', target.id).update({ rank: newRank });
      await trx('characters').where('id', characterId).update({ guild_rank: newRank });

      await this.logAction(trx, guildId, demoterCharacterId, 'demote', { 
        target_name: target.name, 
        new_rank: newRank 
      });

      return true;
    });
  }

  /**
   * Atualiza status online do membro
   */
  async updateMemberOnline(guildId, characterId, isOnline) {
    const updateData = { 
      is_online,
      updated_at: this.db.getKnex().fn.now(),
    };
    
    if (!isOnline) {
      updateData.last_online = this.db.getKnex().fn.now();
    }

    return this.db.update(this.memberTable, { guild_id: guildId, character_id: characterId }, updateData);
  }

  /**
   * Adiciona contribuição
   */
  async addContribution(guildId, characterId, amount) {
    const member = await this.getMemberInfo(guildId, characterId);
    if (!member) return false;

    const newContribution = (member.contribution || 0) + amount;
    const newDay = (member.contribution_day || 0) + amount;
    const newWeek = (member.contribution_week || 0) + amount;

    await this.db.update(this.memberTable, { id: member.id }, {
      contribution: newContribution,
      contribution_day: newDay,
      contribution_week: newWeek,
    });

    // Atualizar score da guild
    await this.db.getKnex()(this.tableName).where('id', guildId).increment('score', amount);

    return { contribution: newContribution, day: newDay, week: newWeek };
  }

  /**
   * Reseta contribuições diárias/semanais
   */
  async resetDailyContributions() {
    await this.db.getKnex()(this.memberTable).update({ contribution_day: 0 });
  }

  async resetWeeklyContributions() {
    await this.db.getKnex()(this.memberTable).update({ contribution_week: 0 });
  }

  /**
   * Atualiza notice da guild
   */
  async updateNotice(guildId, characterId, notice) {
    const member = await this.getMemberInfo(guildId, characterId);
    if (!member || member.rank > 1) throw new Error('Apenas Master e Assistant podem alterar notice');

    await this.db.update(this.tableName, { id: guildId }, { notice });
    await this.logAction(this.db.getKnex(), guildId, characterId, 'update_notice', { notice });
    return true;
  }

  /**
   * Atualiza mark da guild
   */
  async updateMark(guildId, characterId, markBuffer) {
    const member = await this.getMemberInfo(guildId, characterId);
    if (!member || member.rank !== 0) throw new Error('Apenas Master pode alterar mark');

    if (markBuffer && markBuffer.length !== this.config.markSize) {
      throw new Error(`Mark deve ter ${this.config.markSize} bytes (8x8)`);
    }

    await this.db.update(this.tableName, { id: guildId }, { mark: markBuffer });
    await this.logAction(this.db.getKnex(), guildId, characterId, 'update_mark', {});
    return true;
  }

  /**
   * Declara guerra
   */
  async declareWar(guildId, targetGuildId, characterId) {
    return this.db.transaction(async (trx) => {
      const guild = await this.getGuildById(guildId);
      const targetGuild = await this.getGuildById(targetGuildId);
      
      if (!guild || !targetGuild) throw new Error('Guild não encontrada');
      if (guild.id === targetGuildId) throw new Error('Não pode declarar guerra contra si mesmo');
      
      const member = await this.getMemberInfo(guildId, characterId);
      if (!member || member.rank !== 0) throw new Error('Apenas Master pode declarar guerra');

      // Verificar se já há guerra ativa
      const existingWar = await trx(this.warTable)
        .where(function() {
          this.where('guild_id_1', guildId).orWhere('guild_id_2', guildId);
        })
        .whereIn('state', [1, 2])
        .first();
      
      if (existingWar) throw new Error('Já existe guerra ativa');

      const existingWar2 = await trx(this.warTable)
        .where(function() {
          this.where('guild_id_1', targetGuildId).orWhere('guild_id_2', targetGuildId);
        })
        .whereIn('state', [1, 2])
        .first();
      
      if (existingWar2) throw new Error('Guild alvo já está em guerra');

      const [warId] = await trx(this.warTable).insert({
        guild_id_1: guildId,
        guild_id_2: targetGuildId,
        declared_by: guildId,
        state: 1, // declared
      });

      // Atualizar estado das guilds
      await trx(this.tableName).where('id', guildId).update({ war_state: 1, enemy_guild_id: targetGuildId, war_declared_at: trx.fn.now() });
      await trx(this.tableName).where('id', targetGuildId).update({ war_state: 1, enemy_guild_id: guildId, war_declared_at: trx.fn.now() });

      await this.logAction(trx, guildId, characterId, 'war_declare', { target_guild: targetGuild.name, war_id: warId });
      await this.logAction(trx, targetGuildId, null, 'war_declared_on', { enemy_guild: guild.name, war_id: warId });

      return { warId };
    });
  }

  /**
   * Aceita guerra
   */
  async acceptWar(warId, characterId) {
    return this.db.transaction(async (trx) => {
      const war = await trx(this.warTable).where('id', warId).first();
      if (!war) throw new Error('Guerra não encontrada');
      if (war.state !== 1) throw new Error('Guerra não está em estado de declaração');

      const targetGuild = await this.getGuildById(war.guild_id_2);
      const member = await this.getMemberInfo(targetGuild.id, characterId);
      if (!member || member.rank !== 0) throw new Error('Apenas Master da guild alvo pode aceitar');

      const startsAt = new Date();
      const endsAt = new Date(startsAt.getTime() + this.config.warDuration);

      await trx(this.warTable).where('id', warId).update({
        state: 2, // active
        starts_at: startsAt,
        ends_at: endsAt,
      });

      await trx(this.tableName).where('id', war.guild_id_1).update({ war_state: 2, war_ends_at: endsAt });
      await trx(this.tableName).where('id', war.guild_id_2).update({ war_state: 2, war_ends_at: endsAt });

      await this.logAction(trx, war.guild_id_1, characterId, 'war_accepted', { war_id: warId });
      await this.logAction(trx, war.guild_id_2, characterId, 'war_accepted', { war_id: warId });

      return { startsAt, endsAt };
    });
  }

  /**
   * Registra kill na guerra
   */
  async recordWarKill(warId, killerGuildId, victimGuildId) {
    return this.db.transaction(async (trx) => {
      const war = await trx(this.warTable).where('id', warId).where('state', 2).first();
      if (!war) return false;

      const isGuild1 = war.guild_id_1 === killerGuildId;
      const scoreField = isGuild1 ? 'score_1' : 'score_2';
      const killsField = isGuild1 ? 'kills_1' : 'kills_2';
      const deathsField = isGuild1 ? 'deaths_2' : 'deaths_1';
      const guildScoreField = isGuild1 ? 'war_score' : 'war_score'; // Both update same field in guilds table

      await trx(this.warTable).where('id', warId).increment({
        [scoreField]: this.config.warKillReward,
        [killsField]: 1,
        [deathsField]: 1,
      });

      // Atualizar guild score
      const guildId = isGuild1 ? war.guild_id_1 : war.guild_id_2;
      await trx(this.tableName).where('id', guildId).increment('war_score', this.config.warKillReward);
      await trx(this.tableName).where('id', guildId).increment('war_kills', 1);
      
      const victimGuildId2 = isGuild1 ? war.guild_id_2 : war.guild_id_1;
      await trx(this.tableName).where('id', victimGuildId2).increment('war_deaths', 1);

      return true;
    });
  }

  /**
   * Finaliza guerra (por tempo ou rendição)
   */
  async endWar(warId, winnerGuildId = null) {
    return this.db.transaction(async (trx) => {
      const war = await trx(this.warTable).where('id', warId).first();
      if (!war) throw new Error('Guerra não encontrada');

      let winner = winnerGuildId;
      if (!winner) {
        // Determinar vencedor por score
        if (war.score_1 > war.score_2) winner = war.guild_id_1;
        else if (war.score_2 > war.score_1) winner = war.guild_id_2;
        else winner = war.guild_id_1; // Empate: quem declarou vence
      }

      await trx(this.warTable).where('id', warId).update({
        state: 3, // ended
        ends_at: trx.fn.now(),
      });

      // Resetar estado das guilds
      await trx(this.tableName).whereIn('id', [war.guild_id_1, war.guild_id_2]).update({
        war_state: 0,
        enemy_guild_id: null,
        war_declared_at: null,
        war_ends_at: null,
        war_score: 0,
        war_kills: 0,
        war_deaths: 0,
      });

      // Dar recompensas ao vencedor
      if (winner && war.rewards) {
        // Implementar distribuição de recompensas
      }

      await this.logAction(trx, war.guild_id_1, null, 'war_end', { winner, war_id: warId });
      await this.logAction(trx, war.guild_id_2, null, 'war_end', { winner, war_id: warId });

      return { winner };
    });
  }

  /**
   * Cancela declaração de guerra
   */
  async cancelWar(warId, characterId) {
    return this.db.transaction(async (trx) => {
      const war = await trx(this.warTable).where('id', warId).first();
      if (!war || war.state !== 1) throw new Error('Guerra não pode ser cancelada');

      const guild = await this.getGuildById(war.declared_by);
      const member = await this.getMemberInfo(guild.id, characterId);
      if (!member || member.rank !== 0) throw new Error('Apenas Master pode cancelar');

      await trx(this.warTable).where('id', warId).update({ state: 4 }); // cancelled

      await trx(this.tableName).whereIn('id', [war.guild_id_1, war.guild_id_2]).update({
        war_state: 0,
        enemy_guild_id: null,
        war_declared_at: null,
      });

      await this.logAction(trx, war.guild_id_1, characterId, 'war_cancel', { war_id: warId });
      await this.logAction(trx, war.guild_id_2, null, 'war_cancelled', { war_id: warId });

      return true;
    });
  }

  /**
   * Deposita item no vault da guild
   */
  async depositToVault(guildId, characterId, itemData, slot = null) {
    return this.db.transaction(async (trx) => {
      const member = await this.getMemberInfo(guildId, characterId);
      if (!member) throw new Error('Não é membro da guild');

      // Verificar permissão (rank 0, 1, 2 podem depositar)
      if (member.rank > 2) throw new Error('Sem permissão para depositar');

      // Encontrar slot
      let targetSlot = slot;
      if (targetSlot === null) {
        const items = await trx(this.vaultTable).where('guild_id', guildId).where('item_id', 0).orderBy('slot').first();
        if (!items) throw new Error('Vault cheio');
        targetSlot = items.slot;
      }

      const serial = itemData.serial || this.generateSerial();
      await this.checkDupe(serial, trx);

      await trx(this.vaultTable)
        .where('guild_id', guildId)
        .where('slot', targetSlot)
        .update({
          item_id: itemData.itemId,
          level: itemData.level || 0,
          durability: itemData.durability || 0,
          option1: itemData.option1 || 0,
          option2: itemData.option2 || 0,
          option3: itemData.option3 || 0,
          exc_option: itemData.excOption || 0,
          ancient_option: itemData.ancientOption || 0,
          socket_count: itemData.socketCount || 0,
          socket_options: itemData.socketOptions ? JSON.stringify(itemData.socketOptions) : null,
          serial,
          stack_count: itemData.stackCount || 1,
          deposited_by: characterId,
          updated_at: trx.fn.now(),
        });

      await this.logAction(trx, guildId, characterId, 'vault_deposit', { slot: targetSlot, ...itemData, serial });

      return { slot: targetSlot, serial };
    });
  }

  /**
   * Saca item do vault da guild
   */
  async withdrawFromVault(guildId, characterId, slot) {
    return this.db.transaction(async (trx) => {
      const member = await this.getMemberInfo(guildId, characterId);
      if (!member) throw new Error('Não é membro da guild');
      if (member.rank > 1) throw new Error('Apenas Master e Assistant podem sacar');

      const item = await trx(this.vaultTable)
        .where('guild_id', guildId)
        .where('slot', slot)
        .first();

      if (!item || item.item_id === 0) throw new Error('Slot vazio');

      const itemData = { ...item };

      await trx(this.vaultTable)
        .where('guild_id', guildId)
        .where('slot', slot)
        .update({
          item_id: 0,
          level: 0,
          durability: 0,
          option1: 0,
          option2: 0,
          option3: 0,
          exc_option: 0,
          ancient_option: 0,
          socket_count: 0,
          socket_options: null,
          serial: null,
          stack_count: 1,
          deposited_by: null,
          updated_at: trx.fn.now(),
        });

      await this.logAction(trx, guildId, characterId, 'vault_withdraw', { slot, ...itemData });

      return itemData;
    });
  }

  /**
   * Lista itens do vault
   */
  async getVaultItems(guildId) {
    return this.db.select(this.vaultTable, '*', { guild_id: guildId }).orderBy('slot');
  }

  /**
   * Solicita aliança
   */
  async requestAlliance(guildId, targetGuildId, characterId) {
    return this.db.transaction(async (trx) => {
      const guild = await this.getGuildById(guildId);
      const targetGuild = await this.getGuildById(targetGuildId);
      
      if (!guild || !targetGuild) throw new Error('Guild não encontrada');
      if (guild.id === targetGuildId) throw new Error('Não pode aliar com si mesmo');

      const member = await this.getMemberInfo(guildId, characterId);
      if (!member || member.rank !== 0) throw new Error('Apenas Master pode solicitar aliança');

      // Verificar alianças atuais
      const alliances1 = await trx(this.allianceTable)
        .where(function() {
          this.where('guild_id_1', guildId).orWhere('guild_id_2', guildId);
        })
        .where('state', 2)
        .count('* as c')
        .first();
      
      if (parseInt(alliances1.c) >= this.config.maxAlliances) {
        throw new Error('Máximo de alianças atingido');
      }

      const alliances2 = await trx(this.allianceTable)
        .where(function() {
          this.where('guild_id_1', targetGuildId).orWhere('guild_id_2', targetGuildId);
        })
        .where('state', 2)
        .count('* as c')
        .first();
      
      if (parseInt(alliances2.c) >= this.config.maxAlliances) {
        throw new Error('Guild alvo já tem máximo de alianças');
      }

      // Verificar se já existe solicitação
      const existing = await trx(this.allianceTable)
        .where(function() {
          this.where('guild_id_1', guildId).where('guild_id_2', targetGuildId)
            .orWhere('guild_id_1', targetGuildId).where('guild_id_2', guildId);
        })
        .whereIn('state', [1, 2])
        .first();
      
      if (existing) throw new Error('Já existe aliança ou solicitação pendente');

      await trx(this.allianceTable).insert({
        guild_id_1: guildId,
        guild_id_2: targetGuildId,
        requested_by: guildId,
        state: 1, // pending
      });

      await this.logAction(trx, guildId, characterId, 'alliance_request', { target_guild: targetGuild.name });
      await this.logAction(trx, targetGuildId, null, 'alliance_requested', { from_guild: guild.name });

      return true;
    });
  }

  /**
   * Aceita aliança
   */
  async acceptAlliance(allianceId, characterId) {
    return this.db.transaction(async (trx) => {
      const alliance = await trx(this.allianceTable).where('id', allianceId).first();
      if (!alliance || alliance.state !== 1) throw new Error('Solicitação não encontrada ou inválida');

      const targetGuild = await this.getGuildById(alliance.guild_id_2);
      const member = await this.getMemberInfo(targetGuild.id, characterId);
      if (!member || member.rank !== 0) throw new Error('Apenas Master pode aceitar');

      await trx(this.allianceTable).where('id', allianceId).update({ state: 2 }); // active

      await this.logAction(trx, alliance.guild_id_1, characterId, 'alliance_accept', { target_guild: targetGuild.name });
      await this.logAction(trx, alliance.guild_id_2, characterId, 'alliance_accept', { from_guild: (await this.getGuildById(alliance.guild_id_1)).name });

      return true;
    });
  }

  /**
   * Rejeita aliança
   */
  async rejectAlliance(allianceId, characterId) {
    const alliance = await this.db.select(this.allianceTable, '*', { id: allianceId }).first();
    if (!alliance || alliance.state !== 1) throw new Error('Solicitação não encontrada');

    const targetGuild = await this.getGuildById(alliance.guild_id_2);
    const member = await this.getMemberInfo(targetGuild.id, characterId);
    if (!member || member.rank !== 0) throw new Error('Apenas Master pode rejeitar');

    await this.db.update(this.allianceTable, { id: allianceId }, { state: 3 }); // rejected
    await this.logAction(this.db.getKnex(), alliance.guild_id_1, characterId, 'alliance_reject', { target_guild: targetGuild.name });
    
    return true;
  }

  /**
   * Cancela aliança
   */
  async cancelAlliance(guildId, characterId) {
    return this.db.transaction(async (trx) => {
      const member = await this.getMemberInfo(guildId, characterId);
      if (!member || member.rank !== 0) throw new Error('Apenas Master pode cancelar aliança');

      const alliance = await trx(this.allianceTable)
        .where(function() {
          this.where('guild_id_1', guildId).orWhere('guild_id_2', guildId);
        })
        .where('state', 2)
        .first();
      
      if (!alliance) throw new Error('Nenhuma aliança ativa');

      const otherGuildId = alliance.guild_id_1 === guildId ? alliance.guild_id_2 : alliance.guild_id_1;
      
      await trx(this.allianceTable).where('id', alliance.id).update({ state: 4 }); // cancelled

      await this.logAction(trx, guildId, characterId, 'alliance_cancel', { other_guild: (await this.getGuildById(otherGuildId)).name });
      await this.logAction(trx, otherGuildId, null, 'alliance_cancelled', { other_guild: (await this.getGuildById(guildId)).name });

      return true;
    });
  }

  /**
   * Lista alianças ativas
   */
  async getAlliances(guildId) {
    return this.db.getKnex()(this.allianceTable)
      .where(function() {
        this.where('guild_id_1', guildId).orWhere('guild_id_2', guildId);
      })
      .where('state', 2)
      .select('*');
  }

  /**
   * Obtém logs da guild
   */
  async getGuildLogs(guildId, options = {}) {
    const { limit = 100, offset = 0, action = null } = options;
    
    let query = this.db.select(this.logTable, '*', { guild_id: guildId })
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    if (action) query = query.where('action', action);

    return query;
  }

  /**
   * Registra ação no log
   */
  async logAction(trxOrDb, guildId, characterId, action, data = {}) {
    const db = trxOrDb || this.db.getKnex();
    await db(this.logTable).insert({
      guild_id: guildId,
      character_id: characterId,
      action,
      target_name: data.target_name || null,
      data: data ? JSON.stringify(data) : null,
      ip: data.ip || null,
    });
  }

  /**
   * Gera serial único
   */
  generateSerial() {
    return crypto.randomBytes(16).toString('hex').toUpperCase();
  }

  /**
   * Verifica anti-dupe
   */
  async checkDupe(serial, trx) {
    if (!serial) return;
    const tables = [this.vaultTable, 'character_inventory', 'character_equipment', 'warehouse'];
    for (const table of tables) {
      const existing = await trx(table).where('serial', serial).first();
      if (existing) throw new Error(`Item duplicado detectado (serial: ${serial})`);
    }
  }

  /**
   * Ranking de guilds
   */
  async getGuildRanking(limit = 100) {
    return this.db.select(this.tableName, 
      'id,name,master_name,score,member_count,level,war_state',
      { deleted_at: null }
    )
    .orderBy('score', 'DESC')
    .limit(limit);
  }

  /**
   * Estatísticas da guild
   */
  async getGuildStats(guildId) {
    const guild = await this.getGuildById(guildId);
    if (!guild) return null;

    const [members, onlineMembers, vaultItems, wars, alliances] = await Promise.all([
      this.db.getKnex()(this.memberTable).where('guild_id', guildId).count('* as c').first(),
      this.db.getKnex()(this.memberTable).where('guild_id', guildId).where('is_online', true).count('* as c').first(),
      this.db.getKnex()(this.vaultTable).where('guild_id', guildId).where('item_id', '>', 0).count('* as c').first(),
      this.db.getKnex()(this.warTable)
        .where(function() { this.where('guild_id_1', guildId).orWhere('guild_id_2', guildId); })
        .whereIn('state', [2, 3])
        .count('* as c')
        .first(),
      this.getAlliances(guildId),
    ]);

    return {
      ...guild,
      totalMembers: parseInt(members?.c || 0),
      onlineMembers: parseInt(onlineMembers?.c || 0),
      vaultItems: parseInt(vaultItems?.c || 0),
      totalWars: parseInt(wars?.c || 0),
      alliances: alliances.length,
    };
  }

  /**
   * Deleta guild (apenas master)
   */
  async deleteGuild(guildId, characterId) {
    return this.db.transaction(async (trx) => {
      const member = await this.getMemberInfo(guildId, characterId);
      if (!member || member.rank !== 0) throw new Error('Apenas Master pode deletar guild');

      // Verificar se há guerras ativas
      const activeWar = await trx(this.warTable)
        .where(function() { this.where('guild_id_1', guildId).orWhere('guild_id_2', guildId); })
        .whereIn('state', [1, 2])
        .first();
      
      if (activeWar) throw new Error('Não pode deletar guild em guerra');

      // Remover membros
      await trx(this.memberTable).where('guild_id', guildId).del();
      await trx('characters').where('guild_id', guildId).update({ guild_id: null, guild_rank: null });

      // Soft delete guild
      await trx(this.tableName).where('id', guildId).update({ deleted_at: trx.fn.now() });

      await this.logAction(trx, guildId, characterId, 'delete', {});

      return true;
    });
  }
}

module.exports = GuildDB;