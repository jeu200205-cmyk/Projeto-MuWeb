/**
 * CharacterDB.js - Sistema de Personagens do MU Online
 * 
 * Tabela: Character com todos os campos necessários:
 * - Básicos: Name, AccountId, Class, Level, Exp, LevelUpPoint
 * - Stats: Str, Dex, Vit, Energy, Leadership
 * - Life/Mana: Life, MaxLife, Mana, MaxMana
 * - Position: MapNumber, MapX, MapY
 * - PK System: PkLevel, PkCount, PKTime
 * - Inventory/Equipment: Inventory, InventoryMap, Equipment, Skill
 * - Quest/Effect: Quest, Effect, Fruit
 * - Reset/Master: ResetCount, MasterLevel, MasterPoint, MasterExp
 * - Gens: GensFamily, GensRank, GensContribution, GensContributionDay
 * - Muun: MuunInventory, PentagramJewel, MuunEvolution, MuunItem
 * - Gremory/Arcane: GremoryCase, ArcaneBook
 */

const MUDatabase = require('./MUDatabase');

class CharacterDB {
  constructor(database) {
    this.db = database;
    this.tableName = 'characters';
    this.inventoryTable = 'character_inventory';
    this.equipmentTable = 'character_equipment';
    this.skillTable = 'character_skills';
    this.questTable = 'character_quests';
    this.effectTable = 'character_effects';
    this.fruitTable = 'character_fruits';
    this.muunTable = 'character_muun';
    this.pentagramTable = 'character_pentagram';
    this.gremoryTable = 'character_gremory';
    this.arcaneTable = 'character_arcane';
    
    // Classes do MU Online
    this.classes = {
      0: 'Dark Wizard',
      1: 'Soul Master',
      2: 'Grand Master',
      3: 'Dark Knight',
      4: 'Blade Knight',
      5: 'Blade Master',
      6: 'Fairy Elf',
      7: 'Muse Elf',
      8: 'High Elf',
      16: 'Magic Gladiator',
      17: 'Duel Master',
      32: 'Dark Lord',
      33: 'Lord Emperor',
      48: 'Summoner',
      49: 'Bloody Summoner',
      50: 'Dimension Master',
      64: 'Rage Fighter',
      65: 'Fist Master',
    };
    
    // Configurações anti-dupe
    this.antiDupe = {
      enabled: true,
      checkInterval: 60000, // 1 minuto
      maxSameItem: 1, // Max items with same serial
    };
  }

  /**
   * Inicializa tabelas
   */
  async initializeTables() {
    const db = this.db.getKnex();
    
    // Tabela principal de personagens
    await db.schema.hasTable(this.tableName).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.tableName, (table) => {
          table.increments('id').primary();
          table.string('name', 10).unique().notNullable(); // Max 10 chars no MU
          table.integer('account_id').unsigned().notNullable();
          table.tinyint('class').notNullable(); // 0=DW, 16=MG, 32=DL, 48=SU, 64=RF
          table.integer('level').defaultTo(1);
          table.bigint('exp').defaultTo(0);
          table.integer('level_up_point').defaultTo(0);
          
          // Stats base
          table.integer('strength').defaultTo(0);
          table.integer('dexterity').defaultTo(0);
          table.integer('vitality').defaultTo(0);
          table.integer('energy').defaultTo(0);
          table.integer('leadership').defaultTo(0);
          
          // Life/Mana
          table.integer('life').defaultTo(0);
          table.integer('max_life').defaultTo(0);
          table.integer('mana').defaultTo(0);
          table.integer('max_mana').defaultTo(0);
          
          // Position
          table.integer('map_number').defaultTo(0);
          table.integer('map_x').defaultTo(125);
          table.integer('map_y').defaultTo(125);
          
          // PK System
          table.integer('pk_level').defaultTo(0);
          table.integer('pk_count').defaultTo(0);
          table.integer('pk_time').defaultTo(0);
          
          // Resets
          table.integer('reset_count').defaultTo(0);
          table.integer('reset_day').defaultTo(0);
          table.integer('reset_week').defaultTo(0);
          
          // Master System
          table.integer('master_level').defaultTo(0);
          table.integer('master_point').defaultTo(0);
          table.bigint('master_exp').defaultTo(0);
          
          // Gens System
          table.tinyint('gens_family').defaultTo(0); // 0=none, 1=Doppel, 2=Vanert
          table.integer('gens_rank').defaultTo(0);
          table.bigint('gens_contribution').defaultTo(0);
          table.bigint('gens_contribution_day').defaultTo(0);
          
          // Zen/Inventory
          table.bigint('zen').defaultTo(0);
          table.bigint('bank_zen').defaultTo(0);
          
          // Inventory/Equipment/skills como JSON para flexibilidade
          table.json('inventory').nullable(); // 8x15 = 120 slots
          table.json('inventory_map').nullable(); // Map de slots ocupados
          table.json('equipment').nullable(); // 12 slots equipamento
          table.json('skills').nullable(); // Skills aprendidas
          table.json('skill_tree').nullable(); // Master skill tree
          
          // Quest/Event
          table.json('quests').nullable();
          table.json('effects').nullable(); // Buffs ativos
          table.json('fruits').nullable(); // Frutas consumidas (stat boosts)
          
          // Muun System
          table.json('muun_inventory').nullable();
          table.json('pentagram_jewel').nullable();
          table.json('muun_evolution').nullable();
          table.json('muun_item').nullable();
          
          // Gremory Case
          table.json('gremory_case').nullable();
          
          // Arcane Book
          table.json('arcane_book').nullable();
          
          // PvP/Guild
          table.integer('guild_id').nullable();
          table.integer('guild_rank').defaultTo(0);
          
          // Configurações
          table.json('settings').nullable(); // Auto-pot, PK settings, etc
          table.json('quick_slots').nullable(); // Quick slots F1-F12
          
          // Timestamps
          table.timestamp('created_at').defaultTo(db.fn.now());
          table.timestamp('updated_at').defaultTo(db.fn.now());
          table.timestamp('deleted_at').nullable();
          table.timestamp('last_save').defaultTo(db.fn.now());
          table.timestamp('last_logout').nullable();
          
          // Anti-dupe
          table.string('last_save_hash', 64).nullable(); // Hash do último save para detectar rollback
          
          table.foreign('account_id').references('id').inTable('accounts').onDelete('CASCADE');
          table.index(['account_id']);
          table.index(['name']);
          table.index(['guild_id']);
          table.index(['map_number']);
          table.index(['level']);
          table.index(['reset_count']);
          table.index(['master_level']);
          table.index(['deleted_at']);
        });
        console.log('[CharacterDB] Tabela characters criada');
      }
    });

    // Tabela de inventário detalhada (para queries complexas)
    await db.schema.hasTable(this.inventoryTable).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.inventoryTable, (table) => {
          table.increments('id').primary();
          table.integer('character_id').unsigned().notNullable();
          table.integer('slot').notNullable(); // 0-119 (main) ou 200-239 (trade) etc
          table.integer('item_id').notNullable(); // Item index (ex: 512*type + index)
          table.integer('level').defaultTo(0);
          table.integer('durability').defaultTo(0);
          table.integer('option1').defaultTo(0); // Skill
          table.integer('option2').defaultTo(0); // Luck
          table.integer('option3').defaultTo(0); // Option
          table.integer('exc_option').defaultTo(0); // Excellent options (bitmask)
          table.integer('ancient_option').defaultTo(0); // Ancient options
          table.integer('socket_count').defaultTo(0);
          table.json('socket_options').nullable(); // Seed spheres
          table.string('serial', 32).nullable(); // Serial único anti-dupe
          table.timestamp('created_at').defaultTo(db.fn.now());
          table.timestamp('updated_at').defaultTo(db.fn.now());
          
          table.foreign('character_id').references('id').inTable(this.tableName).onDelete('CASCADE');
          table.unique(['character_id', 'slot']);
          table.index(['character_id']);
          table.index(['serial']);
        });
        console.log('[CharacterDB] Tabela character_inventory criada');
      }
    });

    // Tabela de equipamentos
    await db.schema.hasTable(this.equipmentTable).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.equipmentTable, (table) => {
          table.increments('id').primary();
          table.integer('character_id').unsigned().notNullable();
          table.integer('slot').notNullable(); // 0=helm, 1=armor, 2=pants, 3=gloves, 4=boots, 5=weapon, 6=shield, 7=wings, 8=helper, 9=amulet, 10=ring1, 11=ring2
          table.integer('item_id').notNullable();
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
          table.timestamp('created_at').defaultTo(db.fn.now());
          table.timestamp('updated_at').defaultTo(db.fn.now());
          
          table.foreign('character_id').references('id').inTable(this.tableName).onDelete('CASCADE');
          table.unique(['character_id', 'slot']);
          table.index(['character_id']);
          table.index(['serial']);
        });
        console.log('[CharacterDB] Tabela character_equipment criada');
      }
    });

    // Tabela de skills
    await db.schema.hasTable(this.skillTable).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.skillTable, (table) => {
          table.increments('id').primary();
          table.integer('character_id').unsigned().notNullable();
          table.integer('skill_id').notNullable();
          table.integer('level').defaultTo(1);
          table.boolean('is_master').defaultTo(false);
          table.timestamp('created_at').defaultTo(db.fn.now());
          
          table.foreign('character_id').references('id').inTable(this.tableName).onDelete('CASCADE');
          table.unique(['character_id', 'skill_id']);
          table.index(['character_id']);
        });
        console.log('[CharacterDB] Tabela character_skills criada');
      }
    });

    // Tabela de quests
    await db.schema.hasTable(this.questTable).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.questTable, (table) => {
          table.increments('id').primary();
          table.integer('character_id').unsigned().notNullable();
          table.integer('quest_id').notNullable();
          table.integer('state').defaultTo(0); // 0=not started, 1=in progress, 2=completed
          table.integer('progress').defaultTo(0);
          table.json('data').nullable(); // Dados extras da quest
          table.timestamp('created_at').defaultTo(db.fn.now());
          table.timestamp('updated_at').defaultTo(db.fn.now());
          
          table.foreign('character_id').references('id').inTable(this.tableName).onDelete('CASCADE');
          table.unique(['character_id', 'quest_id']);
          table.index(['character_id']);
        });
        console.log('[CharacterDB] Tabela character_quests criada');
      }
    });

    // Tabela de effects/buffs
    await db.schema.hasTable(this.effectTable).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.effectTable, (table) => {
          table.increments('id').primary();
          table.integer('character_id').unsigned().notNullable();
          table.integer('effect_id').notNullable();
          table.integer('level').defaultTo(1);
          table.integer('duration').defaultTo(0); // Segundos restantes
          table.json('data').nullable();
          table.timestamp('created_at').defaultTo(db.fn.now());
          table.timestamp('expires_at').nullable();
          
          table.foreign('character_id').references('id').inTable(this.tableName).onDelete('CASCADE');
          table.index(['character_id']);
          table.index(['expires_at']);
        });
        console.log('[CharacterDB] Tabela character_effects criada');
      }
    });

    // Tabela de frutas (stat boosts permanentes)
    await db.schema.hasTable(this.fruitTable).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.fruitTable, (table) => {
          table.increments('id').primary();
          table.integer('character_id').unsigned().notNullable();
          table.integer('fruit_type').notNullable(); // 0=Str, 1=Dex, 2=Vit, 3=Energy, 4=Lead
          table.integer('count').defaultTo(0);
          table.timestamp('created_at').defaultTo(db.fn.now());
          table.timestamp('updated_at').defaultTo(db.fn.now());
          
          table.foreign('character_id').references('id').inTable(this.tableName).onDelete('CASCADE');
          table.unique(['character_id', 'fruit_type']);
          table.index(['character_id']);
        });
        console.log('[CharacterDB] Tabela character_fruits criada');
      }
    });

    // Tabela Muun
    await db.schema.hasTable(this.muunTable).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.muunTable, (table) => {
          table.increments('id').primary();
          table.integer('character_id').unsigned().notNullable();
          table.integer('slot').notNullable();
          table.integer('item_id').notNullable();
          table.integer('level').defaultTo(0);
          table.integer('durability').defaultTo(0);
          table.integer('evolution_level').defaultTo(0);
          table.integer('exp').defaultTo(0);
          table.json('options').nullable();
          table.string('serial', 32).nullable();
          table.timestamp('created_at').defaultTo(db.fn.now());
          table.timestamp('updated_at').defaultTo(db.fn.now());
          
          table.foreign('character_id').references('id').inTable(this.tableName).onDelete('CASCADE');
          table.unique(['character_id', 'slot']);
          table.index(['character_id']);
          table.index(['serial']);
        });
        console.log('[CharacterDB] Tabela character_muun criada');
      }
    });

    // Tabela Pentagram Jewel
    await db.schema.hasTable(this.pentagramTable).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.pentagramTable, (table) => {
          table.increments('id').primary();
          table.integer('character_id').unsigned().notNullable();
          table.integer('slot').notNullable();
          table.integer('item_id').notNullable();
          table.integer('level').defaultTo(0);
          table.integer('rank').defaultTo(0);
          table.integer('exp').defaultTo(0);
          table.json('options').nullable(); // Pentagram options
          table.string('serial', 32).nullable();
          table.timestamp('created_at').defaultTo(db.fn.now());
          table.timestamp('updated_at').defaultTo(db.fn.now());
          
          table.foreign('character_id').references('id').inTable(this.tableName).onDelete('CASCADE');
          table.unique(['character_id', 'slot']);
          table.index(['character_id']);
          table.index(['serial']);
        });
        console.log('[CharacterDB] Tabela character_pentagram criada');
      }
    });

    // Tabela Gremory Case
    await db.schema.hasTable(this.gremoryTable).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.gremoryTable, (table) => {
          table.increments('id').primary();
          table.integer('character_id').unsigned().notNullable();
          table.integer('slot').notNullable();
          table.integer('item_id').notNullable();
          table.integer('level').defaultTo(0);
          table.integer('durability').defaultTo(0);
          table.integer('option1').defaultTo(0);
          table.integer('option2').defaultTo(0);
          table.integer('option3').defaultTo(0);
          table.integer('exc_option').defaultTo(0);
          table.integer('ancient_option').defaultTo(0);
          table.integer('socket_count').defaultTo(0);
          table.json('socket_options').nullable();
          table.integer('period_type').defaultTo(0); // 0=permanent, 1=time-limited
          table.timestamp('expires_at').nullable();
          table.string('serial', 32).nullable();
          table.timestamp('created_at').defaultTo(db.fn.now());
          table.timestamp('updated_at').defaultTo(db.fn.now());
          
          table.foreign('character_id').references('id').inTable(this.tableName).onDelete('CASCADE');
          table.unique(['character_id', 'slot']);
          table.index(['character_id']);
          table.index(['serial']);
        });
        console.log('[CharacterDB] Tabela character_gremory criada');
      }
    });

    // Tabela Arcane Book
    await db.schema.hasTable(this.arcaneTable).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.arcaneTable, (table) => {
          table.increments('id').primary();
          table.integer('character_id').unsigned().notNullable();
          table.integer('book_id').notNullable();
          table.integer('level').defaultTo(1);
          table.integer('exp').defaultTo(0);
          table.json('options').nullable();
          table.timestamp('created_at').defaultTo(db.fn.now());
          table.timestamp('updated_at').defaultTo(db.fn.now());
          
          table.foreign('character_id').references('id').inTable(this.tableName).onDelete('CASCADE');
          table.unique(['character_id', 'book_id']);
          table.index(['character_id']);
        });
        console.log('[CharacterDB] Tabela character_arcane criada');
      }
    });
  }

  /**
   * Cria novo personagem
   */
  async createCharacter(accountId, data) {
    const {
      name,
      class: charClass,
      // Posição inicial
      mapNumber = 0,
      mapX = 125,
      mapY = 125,
      // Stats iniciais (podem variar por classe)
      strength = 0,
      dexterity = 0,
      vitality = 0,
      energy = 0,
      leadership = 0,
    } = data;

    // Validações
    if (!name || name.length < 2 || name.length > 10) {
      throw new Error('Nome deve ter entre 2 e 10 caracteres');
    }

    // Verificar nome único
    const existing = await this.db.select(this.tableName, 'id', { name }).first();
    if (existing) {
      throw new Error('Nome já está em uso');
    }

    // Verificar limite de personagens por conta (padrão 5)
    const charCount = await this.db.getKnex()(this.tableName)
      .where('account_id', accountId)
      .whereNull('deleted_at')
      .count('* as count')
      .first();
    
    if (parseInt(charCount.count) >= 5) {
      throw new Error('Limite de personagens atingido (máx 5)');
    }

    // Validar classe
    if (!this.classes[charClass]) {
      throw new Error('Classe inválida');
    }

    // Calcular stats iniciais baseados na classe
    const baseStats = this.getBaseStats(charClass);
    
    const characterData = {
      account_id: accountId,
      name,
      class: charClass,
      level: 1,
      exp: 0,
      level_up_point: 0,
      strength: baseStats.str + strength,
      dexterity: baseStats.dex + dexterity,
      vitality: baseStats.vit + vitality,
      energy: baseStats.ene + energy,
      leadership: baseStats.lead + leadership,
      life: baseStats.maxLife,
      max_life: baseStats.maxLife,
      mana: baseStats.maxMana,
      max_mana: baseStats.maxMana,
      map_number: mapNumber,
      map_x: mapX,
      map_y: mapY,
      inventory: this.getEmptyInventory(),
      inventory_map: this.getEmptyInventoryMap(),
      equipment: this.getEmptyEquipment(),
      skills: [],
      skill_tree: {},
      quests: {},
      effects: [],
      fruits: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
      muun_inventory: this.getEmptyMuunInventory(),
      pentagram_jewel: this.getEmptyPentagram(),
      muun_evolution: {},
      muun_item: {},
      gremory_case: this.getEmptyGremory(),
      arcane_book: {},
      settings: this.getDefaultSettings(),
      quick_slots: this.getEmptyQuickSlots(),
    };

    const [characterId] = await this.db.insert(this.tableName, characterData);
    
    // Inicializar tabelas relacionadas
    await this.initializeCharacterData(characterId);
    
    return { characterId, ...characterData };
  }

  /**
   * Stats base por classe
   */
  getBaseStats(classId) {
    const stats = {
      0: { str: 18, dex: 15, vit: 15, ene: 30, lead: 15, maxLife: 100, maxMana: 150 }, // DW
      1: { str: 18, dex: 15, vit: 15, ene: 30, lead: 15, maxLife: 100, maxMana: 150 }, // SM
      2: { str: 18, dex: 15, vit: 15, ene: 30, lead: 15, maxLife: 100, maxMana: 150 }, // GM
      3: { str: 28, dex: 20, vit: 25, ene: 10, lead: 15, maxLife: 150, maxMana: 50 },  // DK
      4: { str: 28, dex: 20, vit: 25, ene: 10, lead: 15, maxLife: 150, maxMana: 50 },  // BK
      5: { str: 28, dex: 20, vit: 25, ene: 10, lead: 15, maxLife: 150, maxMana: 50 },  // BM
      6: { str: 22, dex: 25, vit: 20, ene: 20, lead: 25, maxLife: 120, maxMana: 100 }, // FE
      7: { str: 22, dex: 25, vit: 20, ene: 20, lead: 25, maxLife: 120, maxMana: 100 }, // ME
      8: { str: 22, dex: 25, vit: 20, ene: 20, lead: 25, maxLife: 120, maxMana: 100 }, // HE
      16: { str: 26, dex: 20, vit: 22, ene: 20, lead: 18, maxLife: 130, maxMana: 120 }, // MG
      17: { str: 26, dex: 20, vit: 22, ene: 20, lead: 18, maxLife: 130, maxMana: 120 }, // DM
      32: { str: 26, dex: 20, vit: 20, ene: 20, lead: 30, maxLife: 130, maxMana: 100 }, // DL
      33: { str: 26, dex: 20, vit: 20, ene: 20, lead: 30, maxLife: 130, maxMana: 100 }, // LE
      48: { str: 20, dex: 20, vit: 20, ene: 25, lead: 25, maxLife: 110, maxMana: 130 }, // SU
      49: { str: 20, dex: 20, vit: 20, ene: 25, lead: 25, maxLife: 110, maxMana: 130 }, // BS
      50: { str: 20, dex: 20, vit: 20, ene: 25, lead: 25, maxLife: 110, maxMana: 130 }, // DM
      64: { str: 30, dex: 25, vit: 25, ene: 10, lead: 15, maxLife: 160, maxMana: 50 },  // RF
      65: { str: 30, dex: 25, vit: 25, ene: 10, lead: 15, maxLife: 160, maxMana: 50 },  // FM
    };
    return stats[classId] || stats[0];
  }

  /**
   * Inventário vazio (120 slots)
   */
  getEmptyInventory() {
    return Array(120).fill(null);
  }

  /**
   * Mapa de inventário vazio
   */
  getEmptyInventoryMap() {
    return Array(120).fill(0);
  }

  /**
   * Equipamento vazio (12 slots)
   */
  getEmptyEquipment() {
    return Array(12).fill(null);
  }

  /**
   * Inventário Muun vazio (12 slots)
   */
  getEmptyMuunInventory() {
    return Array(12).fill(null);
  }

  /**
   * Pentagram vazio (5 slots)
   */
  getEmptyPentagram() {
    return Array(5).fill(null);
  }

  /**
   * Gremory Case vazio (100 slots)
   */
  getEmptyGremory() {
    return Array(100).fill(null);
  }

  /**
   * Configurações padrão
   */
  getDefaultSettings() {
    return {
      autoPot: { hp: 50, mp: 50, sd: 50 },
      pkMode: 0, // 0=off, 1=on
      helperEnabled: false,
      helperSettings: {},
      uiSettings: {},
      chatSettings: {},
    };
  }

  /**
   * Quick slots vazios
   */
  getEmptyQuickSlots() {
    return Array(12).fill(null);
  }

  /**
   * Inicializa dados do personagem nas tabelas relacionadas
   */
  async initializeCharacterData(characterId) {
    // Inventário principal
    const inventoryItems = [];
    for (let i = 0; i < 120; i++) {
      inventoryItems.push({
        character_id: characterId,
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
      });
    }
    await this.db.batchInsert(this.inventoryTable, inventoryItems, 500);

    // Equipamento
    const equipmentItems = [];
    for (let i = 0; i < 12; i++) {
      equipmentItems.push({
        character_id: characterId,
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
      });
    }
    await this.db.batchInsert(this.equipmentTable, equipmentItems);

    // Frutas
    const fruits = [];
    for (let i = 0; i < 5; i++) {
      fruits.push({
        character_id: characterId,
        fruit_type: i,
        count: 0,
      });
    }
    await this.db.batchInsert(this.fruitTable, fruits);
  }

  /**
   * Busca personagem por ID
   */
  async getCharacterById(characterId) {
    return this.db.select(this.tableName, '*', { id: characterId }).first();
  }

  /**
   * Busca personagem por nome
   */
  async getCharacterByName(name) {
    return this.db.select(this.tableName, '*', { name }).first();
  }

  /**
   * Busca personagens de uma conta
   */
  async getCharactersByAccount(accountId) {
    return this.db.select(this.tableName, '*', { account_id: accountId });
  }

  /**
   * Carrega personagem completo (com todas as tabelas relacionadas)
   */
  async loadCharacterFull(characterId) {
    const character = await this.getCharacterById(characterId);
    if (!character) return null;

    // Carregar dados relacionados em paralelo
    const [
      inventory,
      equipment,
      skills,
      quests,
      effects,
      fruits,
      muunInventory,
      pentagram,
      gremory,
      arcane,
    ] = await Promise.all([
      this.loadInventory(characterId),
      this.loadEquipment(characterId),
      this.loadSkills(characterId),
      this.loadQuests(characterId),
      this.loadEffects(characterId),
      this.loadFruits(characterId),
      this.loadMuunInventory(characterId),
      this.loadPentagram(characterId),
      this.loadGremory(characterId),
      this.loadArcane(characterId),
    ]);

    return {
      ...character,
      inventory,
      equipment,
      skills,
      quests,
      effects,
      fruits,
      muunInventory,
      pentagram,
      gremory,
      arcane,
    };
  }

  /**
   * Carrega inventário
   */
  async loadInventory(characterId) {
    return this.db.select(this.inventoryTable, '*', { character_id: characterId })
      .orderBy('slot');
  }

  /**
   * Carrega equipamento
   */
  async loadEquipment(characterId) {
    return this.db.select(this.equipmentTable, '*', { character_id: characterId })
      .orderBy('slot');
  }

  /**
   * Carrega skills
   */
  async loadSkills(characterId) {
    return this.db.select(this.skillTable, '*', { character_id: characterId });
  }

  /**
   * Carrega quests
   */
  async loadQuests(characterId) {
    return this.db.select(this.questTable, '*', { character_id: characterId });
  }

  /**
   * Carrega effects
   */
  async loadEffects(characterId) {
    return this.db.select(this.effectTable, '*', { character_id: characterId });
  }

  /**
   * Carrega frutas
   */
  async loadFruits(characterId) {
    return this.db.select(this.fruitTable, '*', { character_id: characterId });
  }

  /**
   * Carrega Muun Inventory
   */
  async loadMuunInventory(characterId) {
    return this.db.select(this.muunTable, '*', { character_id: characterId })
      .orderBy('slot');
  }

  /**
   * Carrega Pentagram
   */
  async loadPentagram(characterId) {
    return this.db.select(this.pentagramTable, '*', { character_id: characterId })
      .orderBy('slot');
  }

  /**
   * Carrega Gremory
   */
  async loadGremory(characterId) {
    return this.db.select(this.gremoryTable, '*', { character_id: characterId })
      .orderBy('slot');
  }

  /**
   * Carrega Arcane
   */
  async loadArcane(characterId) {
    return this.db.select(this.arcaneTable, '*', { character_id: characterId });
  }

  /**
   * Salva personagem (upsert completo)
   */
  async saveCharacter(characterId, data) {
    return this.db.transaction(async (trx) => {
      // Atualizar tabela principal
      const updateData = {
        ...data,
        updated_at: trx.fn.now(),
        last_save: trx.fn.now(),
      };
      
      // Gerar hash anti-dupe do estado atual
      updateData.last_save_hash = this.generateSaveHash(data);
      
      await trx(this.tableName).where('id', characterId).update(updateData);
      
      // Salvar inventário se fornecido
      if (data.inventory) {
        await this.saveInventory(trx, characterId, data.inventory);
      }
      
      // Salvar equipamento se fornecido
      if (data.equipment) {
        await this.saveEquipment(trx, characterId, data.equipment);
      }
      
      // Salvar skills se fornecido
      if (data.skills) {
        await this.saveSkills(trx, characterId, data.skills);
      }
      
      // Salvar quests se fornecido
      if (data.quests) {
        await this.saveQuests(trx, characterId, data.quests);
      }
      
      // Salvar effects se fornecido
      if (data.effects) {
        await this.saveEffects(trx, characterId, data.effects);
      }
      
      // Salvar frutas se fornecido
      if (data.fruits) {
        await this.saveFruits(trx, characterId, data.fruits);
      }
      
      // Salvar Muun se fornecido
      if (data.muunInventory) {
        await this.saveMuunInventory(trx, characterId, data.muunInventory);
      }
      
      // Salvar Pentagram se fornecido
      if (data.pentagram) {
        await this.savePentagram(trx, characterId, data.pentagram);
      }
      
      // Salvar Gremory se fornecido
      if (data.gremory) {
        await this.saveGremory(trx, characterId, data.gremory);
      }
      
      // Salvar Arcane se fornecido
      if (data.arcane) {
        await this.saveArcane(trx, characterId, data.arcane);
      }
      
      return true;
    });
  }

  /**
   * Gera hash do estado do personagem para anti-dupe/rollback detection
   */
  generateSaveHash(data) {
    const crypto = require('crypto');
    const relevantData = {
      level: data.level,
      exp: data.exp,
      zen: data.zen,
      inventory: data.inventory,
      equipment: data.equipment,
      strength: data.strength,
      dexterity: data.dexterity,
      vitality: data.vitality,
      energy: data.energy,
      leadership: data.leadership,
    };
    return crypto.createHash('sha256').update(JSON.stringify(relevantData)).digest('hex');
  }

  /**
   * Verifica integridade do save (anti-rollback)
   */
  async verifySaveIntegrity(characterId, providedHash) {
    const character = await this.getCharacterById(characterId);
    if (!character) return false;
    return character.last_save_hash === providedHash;
  }

  /**
   * Salva inventário (bulk upsert)
   */
  async saveInventory(trx, characterId, inventory) {
    const records = inventory.map((item, slot) => ({
      character_id: characterId,
      slot,
      item_id: item?.itemId || 0,
      level: item?.level || 0,
      durability: item?.durability || 0,
      option1: item?.option1 || 0,
      option2: item?.option2 || 0,
      option3: item?.option3 || 0,
      exc_option: item?.excOption || 0,
      ancient_option: item?.ancientOption || 0,
      socket_count: item?.socketCount || 0,
      socket_options: item?.socketOptions ? JSON.stringify(item.socketOptions) : null,
      serial: item?.serial || null,
      updated_at: trx.fn.now(),
    }));

    // Upsert em chunks
    for (let i = 0; i < records.length; i += 100) {
      const chunk = records.slice(i, i + 100);
      await trx.batchInsert(this.inventoryTable, chunk, 100)
        .onConflict(['character_id', 'slot'])
        .merge();
    }
  }

  /**
   * Salva equipamento
   */
  async saveEquipment(trx, characterId, equipment) {
    const records = equipment.map((item, slot) => ({
      character_id: characterId,
      slot,
      item_id: item?.itemId || 0,
      level: item?.level || 0,
      durability: item?.durability || 0,
      option1: item?.option1 || 0,
      option2: item?.option2 || 0,
      option3: item?.option3 || 0,
      exc_option: item?.excOption || 0,
      ancient_option: item?.ancientOption || 0,
      socket_count: item?.socketCount || 0,
      socket_options: item?.socketOptions ? JSON.stringify(item.socketOptions) : null,
      serial: item?.serial || null,
      updated_at: trx.fn.now(),
    }));

    for (let i = 0; i < records.length; i += 50) {
      const chunk = records.slice(i, i + 50);
      await trx.batchInsert(this.equipmentTable, chunk, 50)
        .onConflict(['character_id', 'slot'])
        .merge();
    }
  }

  /**
   * Salva skills
   */
  async saveSkills(trx, characterId, skills) {
    // Deletar skills antigas
    await trx(this.skillTable).where('character_id', characterId).del();
    
    if (skills.length > 0) {
      const records = skills.map(skill => ({
        character_id: characterId,
        skill_id: skill.skillId,
        level: skill.level || 1,
        is_master: skill.isMaster || false,
      }));
      await trx.batchInsert(this.skillTable, records);
    }
  }

  /**
   * Salva quests
   */
  async saveQuests(trx, characterId, quests) {
    await trx(this.questTable).where('character_id', characterId).del();
    
    if (Object.keys(quests).length > 0) {
      const records = Object.entries(quests).map(([questId, data]) => ({
        character_id: characterId,
        quest_id: parseInt(questId),
        state: data.state || 0,
        progress: data.progress || 0,
        data: data.data ? JSON.stringify(data.data) : null,
      }));
      await trx.batchInsert(this.questTable, records);
    }
  }

  /**
   * Salva effects
   */
  async saveEffects(trx, characterId, effects) {
    await trx(this.effectTable).where('character_id', characterId).del();
    
    if (effects.length > 0) {
      const records = effects.map(effect => ({
        character_id: characterId,
        effect_id: effect.effectId,
        level: effect.level || 1,
        duration: effect.duration || 0,
        data: effect.data ? JSON.stringify(effect.data) : null,
        expires_at: effect.expiresAt || null,
      }));
      await trx.batchInsert(this.effectTable, records);
    }
  }

  /**
   * Salva frutas
   */
  async saveFruits(trx, characterId, fruits) {
    for (const [fruitType, count] of Object.entries(fruits)) {
      await trx(this.fruitTable)
        .where('character_id', characterId)
        .where('fruit_type', fruitType)
        .update({ count, updated_at: trx.fn.now() });
    }
  }

  /**
   * Salva Muun Inventory
   */
  async saveMuunInventory(trx, characterId, muunInventory) {
    const records = muunInventory.map((item, slot) => ({
      character_id: characterId,
      slot,
      item_id: item?.itemId || 0,
      level: item?.level || 0,
      durability: item?.durability || 0,
      evolution_level: item?.evolutionLevel || 0,
      exp: item?.exp || 0,
      options: item?.options ? JSON.stringify(item.options) : null,
      serial: item?.serial || null,
      updated_at: trx.fn.now(),
    }));

    for (let i = 0; i < records.length; i += 50) {
      const chunk = records.slice(i, i + 50);
      await trx.batchInsert(this.muunTable, chunk, 50)
        .onConflict(['character_id', 'slot'])
        .merge();
    }
  }

  /**
   * Salva Pentagram
   */
  async savePentagram(trx, characterId, pentagram) {
    const records = pentagram.map((item, slot) => ({
      character_id: characterId,
      slot,
      item_id: item?.itemId || 0,
      level: item?.level || 0,
      rank: item?.rank || 0,
      exp: item?.exp || 0,
      options: item?.options ? JSON.stringify(item.options) : null,
      serial: item?.serial || null,
      updated_at: trx.fn.now(),
    }));

    for (let i = 0; i < records.length; i += 50) {
      const chunk = records.slice(i, i + 50);
      await trx.batchInsert(this.pentagramTable, chunk, 50)
        .onConflict(['character_id', 'slot'])
        .merge();
    }
  }

  /**
   * Salva Gremory
   */
  async saveGremory(trx, characterId, gremory) {
    const records = gremory.map((item, slot) => ({
      character_id: characterId,
      slot,
      item_id: item?.itemId || 0,
      level: item?.level || 0,
      durability: item?.durability || 0,
      option1: item?.option1 || 0,
      option2: item?.option2 || 0,
      option3: item?.option3 || 0,
      exc_option: item?.excOption || 0,
      ancient_option: item?.ancientOption || 0,
      socket_count: item?.socketCount || 0,
      socket_options: item?.socketOptions ? JSON.stringify(item.socketOptions) : null,
      period_type: item?.periodType || 0,
      expires_at: item?.expiresAt || null,
      serial: item?.serial || null,
      updated_at: trx.fn.now(),
    }));

    for (let i = 0; i < records.length; i += 50) {
      const chunk = records.slice(i, i + 50);
      await trx.batchInsert(this.gremoryTable, chunk, 50)
        .onConflict(['character_id', 'slot'])
        .merge();
    }
  }

  /**
   * Salva Arcane
   */
  async saveArcane(trx, characterId, arcane) {
    await trx(this.arcaneTable).where('character_id', characterId).del();
    
    if (Object.keys(arcane).length > 0) {
      const records = Object.entries(arcane).map(([bookId, data]) => ({
        character_id: characterId,
        book_id: parseInt(bookId),
        level: data.level || 1,
        exp: data.exp || 0,
        options: data.options ? JSON.stringify(data.options) : null,
      }));
      await trx.batchInsert(this.arcaneTable, records);
    }
  }

  /**
   * Deleta personagem (soft delete)
   */
  async deleteCharacter(characterId, accountId = null) {
    const where = { id: characterId };
    if (accountId) where.account_id = accountId; // Segurança: só dona da conta pode deletar
    
    return this.db.softDelete(this.tableName, where);
  }

  /**
   * Restaura personagem deletado
   */
  async restoreCharacter(characterId, accountId = null) {
    const where = { id: characterId };
    if (accountId) where.account_id = accountId;
    
    return this.db.update(this.tableName, where, { deleted_at: null });
  }

  /**
   * Verifica se nome está disponível
   */
  async isNameAvailable(name) {
    const existing = await this.db.select(this.tableName, 'id', { name }).first();
    return !existing;
  }

  /**
   * Renomeia personagem
   */
  async renameCharacter(characterId, newName, accountId = null) {
    if (!newName || newName.length < 2 || newName.length > 10) {
      throw new Error('Nome deve ter entre 2 e 10 caracteres');
    }
    
    const available = await this.isNameAvailable(newName);
    if (!available) throw new Error('Nome já está em uso');
    
    const where = { id: characterId };
    if (accountId) where.account_id = accountId;
    
    return this.db.update(this.tableName, where, { name: newName });
  }

  /**
   * Adiciona experiência
   */
  async addExp(characterId, amount) {
    const character = await this.getCharacterById(characterId);
    if (!character) throw new Error('Personagem não encontrado');
    
    const newExp = (character.exp || 0) + amount;
    const maxLevel = 400; // Configurável
    
    // Calcular level up se necessário
    let newLevel = character.level;
    let remainingExp = newExp;
    let levelUpPoints = character.level_up_point || 0;
    
    while (newLevel < maxLevel) {
      const expForNext = this.getExpForLevel(newLevel + 1);
      if (remainingExp >= expForNext) {
        remainingExp -= expForNext;
        newLevel++;
        levelUpPoints += 5; // 5 pontos por level
      } else {
        break;
      }
    }
    
    await this.db.update(this.tableName, { id: characterId }, {
      exp: remainingExp,
      level: newLevel,
      level_up_point: levelUpPoints,
      max_life: this.calculateMaxLife(character, newLevel),
      max_mana: this.calculateMaxMana(character, newLevel),
    });
    
    return { level: newLevel, exp: remainingExp, levelUpPoints };
  }

  /**
   * Experiência necessária para level
   */
  getExpForLevel(level) {
    // Fórmula oficial MU Online (aproximada)
    if (level <= 220) {
      return Math.floor(level * level * level * 0.1 + level * 100);
    } else {
      return Math.floor(level * level * level * 0.5 + level * 500);
    }
  }

  /**
   * Calcula Max Life
   */
  calculateMaxLife(character, level) {
    const baseLife = character.max_life || 100;
    const vitBonus = (character.vitality || 0) * 2;
    const levelBonus = (level - 1) * 3;
    return baseLife + vitBonus + levelBonus;
  }

  /**
   * Calcula Max Mana
   */
  calculateMaxMana(character, level) {
    const baseMana = character.max_mana || 100;
    const eneBonus = (character.energy || 0) * 2;
    const levelBonus = (level - 1) * 2;
    return baseMana + eneBonus + levelBonus;
  }

  /**
   * Adiciona pontos de stat
   */
  async addStatPoints(characterId, stats) {
    const character = await this.getCharacterById(characterId);
    if (!character) throw new Error('Personagem não encontrado');
    if (!character.level_up_point || character.level_up_point <= 0) {
      throw new Error('Sem pontos de level up disponíveis');
    }

    const totalPoints = (stats.str || 0) + (stats.dex || 0) + (stats.vit || 0) + (stats.ene || 0) + (stats.lead || 0);
    if (totalPoints > character.level_up_point) {
      throw new Error('Pontos insuficientes');
    }

    const updateData = {
      strength: (character.strength || 0) + (stats.str || 0),
      dexterity: (character.dexterity || 0) + (stats.dex || 0),
      vitality: (character.vitality || 0) + (stats.vit || 0),
      energy: (character.energy || 0) + (stats.ene || 0),
      leadership: (character.leadership || 0) + (stats.lead || 0),
      level_up_point: character.level_up_point - totalPoints,
      max_life: this.calculateMaxLife({ ...character, vitality: (character.vitality || 0) + (stats.vit || 0) }, character.level),
      max_mana: this.calculateMaxMana({ ...character, energy: (character.energy || 0) + (stats.ene || 0) }, character.level),
    };

    await this.db.update(this.tableName, { id: characterId }, updateData);
    return updateData;
  }

  /**
   * Reset de personagem
   */
  async resetCharacter(characterId, resetType = 'normal') {
    const character = await this.getCharacterById(characterId);
    if (!character) throw new Error('Personagem não encontrado');
    
    const minLevel = resetType === 'grand' ? 400 : 400;
    if (character.level < minLevel) {
      throw new Error(`Level mínimo para reset: ${minLevel}`);
    }

    const baseStats = this.getBaseStats(character.class);
    const newResetCount = character.reset_count + 1;
    
    // Calcular bônus por reset
    const resetBonus = this.getResetBonus(newResetCount, character.class);
    
    await this.db.update(this.tableName, { id: characterId }, {
      level: 1,
      exp: 0,
      level_up_point: 0,
      strength: baseStats.str + resetBonus.str,
      dexterity: baseStats.dex + resetBonus.dex,
      vitality: baseStats.vit + resetBonus.vit,
      energy: baseStats.ene + resetBonus.ene,
      leadership: baseStats.lead + resetBonus.lead,
      life: baseStats.maxLife + resetBonus.life,
      max_life: baseStats.maxLife + resetBonus.life,
      mana: baseStats.maxMana + resetBonus.mana,
      max_mana: baseStats.maxMana + resetBonus.mana,
      reset_count: newResetCount,
      reset_day: 0,
      reset_week: 0,
      map_number: 0,
      map_x: 125,
      map_y: 125,
    });

    // Resetar skills, quests, etc
    await this.db.getKnex()(this.skillTable).where('character_id', characterId).del();
    await this.db.getKnex()(this.questTable).where('character_id', characterId).del();
    await this.db.getKnex()(this.effectTable).where('character_id', characterId).del();
    
    return { resetCount: newResetCount };
  }

  /**
   * Bônus por reset
   */
  getResetBonus(resetCount, classId) {
    // Bônus progressivo por reset
    const bonusPerReset = {
      0: { str: 0, dex: 0, vit: 0, ene: 0, lead: 0, life: 0, mana: 0 },
      1: { str: 100, dex: 100, vit: 100, ene: 100, lead: 100, life: 500, mana: 500 },
    };
    
    // Simplificado: retorna bônus fixo por reset
    return bonusPerReset[1] || bonusPerReset[0];
  }

  /**
   * Master Level Up
   */
  async addMasterExp(characterId, amount) {
    const character = await this.getCharacterById(characterId);
    if (!character) throw new Error('Personagem não encontrado');
    if (character.level < 400) throw new Error('Level 400 necessário para Master System');
    
    const newMasterExp = (character.master_exp || 0) + amount;
    let newMasterLevel = character.master_level || 0;
    let newMasterPoint = character.master_point || 0;
    let remainingExp = newMasterExp;
    
    // Calcular master levels
    while (newMasterLevel < 200) { // Max master level
      const expForNext = this.getMasterExpForLevel(newMasterLevel + 1);
      if (remainingExp >= expForNext) {
        remainingExp -= expForNext;
        newMasterLevel++;
        newMasterPoint += 1; // 1 ponto por master level
      } else {
        break;
      }
    }
    
    await this.db.update(this.tableName, { id: characterId }, {
      master_exp: remainingExp,
      master_level: newMasterLevel,
      master_point: newMasterPoint,
    });
    
    return { masterLevel: newMasterLevel, masterExp: remainingExp, masterPoint: newMasterPoint };
  }

  /**
   * Master Exp por level
   */
  getMasterExpForLevel(level) {
    return Math.floor(level * level * 1000000);
  }

  /**
   * Lista personagens para ranking
   */
  async getRanking(type = 'level', limit = 100, offset = 0) {
    let orderBy = 'level';
    let orderDirection = 'DESC';
    
    switch (type) {
      case 'level':
        orderBy = 'level';
        break;
      case 'master':
        orderBy = 'master_level';
        break;
      case 'reset':
        orderBy = 'reset_count';
        break;
      case 'pk':
        orderBy = 'pk_count';
        break;
      case 'gens':
        orderBy = 'gens_contribution';
        break;
      case 'exp':
        orderBy = 'exp';
        break;
    }
    
    return this.db.select(this.tableName, 
      'id,name,class,level,exp,reset_count,master_level,master_exp,pk_count,pk_level,gens_family,gens_rank,gens_contribution',
      { deleted_at: null }
    )
    .orderBy(orderBy, orderDirection)
    .limit(limit)
    .offset(offset);
  }

  /**
   * Anti-dupe check
   */
  async checkDupeItems(serials) {
    if (!this.antiDupe.enabled || !serials.length) return [];
    
    const results = await Promise.all([
      this.db.getKnex()(this.inventoryTable).whereIn('serial', serials).whereNotNull('serial'),
      this.db.getKnex()(this.equipmentTable).whereIn('serial', serials).whereNotNull('serial'),
      this.db.getKnex()(this.muunTable).whereIn('serial', serials).whereNotNull('serial'),
      this.db.getKnex()(this.pentagramTable).whereIn('serial', serials).whereNotNull('serial'),
      this.db.getKnex()(this.gremoryTable).whereIn('serial', serials).whereNotNull('serial'),
    ]);
    
    const allItems = results.flat();
    const serialCount = {};
    
    allItems.forEach(item => {
      if (item.serial) {
        serialCount[item.serial] = (serialCount[item.serial] || 0) + 1;
      }
    });
    
    return Object.entries(serialCount)
      .filter(([_, count]) => count > this.antiDupe.maxSameItem)
      .map(([serial]) => serial);
  }

  /**
   * Valida integridade do personagem
   */
  async validateCharacterIntegrity(characterId) {
    const character = await this.getCharacterById(characterId);
    if (!character) return { valid: false, errors: ['Personagem não encontrado'] };
    
    const errors = [];
    
    // Verificar stats negativos
    ['strength', 'dexterity', 'vitality', 'energy', 'leadership'].forEach(stat => {
      if ((character[stat] || 0) < 0) errors.push(`Stat ${stat} negativo`);
    });
    
    // Verificar life/mana
    if (character.life > character.max_life) errors.push('Life maior que MaxLife');
    if (character.mana > character.max_mana) errors.push('Mana maior que MaxMana');
    
    // Verificar inventário
    const inventory = await this.loadInventory(characterId);
    const itemSerials = inventory.filter(i => i.serial).map(i => i.serial);
    const dupes = await this.checkDupeItems(itemSerials);
    if (dupes.length) errors.push(`Itens duplicados detectados: ${dupes.join(', ')}`);
    
    // Verificar equipamento
    const equipment = await this.loadEquipment(characterId);
    const equipSerials = equipment.filter(i => i.serial).map(i => i.serial);
    const equipDupes = await this.checkDupeItems(equipSerials);
    if (equipDupes.length) errors.push(`Equipamentos duplicados: ${equipDupes.join(', ')}`);
    
    return { valid: errors.length === 0, errors };
  }

  /**
   * Obtém estatísticas do personagem
   */
  async getCharacterStats(characterId) {
    const character = await this.getCharacterById(characterId);
    if (!character) return null;
    
    const [inventoryCount, equipmentCount, skillCount, questCount, effectCount] = await Promise.all([
      this.db.getKnex()(this.inventoryTable).where('character_id', characterId).where('item_id', '>', 0).count('* as c').first(),
      this.db.getKnex()(this.equipmentTable).where('character_id', characterId).where('item_id', '>', 0).count('* as c').first(),
      this.db.getKnex()(this.skillTable).where('character_id', characterId).count('* as c').first(),
      this.db.getKnex()(this.questTable).where('character_id', characterId).where('state', 2).count('* as c').first(),
      this.db.getKnex()(this.effectTable).where('character_id', characterId).where('expires_at', '>', this.db.getKnex().fn.now()).count('* as c').first(),
    ]);
    
    return {
      ...character,
      inventoryItems: parseInt(inventoryCount?.c || 0),
      equippedItems: parseInt(equipmentCount?.c || 0),
      skillsLearned: parseInt(skillCount?.c || 0),
      questsCompleted: parseInt(questCount?.c || 0),
      activeBuffs: parseInt(effectCount?.c || 0),
    };
  }
}

module.exports = CharacterDB;