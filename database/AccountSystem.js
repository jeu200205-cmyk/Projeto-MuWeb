/**
 * AccountSystem.js - Sistema de Contas Completo do MU Online
 * 
 * Funcionalidades:
 * - Tabela: Account (Id, Login, PasswordHash, Email, BlockCode, BlockEnd, SecurityCode, VIP, Coin, CreatedAt)
 * - Login/Logout tracking, IP ban, HWID ban
 * - Password hash (SHA256 + salt / bcrypt)
 * - Secondary password (2nd password), email verification
 * - Session management, account locking
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const MUDatabase = require('./MUDatabase');

class AccountSystem {
  constructor(database) {
    this.db = database;
    this.tableName = 'accounts';
    this.sessionTable = 'account_sessions';
    this.ipBanTable = 'ip_bans';
    this.hwidBanTable = 'hwid_bans';
    this.loginLogTable = 'login_logs';
    
    // Configurações de segurança
    this.config = {
      passwordMinLength: 6,
      passwordMaxLength: 16,
      bcryptRounds: 12,
      maxLoginAttempts: 5,
      lockoutDuration: 15 * 60 * 1000, // 15 minutos
      sessionDuration: 24 * 60 * 60 * 1000, // 24 horas
      secondaryPasswordEnabled: true,
      emailVerificationRequired: false,
    };
  }

  /**
   * Inicializa tabelas necessárias
   */
  async initializeTables() {
    const db = this.db.getKnex();
    
    // Tabela principal de contas
    await db.schema.hasTable(this.tableName).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.tableName, (table) => {
          table.increments('id').primary();
          table.string('login', 20).unique().notNullable();
          table.string('password_hash', 255).notNullable();
          table.string('password_salt', 64).nullable();
          table.string('email', 100).unique().nullable();
          table.boolean('email_verified').defaultTo(false);
          table.string('email_verification_token', 64).nullable();
          table.string('secondary_password_hash', 255).nullable();
          table.string('secondary_password_salt', 64).nullable();
          table.tinyint('block_code').defaultTo(0); // 0=normal, 1=blocked, 2=perm ban
          table.datetime('block_end').nullable();
          table.string('block_reason', 255).nullable();
          table.string('security_code', 20).nullable(); // Código de segurança (PIN)
          table.tinyint('vip_type').defaultTo(0); // 0=none, 1=bronze, 2=silver, 3=gold, 4=platinum
          table.datetime('vip_end').nullable();
          table.bigint('coin').defaultTo(0); // Moedas premium
          table.bigint('ruud').defaultTo(0); // Moedas Ruud
          table.string('last_ip', 45).nullable();
          table.string('last_hwid', 64).nullable();
          table.datetime('last_login').nullable();
          table.datetime('last_logout').nullable();
          table.integer('login_count').defaultTo(0);
          table.integer('failed_login_attempts').defaultTo(0);
          table.datetime('locked_until').nullable();
          table.boolean('is_gm').defaultTo(false);
          table.integer('gm_level').defaultTo(0);
          table.json('settings').nullable(); // Configurações JSON
          table.timestamp('created_at').defaultTo(db.fn.now());
          table.timestamp('updated_at').defaultTo(db.fn.now());
          table.timestamp('deleted_at').nullable();
          
          table.index(['login']);
          table.index(['email']);
          table.index(['block_code']);
          table.index(['vip_type']);
        });
        console.log('[AccountSystem] Tabela accounts criada');
      }
    });

    // Tabela de sessões
    await db.schema.hasTable(this.sessionTable).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.sessionTable, (table) => {
          table.increments('id').primary();
          table.integer('account_id').unsigned().notNullable();
          table.string('session_token', 128).unique().notNullable();
          table.string('ip', 45).notNullable();
          table.string('hwid', 64).nullable();
          table.string('user_agent', 500).nullable();
          table.datetime('expires_at').notNullable();
          table.datetime('last_activity').defaultTo(db.fn.now());
          table.boolean('is_active').defaultTo(true);
          table.timestamp('created_at').defaultTo(db.fn.now());
          
          table.foreign('account_id').references('id').inTable(this.tableName).onDelete('CASCADE');
          table.index(['session_token']);
          table.index(['account_id', 'is_active']);
          table.index(['expires_at']);
        });
        console.log('[AccountSystem] Tabela account_sessions criada');
      }
    });

    // Tabela de IP bans
    await db.schema.hasTable(this.ipBanTable).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.ipBanTable, (table) => {
          table.increments('id').primary();
          table.string('ip', 45).notNullable();
          table.string('reason', 255).nullable();
          table.integer('banned_by').unsigned().nullable();
          table.datetime('expires_at').nullable(); // null = permanente
          table.boolean('is_active').defaultTo(true);
          table.timestamp('created_at').defaultTo(db.fn.now());
          
          table.index(['ip', 'is_active']);
          table.index(['expires_at']);
        });
        console.log('[AccountSystem] Tabela ip_bans criada');
      }
    });

    // Tabela de HWID bans
    await db.schema.hasTable(this.hwidBanTable).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.hwidBanTable, (table) => {
          table.increments('id').primary();
          table.string('hwid', 64).notNullable();
          table.string('reason', 255).nullable();
          table.integer('banned_by').unsigned().nullable();
          table.datetime('expires_at').nullable();
          table.boolean('is_active').defaultTo(true);
          table.timestamp('created_at').defaultTo(db.fn.now());
          
          table.index(['hwid', 'is_active']);
          table.index(['expires_at']);
        });
        console.log('[AccountSystem] Tabela hwid_bans criada');
      }
    });

    // Tabela de logs de login
    await db.schema.hasTable(this.loginLogTable).then(async (exists) => {
      if (!exists) {
        await db.schema.createTable(this.loginLogTable, (table) => {
          table.increments('id').primary();
          table.integer('account_id').unsigned().nullable();
          table.string('login', 20).nullable();
          table.string('ip', 45).notNullable();
          table.string('hwid', 64).nullable();
          table.string('user_agent', 500).nullable();
          table.boolean('success').notNullable();
          table.string('failure_reason', 100).nullable();
          table.timestamp('created_at').defaultTo(db.fn.now());
          
          table.index(['account_id']);
          table.index(['ip']);
          table.index(['created_at']);
          table.index(['success']);
        });
        console.log('[AccountSystem] Tabela login_logs criada');
      }
    });
  }

  /**
   * Gera hash de senha com bcrypt
   */
  async hashPassword(password, salt = null) {
    if (!salt) {
      salt = await bcrypt.genSalt(this.config.bcryptRounds);
    }
    const hash = await bcrypt.hash(password, salt);
    return { hash, salt };
  }

  /**
   * Verifica senha
   */
  async verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  /**
   * Gera token aleatório
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Cria nova conta
   */
  async createAccount(data) {
    const {
      login,
      password,
      email = null,
      securityCode = null,
      referrerId = null,
    } = data;

    // Validações
    if (!login || login.length < 3 || login.length > 20) {
      throw new Error('Login deve ter entre 3 e 20 caracteres');
    }
    
    if (!password || password.length < this.config.passwordMinLength || password.length > this.config.passwordMaxLength) {
      throw new Error(`Senha deve ter entre ${this.config.passwordMinLength} e ${this.config.passwordMaxLength} caracteres`);
    }

    // Verificar se login já existe
    const existing = await this.db.select(this.tableName, 'id', { login }).first();
    if (existing) {
      throw new Error('Login já existe');
    }

    // Verificar email
    if (email) {
      const existingEmail = await this.db.select(this.tableName, 'id', { email }).first();
      if (existingEmail) {
        throw new Error('Email já cadastrado');
      }
    }

    // Hash da senha
    const { hash: passwordHash, salt: passwordSalt } = await this.hashPassword(password);

    const accountData = {
      login: login.toLowerCase(),
      password_hash: passwordHash,
      password_salt: passwordSalt,
      email: email?.toLowerCase(),
      email_verified: !this.config.emailVerificationRequired,
      email_verification_token: this.config.emailVerificationRequired ? this.generateToken(32) : null,
      security_code: securityCode ? await this.hashSecurityCode(securityCode) : null,
    };

    const [accountId] = await this.db.insert(this.tableName, accountData);
    
    // Log de criação
    await this.logLoginAttempt(accountId, login, 'account_create', true, null);
    
    return { accountId, ...accountData };
  }

  /**
   * Hash do código de segurança
   */
  async hashSecurityCode(code) {
    const { hash } = await this.hashPassword(code);
    return hash;
  }

  /**
   * Verifica código de segurança
   */
  async verifySecurityCode(accountId, code) {
    const account = await this.getAccountById(accountId);
    if (!account || !account.security_code) return false;
    return this.verifyPassword(code, account.security_code);
  }

  /**
   * Login de conta
   */
  async login(login, password, ip, hwid = null, userAgent = null) {
    const normalizedLogin = login.toLowerCase();
    
    // Buscar conta
    const account = await this.db.select(this.tableName, '*', { login: normalizedLogin }).first();
    
    // Log tentativa
    await this.logLoginAttempt(account?.id, login, ip, hwid, userAgent, account ? true : false, account ? null : 'account_not_found');
    
    if (!account) {
      return { success: false, reason: 'account_not_found', message: 'Conta não encontrada' };
    }

    // Verificar ban
    const banCheck = await this.checkBans(account.id, ip, hwid);
    if (banCheck.banned) {
      await this.logLoginAttempt(account.id, login, ip, hwid, userAgent, false, banCheck.reason);
      return { success: false, reason: 'banned', message: banCheck.message, details: banCheck };
    }

    // Verificar bloqueio por tentativas
    if (account.locked_until && new Date(account.locked_until) > new Date()) {
      const remaining = Math.ceil((new Date(account.locked_until) - new Date()) / 1000 / 60);
      await this.logLoginAttempt(account.id, login, ip, hwid, userAgent, false, 'account_locked');
      return { success: false, reason: 'account_locked', message: `Conta bloqueada. Tente novamente em ${remaining} minutos` };
    }

    // Verificar senha
    const passwordValid = await this.verifyPassword(password, account.password_hash);
    
    if (!passwordValid) {
      // Incrementar tentativas falhas
      const newAttempts = (account.failed_login_attempts || 0) + 1;
      const updateData = { failed_login_attempts: newAttempts };
      
      if (newAttempts >= this.config.maxLoginAttempts) {
        updateData.locked_until = this.db.getKnex().raw(`DATE_ADD(NOW(), INTERVAL ${this.config.lockoutDuration / 60000} MINUTE)`);
      }
      
      await this.db.update(this.tableName, { id: account.id }, updateData);
      await this.logLoginAttempt(account.id, login, ip, hwid, userAgent, false, 'invalid_password');
      
      return { success: false, reason: 'invalid_password', message: 'Senha incorreta', attemptsLeft: this.config.maxLoginAttempts - newAttempts };
    }

    // Login bem-sucedido - resetar tentativas
    await this.db.update(this.tableName, { id: account.id }, {
      failed_login_attempts: 0,
      locked_until: null,
      last_ip: ip,
      last_hwid: hwid,
      last_login: this.db.getKnex().fn.now(),
      login_count: this.db.getKnex().raw('login_count + 1'),
    });

    // Criar sessão
    const session = await this.createSession(account.id, ip, hwid, userAgent);
    
    await this.logLoginAttempt(account.id, login, ip, hwid, userAgent, true, null);
    
    return {
      success: true,
      account: this.sanitizeAccount(account),
      session,
    };
  }

  /**
   * Verifica bans (IP, HWID, Account)
   */
  async checkBans(accountId, ip, hwid) {
    const now = new Date();
    
    // Verificar ban de conta
    const account = await this.db.select(this.tableName, 'block_code, block_end, block_reason', { id: accountId }).first();
    if (account) {
      if (account.block_code === 2) { // Ban permanente
        return { banned: true, reason: 'account_perm_ban', message: account.block_reason || 'Conta banida permanentemente', type: 'account' };
      }
      if (account.block_code === 1 && account.block_end && new Date(account.block_end) > now) {
        return { banned: true, reason: 'account_temp_ban', message: `Conta banida até ${account.block_end}`, type: 'account', expiresAt: account.block_end };
      }
    }

    // Verificar IP ban
    if (ip) {
      const ipBan = await this.db.select(this.ipBanTable, '*', { ip, is_active: true }).first();
      if (ipBan && (!ipBan.expires_at || new Date(ipBan.expires_at) > now)) {
        return { banned: true, reason: 'ip_ban', message: ipBan.reason || 'IP banido', type: 'ip', expiresAt: ipBan.expires_at };
      }
    }

    // Verificar HWID ban
    if (hwid) {
      const hwidBan = await this.db.select(this.hwidBanTable, '*', { hwid, is_active: true }).first();
      if (hwidBan && (!hwidBan.expires_at || new Date(hwidBan.expires_at) > now)) {
        return { banned: true, reason: 'hwid_ban', message: hwidBan.reason || 'HWID banido', type: 'hwid', expiresAt: hwidBan.expires_at };
      }
    }

    return { banned: false };
  }

  /**
   * Cria sessão
   */
  async createSession(accountId, ip, hwid, userAgent) {
    const sessionToken = this.generateToken(64);
    const expiresAt = new Date(Date.now() + this.config.sessionDuration);
    
    await this.db.insert(this.sessionTable, {
      account_id: accountId,
      session_token: sessionToken,
      ip,
      hwid,
      user_agent: userAgent,
      expires_at: expiresAt,
    });
    
    return { sessionToken, expiresAt };
  }

  /**
   * Valida sessão
   */
  async validateSession(sessionToken) {
    const session = await this.db.select(this.sessionTable, '*', { 
      session_token: sessionToken, 
      is_active: true 
    }).first();
    
    if (!session) return null;
    
    if (new Date(session.expires_at) < new Date()) {
      await this.db.update(this.sessionTable, { id: session.id }, { is_active: false });
      return null;
    }
    
    // Atualizar última atividade
    await this.db.update(this.sessionTable, { id: session.id }, { 
      last_activity: this.db.getKnex().fn.now() 
    });
    
    // Buscar conta
    const account = await this.getAccountById(session.account_id);
    if (!account || account.block_code > 0) return null;
    
    return { session, account: this.sanitizeAccount(account) };
  }

  /**
   * Invalida sessão (logout)
   */
  async invalidateSession(sessionToken) {
    const session = await this.db.select(this.sessionTable, '*', { session_token: sessionToken }).first();
    if (session) {
      await this.db.update(this.sessionTable, { id: session.id }, { 
        is_active: false,
        // updated_at handled by trigger
      });
      
      // Atualizar last_logout da conta
      await this.db.update(this.tableName, { id: session.account_id }, {
        last_logout: this.db.getKnex().fn.now(),
      });
    }
    return true;
  }

  /**
   * Invalida todas as sessões de uma conta
   */
  async invalidateAllSessions(accountId) {
    await this.db.update(this.sessionTable, { account_id: accountId, is_active: true }, { is_active: false });
  }

  /**
   * Busca conta por ID
   */
  async getAccountById(accountId) {
    return this.db.select(this.tableName, '*', { id: accountId }).first();
  }

  /**
   * Busca conta por login
   */
  async getAccountByLogin(login) {
    return this.db.select(this.tableName, '*', { login: login.toLowerCase() }).first();
  }

  /**
   * Busca conta por email
   */
  async getAccountByEmail(email) {
    return this.db.select(this.tableName, '*', { email: email.toLowerCase() }).first();
  }

  /**
   * Atualiza senha
   */
  async changePassword(accountId, currentPassword, newPassword) {
    const account = await this.getAccountById(accountId);
    if (!account) throw new Error('Conta não encontrada');
    
    const valid = await this.verifyPassword(currentPassword, account.password_hash);
    if (!valid) throw new Error('Senha atual incorreta');
    
    if (newPassword.length < this.config.passwordMinLength || newPassword.length > this.config.passwordMaxLength) {
      throw new Error(`Nova senha deve ter entre ${this.config.passwordMinLength} e ${this.config.passwordMaxLength} caracteres`);
    }
    
    const { hash, salt } = await this.hashPassword(newPassword);
    
    await this.db.update(this.tableName, { id: accountId }, {
      password_hash: hash,
      password_salt: salt,
    });
    
    // Invalidar todas as sessões exceto a atual (opcional)
    await this.invalidateAllSessions(accountId);
    
    return true;
  }

  /**
   * Define/atualiza senha secundária
   */
  async setSecondaryPassword(accountId, password) {
    if (!this.config.secondaryPasswordEnabled) {
      throw new Error('Senha secundária não habilitada');
    }
    
    if (password.length < 4 || password.length > 8) {
      throw new Error('Senha secundária deve ter entre 4 e 8 caracteres');
    }
    
    const { hash, salt } = await this.hashPassword(password);
    
    await this.db.update(this.tableName, { id: accountId }, {
      secondary_password_hash: hash,
      secondary_password_salt: salt,
    });
    
    return true;
  }

  /**
   * Verifica senha secundária
   */
  async verifySecondaryPassword(accountId, password) {
    const account = await this.getAccountById(accountId);
    if (!account || !account.secondary_password_hash) return false;
    return this.verifyPassword(password, account.secondary_password_hash);
  }

  /**
   * Remove senha secundária
   */
  async removeSecondaryPassword(accountId, password) {
    const valid = await this.verifySecondaryPassword(accountId, password);
    if (!valid) throw new Error('Senha secundária incorreta');
    
    await this.db.update(this.tableName, { id: accountId }, {
      secondary_password_hash: null,
      secondary_password_salt: null,
    });
    
    return true;
  }

  /**
   * Verifica email
   */
  async verifyEmail(token) {
    const account = await this.db.select(this.tableName, '*', { email_verification_token: token }).first();
    if (!account) throw new Error('Token inválido ou expirado');
    
    await this.db.update(this.tableName, { id: account.id }, {
      email_verified: true,
      email_verification_token: null,
    });
    
    return true;
  }

  /**
   * Reenvia email de verificação
   */
  async resendVerificationEmail(accountId) {
    const account = await this.getAccountById(accountId);
    if (!account) throw new Error('Conta não encontrada');
    if (account.email_verified) throw new Error('Email já verificado');
    
    const token = this.generateToken(32);
    await this.db.update(this.tableName, { id: accountId }, { email_verification_token: token });
    
    // Aqui integraria com serviço de email
    return { token, email: account.email };
  }

  /**
   * Adiciona VIP
   */
  async addVip(accountId, vipType, durationDays) {
    const vipEnd = new Date();
    vipEnd.setDate(vipEnd.getDate() + durationDays);
    
    await this.db.update(this.tableName, { id: accountId }, {
      vip_type: vipType,
      vip_end: vipEnd,
    });
    
    return { vipType, vipEnd };
  }

  /**
   * Adiciona coins
   */
  async addCoins(accountId, amount, reason = 'manual') {
    const account = await this.getAccountById(accountId);
    const newAmount = (account.coin || 0) + amount;
    
    await this.db.update(this.tableName, { id: accountId }, { coin: newAmount });
    
    // Log de transação
    await this.logCoinTransaction(accountId, amount, reason, newAmount);
    
    return newAmount;
  }

  /**
   * Remove coins
   */
  async removeCoins(accountId, amount, reason = 'manual') {
    const account = await this.getAccountById(accountId);
    const current = account.coin || 0;
    
    if (current < amount) throw new Error('Coins insuficientes');
    
    const newAmount = current - amount;
    await this.db.update(this.tableName, { id: accountId }, { coin: newAmount });
    
    await this.logCoinTransaction(accountId, -amount, reason, newAmount);
    
    return newAmount;
  }

  /**
   * Log de transação de coins
   */
  async logCoinTransaction(accountId, amount, reason, balance) {
    // Implementar tabela coin_logs se necessário
    console.log(`[CoinLog] Account: ${accountId}, Amount: ${amount}, Reason: ${reason}, Balance: ${balance}`);
  }

  /**
   * Ban de conta
   */
  async banAccount(accountId, reason, durationDays = null, bannedBy = null) {
    const updateData = {
      block_code: durationDays ? 1 : 2,
      block_reason: reason,
    };
    
    if (durationDays) {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + durationDays);
      updateData.block_end = endDate;
    } else {
      updateData.block_end = null;
    }
    
    await this.db.update(this.tableName, { id: accountId }, updateData);
    await this.invalidateAllSessions(accountId);
    
    return true;
  }

  /**
   * Desban de conta
   */
  async unbanAccount(accountId) {
    await this.db.update(this.tableName, { id: accountId }, {
      block_code: 0,
      block_end: null,
      block_reason: null,
    });
    return true;
  }

  /**
   * Ban de IP
   */
  async banIp(ip, reason, durationDays = null, bannedBy = null) {
    const data = { ip, reason, banned_by: bannedBy, is_active: true };
    
    if (durationDays) {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + durationDays);
      data.expires_at = endDate;
    }
    
    await this.db.insert(this.ipBanTable, data);
    return true;
  }

  /**
   * Remove ban de IP
   */
  async unbanIp(ip) {
    await this.db.update(this.ipBanTable, { ip, is_active: true }, { is_active: false });
    return true;
  }

  /**
   * Ban de HWID
   */
  async banHwid(hwid, reason, durationDays = null, bannedBy = null) {
    const data = { hwid, reason, banned_by: bannedBy, is_active: true };
    
    if (durationDays) {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + durationDays);
      data.expires_at = endDate;
    }
    
    await this.db.insert(this.hwidBanTable, data);
    return true;
  }

  /**
   * Remove ban de HWID
   */
  async unbanHwid(hwid) {
    await this.db.update(this.hwidBanTable, { hwid, is_active: true }, { is_active: false });
    return true;
  }

  /**
   * Lista contas com paginação
   */
  async listAccounts(options = {}) {
    return this.db.paginate(this.tableName, {
      page: options.page || 1,
      limit: options.limit || 20,
      where: options.where || {},
      orderBy: options.orderBy || 'created_at',
      orderDirection: options.orderDirection || 'DESC',
      columns: options.columns || 'id,login,email,vip_type,coin,block_code,last_login,created_at',
    });
  }

  /**
   * Obtém estatísticas da conta
   */
  async getAccountStats(accountId) {
    const account = await this.getAccountById(accountId);
    if (!account) return null;
    
    // Contar personagens
    const charCount = await this.db.getKnex()('characters')
      .where('account_id', accountId)
      .whereNull('deleted_at')
      .count('* as count')
      .first();
    
    // Sessões ativas
    const activeSessions = await this.db.getKnex()(this.sessionTable)
      .where('account_id', accountId)
      .where('is_active', true)
      .where('expires_at', '>', this.db.getKnex().fn.now())
      .count('* as count')
      .first();
    
    return {
      ...this.sanitizeAccount(account),
      characterCount: parseInt(charCount?.count || 0),
      activeSessions: parseInt(activeSessions?.count || 0),
    };
  }

  /**
   * Sanitiza dados da conta (remove campos sensíveis)
   */
  sanitizeAccount(account) {
    if (!account) return null;
    const { password_hash, password_salt, secondary_password_hash, secondary_password_salt, email_verification_token, security_code, ...safe } = account;
    return safe;
  }

  /**
   * Log de tentativa de login
   */
  async logLoginAttempt(accountId, login, ip, hwid, userAgent, success, failureReason = null) {
    await this.db.insert(this.loginLogTable, {
      account_id: accountId,
      login,
      ip,
      hwid,
      user_agent: userAgent,
      success,
      failure_reason: failureReason,
    });
  }

  /**
   * Obtém histórico de login
   */
  async getLoginHistory(accountId, limit = 50) {
    return this.db.select(this.loginLogTable, '*', { account_id: accountId })
      .orderBy('created_at', 'DESC')
      .limit(limit);
  }

  /**
   * Limpa sessões expiradas
   */
  async cleanupExpiredSessions() {
    const knex = this.db.getKnex();
    return knex(this.sessionTable)
      .where('expires_at', '<', knex.fn.now())
      .where('is_active', true)
      .update({ is_active: false });
  }

  /**
   * Verifica se conta é GM
   */
  async isGameMaster(accountId) {
    const account = await this.getAccountById(accountId);
    return account?.is_gm === true || account?.gm_level > 0;
  }
}

module.exports = AccountSystem;