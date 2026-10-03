/**
 * WarehouseSystem.js - Sistema de Baú/Armazém do MU Online
 * 
 * Funcionalidades:
 * - Vault (8x15 = 120 slots), Zen, expansão (VIP/expansão)
 * - Compartilhado entre chars da conta
 * - Log de depósito/saque, anti-dupe
 * - Vault premium (expansão por VIP)
 */

const MUDatabase = require('./MUDatabase');
const crypto = require('crypto');

class WarehouseSystem {
  constructor(database) {
    this.db = database;
    this.tableName = 'warehouse';
    this.logTable = 'warehouse_logs';
    this.expansionTable = 'warehouse_expansions';
    
    // Configurações
    this.config = {
      baseSlots: 120, // 8x15
      maxSlots: 480,  // 8x60 (4 expansões)
      expansionSlots: 120, // Por expansão
      baseZen: 0,
      maxZen: 2000000000, // 2 bilhões
      vipExpansions: {
        0: 0,  // Normal
        1: 1,  // Bronze
        2: 2,  // Silver
        3: 3,  // Gold
        4: 4,  // Platinum
      },
      itemSizeMap: {
        // Tamanho dos itens (slots ocupados)
        // Formato: itemId -> { width, height }
      },
    };
  }

  /**
   * Inicializa tabelas
   */
  async initializeTables() {
    const db = this.db.getKnex();
    
    // Tabela principal do warehouse
    await db.schema.hasTable(this.tableName).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.tableName, (table) => {
          table.increments('id').primary();
          table.integer('account_id').unsigned().notNullable();
          table.integer('slot').notNullable(); // 0-479
          table.integer('item_id').defaultTo(0); // 0 = vazio
          table.integer('level').defaultTo(0);
          table.integer('durability').defaultTo(0);
          table.integer('option1').defaultTo(0); // Skill
          table.integer('option2').defaultTo(0); // Luck
          table.integer('option3').defaultTo(0); // Option
          table.integer('exc_option').defaultTo(0); // Excellent options
          table.integer('ancient_option').defaultTo(0); // Ancient
          table.integer('socket_count').defaultTo(0);
          table.json('socket_options').nullable(); // Seed spheres
          table.string('serial', 32).nullable(); // Serial único anti-dupe
          table.integer('stack_count').defaultTo(1); // Para stackables
          table.timestamp('created_at').defaultTo(db.fn.now());
          table.timestamp('updated_at').defaultTo(db.fn.now());
          
          table.foreign('account_id').references('id').inTable('accounts').onDelete('CASCADE');
          table.unique(['account_id', 'slot']);
          table.index(['account_id']);
          table.index(['serial']);
        });
        console.log('[WarehouseSystem] Tabela warehouse criada');
      }
    });

    // Tabela de logs
    await db.schema.hasTable(this.logTable).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.logTable, (table) => {
          table.increments('id').primary();
          table.integer('account_id').unsigned().notNullable();
          table.integer('character_id').unsigned().nullable();
          table.string('action', 20).notNullable(); // deposit, withdraw, move, expand
          table.integer('slot_from').nullable();
          table.integer('slot_to').nullable();
          table.integer('item_id').defaultTo(0);
          table.integer('level').defaultTo(0);
          table.integer('durability').defaultTo(0);
          table.integer('option1').defaultTo(0);
          table.integer('option2').defaultTo(0);
          table.integer('option3').defaultTo(0);
          table.integer('exc_option').defaultTo(0);
          table.integer('ancient_option').defaultTo(0);
          table.json('socket_options').nullable();
          table.string('serial', 32).nullable();
          table.integer('stack_count').defaultTo(1);
          table.bigint('zen_change').defaultTo(0);
          table.string('ip', 45).nullable();
          table.timestamp('created_at').defaultTo(db.fn.now());
          
          table.foreign('account_id').references('id').inTable('accounts').onDelete('CASCADE');
          table.foreign('character_id').references('id').inTable('characters').onDelete('SET NULL');
          table.index(['account_id', 'created_at']);
          table.index(['action']);
          table.index(['serial']);
        });
        console.log('[WarehouseSystem] Tabela warehouse_logs criada');
      }
    });

    // Tabela de expansões
    await db.schema.hasTable(this.expansionTable).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.expansionTable, (table) => {
          table.increments('id').primary();
          table.integer('account_id').unsigned().notNullable();
          table.integer('expansion_level').notNullable(); // 1, 2, 3, 4
          table.string('method', 20).notNullable(); // vip, item, event, admin
          table.integer('item_id').nullable(); // Item usado para expansão
          table.string('serial', 32).nullable();
          table.timestamp('expires_at').nullable(); // Para expansões temporárias
          table.boolean('is_active').defaultTo(true);
          table.timestamp('created_at').defaultTo(db.fn.now());
          
          table.foreign('account_id').references('id').inTable('accounts').onDelete('CASCADE');
          table.unique(['account_id', 'expansion_level']);
          table.index(['account_id', 'is_active']);
        });
        console.log('[WarehouseSystem] Tabela warehouse_expansions criada');
      }
    });

    // Inicializar slots para contas existentes
    await this.initializeAccountWarehouses();
  }

  /**
   * Inicializa warehouse para contas existentes
   */
  async initializeAccountWarehouses() {
    const db = this.db.getKnex();
    const accounts = await db('accounts').whereNull('deleted_at').select('id');
    
    for (const account of accounts) {
      await this.ensureWarehouseExists(account.id);
    }
  }

  /**
   * Garante que warehouse existe para a conta
   */
  async ensureWarehouseExists(accountId) {
    const db = this.db.getKnex();
    const count = await db(this.tableName).where('account_id', accountId).count('* as c').first();
    
    if (parseInt(count.c) === 0) {
      // Criar slots base
      const slots = [];
      for (let i = 0; i < this.config.baseSlots; i++) {
        slots.push({
          account_id: accountId,
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
      await db.batchInsert(this.tableName, slots, 100);
    }
  }

  /**
   * Obtém warehouse completo da conta
   */
  async getWarehouse(accountId) {
    await this.ensureWarehouseExists(accountId);
    
    const items = await this.db.select(this.tableName, '*', { account_id: accountId })
      .orderBy('slot');
    
    const expansions = await this.getExpansions(accountId);
    const maxSlots = this.calculateMaxSlots(accountId, expansions);
    
    return {
      items,
      maxSlots,
      usedSlots: items.filter(i => i.item_id > 0).length,
      expansions,
      zen: await this.getWarehouseZen(accountId),
    };
  }

  /**
   * Calcula slots máximos baseado em expansões e VIP
   */
  async calculateMaxSlots(accountId, expansions = null) {
    if (!expansions) {
      expansions = await this.getExpansions(accountId);
    }
    
    // Contar expansões ativas
    const activeExpansions = expansions.filter(e => e.is_active && (!e.expires_at || new Date(e.expires_at) > new Date())).length;
    
    // Verificar VIP
    const account = await this.db.getKnex()('accounts').where('id', accountId).select('vip_type').first();
    const vipExpansions = this.config.vipExpansions[account?.vip_type || 0] || 0;
    
    const totalExpansions = Math.max(activeExpansions, vipExpansions);
    return this.config.baseSlots + (totalExpansions * this.config.expansionSlots);
  }

  /**
   * Obtém expansões da conta
   */
  async getExpansions(accountId) {
    return this.db.select(this.expansionTable, '*', { account_id: accountId })
      .orderBy('expansion_level');
  }

  /**
   * Obtém Zen do warehouse
   */
  async getWarehouseZen(accountId) {
    // Zen pode ser armazenado na conta ou em tabela separada
    // Por simplicidade, vamos usar a tabela accounts
    const account = await this.db.getKnex()('accounts').where('id', accountId).select('bank_zen').first();
    return account?.bank_zen || 0;
  }

  /**
   * Deposita item no warehouse
   */
  async depositItem(accountId, characterId, itemData, ip = null) {
    return this.db.transaction(async (trx) => {
      // Verificar espaço disponível
      const warehouse = await this.getWarehouse(accountId);
      if (warehouse.usedSlots >= warehouse.maxSlots) {
        throw new Error('Warehouse cheio');
      }

      // Encontrar primeiro slot vazio
      const emptySlot = warehouse.items.find(i => i.item_id === 0);
      if (!emptySlot) {
        throw new Error('Nenhum slot disponível');
      }

      // Validar item
      this.validateItem(itemData);

      // Gerar serial se não tiver
      const serial = itemData.serial || this.generateSerial();

      // Verificar anti-dupe
      await this.checkDupe(serial, trx);

      // Inserir item
      await trx(this.tableName)
        .where('account_id', accountId)
        .where('slot', emptySlot.slot)
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
          serial: serial,
          stack_count: itemData.stackCount || 1,
          updated_at: trx.fn.now(),
        });

      // Log
      await this.logAction(trx, accountId, characterId, 'deposit', {
        slot_to: emptySlot.slot,
        ...itemData,
        serial,
        ip,
      });

      return { slot: emptySlot.slot, serial };
    });
  }

  /**
   * Saca item do warehouse
   */
  async withdrawItem(accountId, characterId, slot, ip = null) {
    return this.db.transaction(async (trx) => {
      const item = await trx(this.tableName)
        .where('account_id', accountId)
        .where('slot', slot)
        .first();

      if (!item || item.item_id === 0) {
        throw new Error('Slot vazio ou inválido');
      }

      // Copiar dados do item
      const itemData = { ...item };

      // Limpar slot
      await trx(this.tableName)
        .where('account_id', accountId)
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
          updated_at: trx.fn.now(),
        });

      // Log
      await this.logAction(trx, accountId, characterId, 'withdraw', {
        slot_from: slot,
        ...itemData,
        ip,
      });

      return itemData;
    });
  }

  /**
   * Move item entre slots
   */
  async moveItem(accountId, characterId, fromSlot, toSlot, ip = null) {
    return this.db.transaction(async (trx) => {
      const fromItem = await trx(this.tableName)
        .where('account_id', accountId)
        .where('slot', fromSlot)
        .first();

      const toItem = await trx(this.tableName)
        .where('account_id', accountId)
        .where('slot', toSlot)
        .first();

      if (!fromItem || fromItem.item_id === 0) {
        throw new Error('Slot de origem vazio');
      }

      if (!toItem) {
        throw new Error('Slot de destino inválido');
      }

      // Se destino vazio, mover direto
      if (toItem.item_id === 0) {
        await trx(this.tableName)
          .where('account_id', accountId)
          .where('slot', toSlot)
          .update({
            item_id: fromItem.item_id,
            level: fromItem.level,
            durability: fromItem.durability,
            option1: fromItem.option1,
            option2: fromItem.option2,
            option3: fromItem.option3,
            exc_option: fromItem.exc_option,
            ancient_option: fromItem.ancient_option,
            socket_count: fromItem.socket_count,
            socket_options: fromItem.socket_options,
            serial: fromItem.serial,
            stack_count: fromItem.stack_count,
            updated_at: trx.fn.now(),
          });

        await trx(this.tableName)
          .where('account_id', accountId)
          .where('slot', fromSlot)
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
            updated_at: trx.fn.now(),
          });
      } else {
        // Swap items
        const tempFrom = { ...fromItem };
        const tempTo = { ...toItem };

        await trx(this.tableName)
          .where('account_id', accountId)
          .where('slot', fromSlot)
          .update({
            item_id: tempTo.item_id,
            level: tempTo.level,
            durability: tempTo.durability,
            option1: tempTo.option1,
            option2: tempTo.option2,
            option3: tempTo.option3,
            exc_option: tempTo.exc_option,
            ancient_option: tempTo.ancient_option,
            socket_count: tempTo.socket_count,
            socket_options: tempTo.socket_options,
            serial: tempTo.serial,
            stack_count: tempTo.stack_count,
            updated_at: trx.fn.now(),
          });

        await trx(this.tableName)
          .where('account_id', accountId)
          .where('slot', toSlot)
          .update({
            item_id: tempFrom.item_id,
            level: tempFrom.level,
            durability: tempFrom.durability,
            option1: tempFrom.option1,
            option2: tempFrom.option2,
            option3: tempFrom.option3,
            exc_option: tempFrom.exc_option,
            ancient_option: tempFrom.ancient_option,
            socket_count: tempFrom.socket_count,
            socket_options: tempFrom.socket_options,
            serial: tempFrom.serial,
            stack_count: tempFrom.stack_count,
            updated_at: trx.fn.now(),
          });
      }

      // Log
      await this.logAction(trx, accountId, characterId, 'move', {
        slot_from: fromSlot,
        slot_to: toSlot,
        ip,
      });

      return true;
    });
  }

  /**
   * Deposita Zen
   */
  async depositZen(accountId, characterId, amount, ip = null) {
    if (amount <= 0) throw new Error('Quantidade inválida');

    return this.db.transaction(async (trx) => {
      const currentZen = await this.getWarehouseZen(accountId);
      const newZen = currentZen + amount;

      if (newZen > this.config.maxZen) {
        throw new Error(`Limite de Zen excedido (máx: ${this.config.maxZen})`);
      }

      await trx('accounts')
        .where('id', accountId)
        .update({ bank_zen: newZen, updated_at: trx.fn.now() });

      // Log
      await this.logAction(trx, accountId, characterId, 'deposit_zen', {
        zen_change: amount,
        ip,
      });

      return newZen;
    });
  }

  /**
   * Saca Zen
   */
  async withdrawZen(accountId, characterId, amount, ip = null) {
    if (amount <= 0) throw new Error('Quantidade inválida');

    return this.db.transaction(async (trx) => {
      const currentZen = await this.getWarehouseZen(accountId);
      
      if (currentZen < amount) {
        throw new Error('Zen insuficiente no warehouse');
      }

      const newZen = currentZen - amount;

      await trx('accounts')
        .where('id', accountId)
        .update({ bank_zen: newZen, updated_at: trx.fn.now() });

      // Log
      await this.logAction(trx, accountId, characterId, 'withdraw_zen', {
        zen_change: -amount,
        ip,
      });

      return newZen;
    });
  }

  /**
   * Expande warehouse
   */
  async expandWarehouse(accountId, method, itemId = null, serial = null, durationDays = null) {
    return this.db.transaction(async (trx) => {
      const expansions = await this.getExpansions(accountId);
      const currentLevel = expansions.filter(e => e.is_active).length;
      const nextLevel = currentLevel + 1;

      if (nextLevel > 4) {
        throw new Error('Máximo de expansões atingido (4)');
      }

      const expiresAt = durationDays ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000) : null;

      await trx(this.expansionTable).insert({
        account_id: accountId,
        expansion_level: nextLevel,
        method,
        item_id: itemId,
        serial,
        expires_at: expiresAt,
        is_active: true,
      });

      // Inicializar novos slots
      const newSlots = [];
      const startSlot = this.config.baseSlots + (currentLevel * this.config.expansionSlots);
      for (let i = 0; i < this.config.expansionSlots; i++) {
        newSlots.push({
          account_id: accountId,
          slot: startSlot + i,
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
      await trx.batchInsert(this.tableName, newSlots, 100);

      // Log
      await this.logAction(trx, accountId, null, 'expand', {
        expansion_level: nextLevel,
        method,
        item_id: itemId,
        serial,
      });

      return { expansionLevel: nextLevel, expiresAt };
    });
  }

  /**
   * Verifica e expira expansões temporárias
   */
  async checkExpiredExpansions() {
    const db = this.db.getKnex();
    const expired = await db(this.expansionTable)
      .where('is_active', true)
      .where('expires_at', '<', db.fn.now())
      .select('*');

    for (const exp of expired) {
      await this.deactivateExpansion(exp.account_id, exp.expansion_level);
    }

    return expired.length;
  }

  /**
   * Desativa expansão
   */
  async deactivateExpansion(accountId, expansionLevel) {
    return this.db.transaction(async (trx) => {
      // Marcar expansão como inativa
      await trx(this.expansionTable)
        .where('account_id', accountId)
        .where('expansion_level', expansionLevel)
        .update({ is_active: false });

      // Verificar se há itens nos slots da expansão
      const startSlot = this.config.baseSlots + ((expansionLevel - 1) * this.config.expansionSlots);
      const endSlot = startSlot + this.config.expansionSlots - 1;

      const itemsInExpansion = await trx(this.tableName)
        .where('account_id', accountId)
        .whereBetween('slot', [startSlot, endSlot])
        .where('item_id', '>', 0)
        .select('*');

      if (itemsInExpansion.length > 0) {
        // Mover itens para slots base disponíveis (se houver)
        // Ou marcar como "overflow" - implementar conforme regra do servidor
        console.warn(`[Warehouse] Expansão ${expansionLevel} da conta ${accountId} expirou com ${itemsInExpansion.length} itens`);
      }

      return itemsInExpansion.length;
    });
  }

  /**
   * Registra ação no log
   */
  async logAction(trx, accountId, characterId, action, data) {
    await trx(this.logTable).insert({
      account_id: accountId,
      character_id: characterId,
      action,
      slot_from: data.slot_from || null,
      slot_to: data.slot_to || null,
      item_id: data.itemId || data.item_id || 0,
      level: data.level || 0,
      durability: data.durability || 0,
      option1: data.option1 || 0,
      option2: data.option2 || 0,
      option3: data.option3 || 0,
      exc_option: data.excOption || data.exc_option || 0,
      ancient_option: data.ancientOption || data.ancient_option || 0,
      socket_options: data.socketOptions ? JSON.stringify(data.socketOptions) : data.socket_options || null,
      serial: data.serial || null,
      stack_count: data.stackCount || data.stack_count || 1,
      zen_change: data.zen_change || 0,
      ip: data.ip || null,
    });
  }

  /**
   * Obtém logs do warehouse
   */
  async getLogs(accountId, options = {}) {
    const { limit = 100, offset = 0, action = null, startDate = null, endDate = null } = options;
    
    let query = this.db.select(this.logTable, '*', { account_id: accountId })
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    if (action) query = query.where('action', action);
    if (startDate) query = query.where('created_at', '>=', startDate);
    if (endDate) query = query.where('created_at', '<=', endDate);

    return query;
  }

  /**
   * Valida item
   */
  validateItem(itemData) {
    if (!itemData.itemId || itemData.itemId <= 0) {
      throw new Error('Item ID inválido');
    }
    
    if (itemData.level < 0 || itemData.level > 15) {
      throw new Error('Level inválido (0-15)');
    }
    
    if (itemData.durability < 0 || itemData.durability > 255) {
      throw new Error('Durabilidade inválida (0-255)');
    }
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
    
    const tables = [this.tableName, 'character_inventory', 'character_equipment', 'character_muun', 'character_pentagram', 'character_gremory'];
    
    for (const table of tables) {
      const existing = await trx(table).where('serial', serial).first();
      if (existing) {
        throw new Error(`Item duplicado detectado (serial: ${serial})`);
      }
    }
  }

  /**
   * Busca item por serial
   */
  async findItemBySerial(serial) {
    const tables = [this.tableName, 'character_inventory', 'character_equipment', 'character_muun', 'character_pentagram', 'character_gremory'];
    
    for (const table of tables) {
      const item = await this.db.getKnex()(table).where('serial', serial).first();
      if (item) {
        return { table, item };
      }
    }
    return null;
  }

  /**
   * Limpa itens expirados (para expansões temporárias)
   */
  async cleanupExpiredItems() {
    // Implementar limpeza de itens em slots de expansão expirada
    // Mover para "overflow" ou deletar conforme política
  }

  /**
   * Obtém estatísticas do warehouse
   */
  async getWarehouseStats(accountId) {
    const warehouse = await this.getWarehouse(accountId);
    
    const itemTypes = {};
    warehouse.items.forEach(item => {
      if (item.item_id > 0) {
        const type = Math.floor(item.item_id / 512);
        itemTypes[type] = (itemTypes[type] || 0) + 1;
      }
    });
    
    return {
      totalSlots: warehouse.maxSlots,
      usedSlots: warehouse.usedSlots,
      freeSlots: warehouse.maxSlots - warehouse.usedSlots,
      zen: warehouse.zen,
      itemTypes,
      expansions: warehouse.expansions.length,
    };
  }

  /**
   * Transfere item entre contas (trade via warehouse)
   */
  async transferItem(fromAccountId, toAccountId, slot, characterId, ip = null) {
    return this.db.transaction(async (trx) => {
      // Verificar se conta destino existe
      const toAccount = await trx('accounts').where('id', toAccountId).first();
      if (!toAccount) throw new Error('Conta destino não encontrada');

      // Obter item
      const item = await trx(this.tableName)
        .where('account_id', fromAccountId)
        .where('slot', slot)
        .first();

      if (!item || item.item_id === 0) {
        throw new Error('Item não encontrado');
      }

      // Verificar espaço na conta destino
      const toWarehouse = await this.getWarehouse(toAccountId);
      if (toWarehouse.usedSlots >= toWarehouse.maxSlots) {
        throw new Error('Warehouse destino cheio');
      }

      // Encontrar slot vazio destino
      const emptySlot = toWarehouse.items.find(i => i.item_id === 0);

      // Mover item
      await trx(this.tableName)
        .where('account_id', toAccountId)
        .where('slot', emptySlot.slot)
        .update({
          item_id: item.item_id,
          level: item.level,
          durability: item.durability,
          option1: item.option1,
          option2: item.option2,
          option3: item.option3,
          exc_option: item.exc_option,
          ancient_option: item.ancient_option,
          socket_count: item.socket_count,
          socket_options: item.socket_options,
          serial: item.serial,
          stack_count: item.stack_count,
          updated_at: trx.fn.now(),
        });

      // Limpar slot origem
      await trx(this.tableName)
        .where('account_id', fromAccountId)
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
          updated_at: trx.fn.now(),
        });

      // Logs
      await this.logAction(trx, fromAccountId, characterId, 'transfer_out', {
        slot_from: slot,
        to_account: toAccountId,
        ...item,
        ip,
      });

      await this.logAction(trx, toAccountId, null, 'transfer_in', {
        slot_to: emptySlot.slot,
        from_account: fromAccountId,
        ...item,
        ip,
      });

      return { fromSlot: slot, toSlot: emptySlot.slot };
    });
  }
}

module.exports = WarehouseSystem;