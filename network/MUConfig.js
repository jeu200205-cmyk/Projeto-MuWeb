/**
 * MUConfig.js - Configuração Centralizada da Infraestrutura MU Online
 * 
 * Portas padrão baseadas no código fonte real:
 * - ConnectServer: TCP 44405, UDP 55557
 * - GameServer: TCP 55901 (configurável)
 * - JoinServer: TCP 55970 (configurável)
 * - DataServer: TCP 55960 (configurável)
 * - WebSocket Gateway: 9091
 */

const fs = require('fs');
const path = require('path');

class MUConfig {
    constructor(configPath = null) {
        this.configPath = configPath || path.join(__dirname, 'config.json');
        this.config = this.loadConfig();
        this.applyEnvOverrides();
    }

    loadConfig() {
        const defaultConfig = this.getDefaultConfig();
        
        if (fs.existsSync(this.configPath)) {
            try {
                const fileConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
                return this.deepMerge(defaultConfig, fileConfig);
            } catch (error) {
                console.error('[MUConfig] Erro ao carregar config.json:', error.message);
                return defaultConfig;
            }
        }
        
        // Salva config padrão se não existir
        this.saveConfig(defaultConfig);
        return defaultConfig;
    }

    getDefaultConfig() {
        return {
            // Gateway WebSocket
            gateway: {
                host: '0.0.0.0',
                port: 9091,
                maxConnections: 10000,
                heartbeatInterval: 30000,
                connectionTimeout: 60000,
                packetLogEnabled: true,
                compressionEnabled: false
            },

            // ConnectServer (Gateway principal para clientes)
            connectServer: {
                host: '127.0.0.1',
                port: 44405,
                udpPort: 55557,
                maxIpConnections: 0,
                reconnectInterval: 5000,
                maxReconnectAttempts: 10,
                timeout: 10000,
                encryption: {
                    enabled: true,
                    key: 'MuEMU_ConnectServer_Key_2024',
                    version: 'S6'
                }
            },

            // GameServers (podem ser múltiplos para load balancing)
            gameServers: [
                {
                    id: 1,
                    name: 'GameServer-01',
                    host: '127.0.0.1',
                    port: 55901,
                    maxUsers: 1000,
                    currentUsers: 0,
                    enabled: true,
                    weight: 100,
                    tags: ['main', 'pvp', 'pve']
                }
            ],

            // JoinServer (Autenticação de contas)
            joinServer: {
                host: '127.0.0.1',
                port: 55970,
                reconnectInterval: 5000,
                maxReconnectAttempts: 10,
                timeout: 10000,
                database: {
                    odbc: 'MuOnline',
                    user: 'sa',
                    password: '',
                    caseSensitive: false,
                    md5Encryption: false
                },
                encryption: {
                    enabled: true,
                    key: 'MuEMU_JoinServer_Key_2024'
                }
            },

            // DataServer (Persistência de dados)
            dataServer: {
                host: '127.0.0.1',
                port: 55960,
                reconnectInterval: 5000,
                maxReconnectAttempts: 10,
                timeout: 10000,
                database: {
                    odbc: 'MuOnline',
                    user: 'sa',
                    password: '',
                    maxCharacters: 5
                },
                encryption: {
                    enabled: true,
                    key: 'MuEMU_DataServer_Key_2024'
                }
            },

            // Configuração do Servidor (ServerList.dat equivalente)
            serverList: [
                {
                    serverCode: 1,
                    serverName: 'MU Online',
                    serverAddress: '127.0.0.1',
                    serverPort: 55901,
                    serverShow: 1,
                    serverState: 1,
                    maxUserCount: 1000,
                    type: 0xCC
                }
            ],

            // Database
            database: {
                host: '127.0.0.1',
                port: 1433,
                name: 'MuOnline',
                user: 'sa',
                password: '',
                connectionLimit: 50,
                acquireTimeout: 30000,
                timeout: 30000,
                options: {
                    encrypt: false,
                    trustServerCertificate: true,
                    enableArithAbort: true
                }
            },

            // Logging
            logging: {
                level: 'info',
                directory: path.join(__dirname, '..', 'logs'),
                maxFiles: 30,
                maxSize: '10m',
                format: 'json',
                console: true,
                packetLog: true,
                packetLogDirectory: path.join(__dirname, '..', 'logs', 'packets')
            },

            // Métricas Prometheus
            metrics: {
                enabled: true,
                port: 9092,
                path: '/metrics',
                prefix: 'mu_gateway_'
            },

            // Health Checks
            healthCheck: {
                enabled: true,
                interval: 10000,
                timeout: 5000,
                endpoints: [
                    { name: 'connect', host: '127.0.0.1', port: 44405 },
                    { name: 'join', host: '127.0.0.1', port: 55970 },
                    { name: 'data', host: '127.0.0.1', port: 55960 }
                ]
            },

            // Segurança
            security: {
                ipWhitelist: ['127.0.0.1', '::1'],
                ipBlacklist: [],
                maxConnectionsPerIp: 50,
                rateLimit: {
                    windowMs: 60000,
                    maxRequests: 1000
                },
                antiDDoS: {
                    enabled: true,
                    maxPacketsPerSecond: 1000,
                    banDuration: 300000
                }
            },

            // Process Management
            processManager: {
                autoStart: true,
                autoRestart: true,
                maxRestarts: 5,
                restartDelay: 10000,
                workingDirectory: 'C:\\Users\\jeu\\Documents\\Nova pasta\\mu-server',
                servers: {
                    connectServer: {
                        executable: 'ConnectServer.exe',
                        args: [],
                        env: {}
                    },
                    gameServer: {
                        executable: 'GameServer.exe',
                        args: [],
                        env: {}
                    },
                    joinServer: {
                        executable: 'JoinServer.exe',
                        args: [],
                        env: {}
                    },
                    dataServer: {
                        executable: 'DataServer.exe',
                        args: [],
                        env: {}
                    }
                }
            },

            // Protocolo MU
            protocol: {
                // Headers de pacote
                packetHeaders: {
                    C1: 0xC1, // Pacote pequeno (1 byte size)
                    C2: 0xC2  // Pacote grande (2 bytes size)
                },
                // Comandos principais
                commands: {
                    // ConnectServer <-> Client
                    SERVER_INFO_REQUEST: 0xF4,
                    SERVER_INFO_SUB_REQUEST: 0x03,
                    SERVER_LIST_REQUEST: 0xF4,
                    SERVER_LIST_SUB_REQUEST: 0x06,
                    SERVER_INIT: 0x00,
                    
                    // JoinServer protocolos
                    JS_SERVER_INFO: 0x00,
                    JS_CONNECT_ACCOUNT: 0x01,
                    JS_DISCONNECT_ACCOUNT: 0x02,
                    JS_MAP_SERVER_MOVE: 0x03,
                    JS_MAP_SERVER_MOVE_AUTH: 0x04,
                    JS_ACCOUNT_LEVEL: 0x05,
                    JS_MAP_SERVER_MOVE_CANCEL: 0x10,
                    JS_ACCOUNT_LEVEL_SAVE: 0x11,
                    JS_SERVER_USER_INFO: 0x20,
                    JS_EXTERNAL_DISCONNECT: 0x30,
                    JS_SERVER_MESSAGE: 0x2F,
                    JS_REGISTER_ACCOUNT: 0x40,
                    
                    // DataServer protocolos
                    DS_SERVER_INFO: 0x00,
                    DS_CHARACTER_LIST: 0x01,
                    DS_CHARACTER_CREATE: 0x02,
                    DS_CHARACTER_DELETE: 0x03,
                    DS_CHARACTER_INFO: 0x04,
                    DS_WAREHOUSE: 0x05,
                    DS_CREATE_ITEM: 0x07,
                    DS_OPTION_DATA: 0x08,
                    DS_PET_ITEM_INFO: 0x09,
                    DS_CRYWOLF_SYNC: 0x1E,
                    DS_CRYWOLF_INFO: 0x1F,
                    DS_GLOBAL_POST: 0x20,
                    DS_GLOBAL_NOTICE: 0x21,
                    DS_CONNECT_CHARACTER: 0x70,
                    DS_DISCONNECT_CHARACTER: 0x71,
                    DS_GLOBAL_WHISPER: 0x72,
                    DS_CASTLE: 0x80
                },
                // Tamanhos máximos
                maxPacketSize: 0x2000, // 8192 bytes
                maxMainPacketSize: 0x800, // 2048 bytes
                maxSidePacketSize: 0x2000 // 8192 bytes
            }
        };
    }

    applyEnvOverrides() {
        // Gateway
        if (process.env.GATEWAY_PORT) this.config.gateway.port = parseInt(process.env.GATEWAY_PORT);
        if (process.env.GATEWAY_HOST) this.config.gateway.host = process.env.GATEWAY_HOST;
        
        // ConnectServer
        if (process.env.CONNECT_SERVER_HOST) this.config.connectServer.host = process.env.CONNECT_SERVER_HOST;
        if (process.env.CONNECT_SERVER_PORT) this.config.connectServer.port = parseInt(process.env.CONNECT_SERVER_PORT);
        
        // GameServers
        if (process.env.GAME_SERVER_HOST) this.config.gameServers[0].host = process.env.GAME_SERVER_HOST;
        if (process.env.GAME_SERVER_PORT) this.config.gameServers[0].port = parseInt(process.env.GAME_SERVER_PORT);
        
        // JoinServer
        if (process.env.JOIN_SERVER_HOST) this.config.joinServer.host = process.env.JOIN_SERVER_HOST;
        if (process.env.JOIN_SERVER_PORT) this.config.joinServer.port = parseInt(process.env.JOIN_SERVER_PORT);
        
        // DataServer
        if (process.env.DATA_SERVER_HOST) this.config.dataServer.host = process.env.DATA_SERVER_HOST;
        if (process.env.DATA_SERVER_PORT) this.config.dataServer.port = parseInt(process.env.DATA_SERVER_PORT);
        
        // Database
        if (process.env.DB_HOST) this.config.database.host = process.env.DB_HOST;
        if (process.env.DB_PORT) this.config.database.port = parseInt(process.env.DB_PORT);
        if (process.env.DB_NAME) this.config.database.name = process.env.DB_NAME;
        if (process.env.DB_USER) this.config.database.user = process.env.DB_USER;
        if (process.env.DB_PASSWORD) this.config.database.password = process.env.DB_PASSWORD;
        
        // Logging
        if (process.env.LOG_LEVEL) this.config.logging.level = process.env.LOG_LEVEL;
        
        // Métricas
        if (process.env.METRICS_PORT) this.config.metrics.port = parseInt(process.env.METRICS_PORT);
        
        // Working Directory
        if (process.env.MU_SERVER_DIR) this.config.processManager.workingDirectory = process.env.MU_SERVER_DIR;
    }

    deepMerge(target, source) {
        const result = { ...target };
        for (const key of Object.keys(source)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        return result;
    }

    saveConfig(config = this.config) {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('[MUConfig] Erro ao salvar config:', error.message);
            return false;
        }
    }

    get(path) {
        const keys = path.split('.');
        let value = this.config;
        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return undefined;
            }
        }
        return value;
    }

    set(path, value) {
        const keys = path.split('.');
        let obj = this.config;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!(keys[i] in obj)) obj[keys[i]] = {};
            obj = obj[keys[i]];
        }
        obj[keys[keys.length - 1]] = value;
        this.saveConfig();
    }

    // Getters convenientes
    get gateway() { return this.config.gateway; }
    get connectServer() { return this.config.connectServer; }
    get gameServers() { return this.config.gameServers; }
    get joinServer() { return this.config.joinServer; }
    get dataServer() { return this.config.dataServer; }
    get serverList() { return this.config.serverList; }
    get database() { return this.config.database; }
    get logging() { return this.config.logging; }
    get metrics() { return this.config.metrics; }
    get healthCheck() { return this.config.healthCheck; }
    get security() { return this.config.security; }
    get processManager() { return this.config.processManager; }
    get protocol() { return this.config.protocol; }

    // Helpers para GameServers
    getEnabledGameServers() {
        return this.config.gameServers.filter(s => s.enabled);
    }

    getBestGameServer() {
        const enabled = this.getEnabledGameServers();
        if (enabled.length === 0) return null;
        
        // Seleciona o com menos usuários relativos à capacidade
        return enabled.reduce((best, current) => {
            const bestLoad = best.currentUsers / best.maxUsers;
            const currentLoad = current.currentUsers / current.maxUsers;
            return currentLoad < bestLoad ? current : best;
        });
    }

    updateGameServerLoad(serverId, currentUsers) {
        const server = this.config.gameServers.find(s => s.id === serverId);
        if (server) {
            server.currentUsers = currentUsers;
            this.saveConfig();
        }
    }
}

module.exports = MUConfig;