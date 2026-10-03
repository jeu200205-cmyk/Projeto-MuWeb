/**
 * MUGateway.js - Gateway WebSocket ↔ TCP para MU Online
 * 
 * Encaminha pacotes bidirecionalmente entre:
 * - Cliente Web (WebSocket) 
 * - ConnectServer (TCP 44405)
 * - GameServers (TCP 55901+)
 * - JoinServer (TCP 55970)
 * - DataServer (TCP 55960)
 * 
 * Implementa:
 * - Protocolo MU (C1/C2 headers)
 * - Reconexão automática
 * - Heartbeat/keepalive
 * - Load balancing entre GameServers
 * - Logging de pacotes para debug
 * - Métricas Prometheus
 */

const WebSocket = require('ws');
const net = require('net');
const EventEmitter = require('events');
const MUConfig = require('./MUConfig');
const { createLogger } = require('./utils/logger');

class MUGateway extends EventEmitter {
    constructor(config = null) {
        super();
        this.config = config || new MUConfig();
        this.logger = createLogger('MUGateway');
        
        // Servidor WebSocket
        this.wss = null;
        this.wsClients = new Map(); // ws -> clientInfo
        
        // Conexões TCP para servidores MU
        this.tcpConnections = {
            connectServer: null,
            gameServers: new Map(), // serverId -> connection
            joinServer: null,
            dataServer: null
        };
        
        // Estado
        this.running = false;
        this.stats = {
            wsConnections: 0,
            tcpConnections: 0,
            packetsReceived: 0,
            packetsSent: 0,
            bytesReceived: 0,
            bytesSent: 0,
            errors: 0,
            reconnections: 0
        };
        
        // Buffers de pacotes para reassembly
        this.packetBuffers = new Map(); // connectionId -> Buffer
        
        // Heartbeat timers
        this.heartbeatTimers = new Map();
        this.reconnectTimers = new Map();
        
        // Sequência de IDs para clientes
        this.clientIdCounter = 0;
    }

    async start() {
        if (this.running) {
            this.logger.warn('Gateway já está rodando');
            return;
        }

        this.logger.info('Iniciando MUGateway...');
        
        try {
            // Inicia servidor WebSocket
            await this.startWebSocketServer();
            
            // Conecta aos servidores TCP
            await this.connectToTcpServers();
            
            // Inicia health checks
            this.startHealthChecks();
            
            // Inicia métricas
            if (this.config.metrics.enabled) {
                this.startMetricsServer();
            }
            
            this.running = true;
            this.logger.info('MUGateway iniciado com sucesso');
            this.emit('started');
            
        } catch (error) {
            this.logger.error('Erro ao iniciar gateway:', error);
            throw error;
        }
    }

    async startWebSocketServer() {
        const { host, port, maxConnections } = this.config.gateway;
        
        this.wss = new WebSocket.Server({ host, port, maxPayload: 1024 * 1024 });
        
        this.wss.on('listening', () => {
            this.logger.info(`WebSocket Server ouvindo em ${host}:${port}`);
        });
        
        this.wss.on('connection', (ws, req) => this.handleWebSocketConnection(ws, req));
        
        this.wss.on('error', (error) => {
            this.logger.error('Erro no WebSocket Server:', error);
            this.stats.errors++;
            this.emit('error', error);
        });
        
        return new Promise((resolve, reject) => {
            this.wss.on('listening', resolve);
            this.wss.on('error', reject);
        });
    }

    handleWebSocketConnection(ws, req) {
        const clientId = ++this.clientIdCounter;
        const clientIp = req.socket.remoteAddress;
        
        // Verifica whitelist/blacklist
        if (!this.checkIpAccess(clientIp)) {
            this.logger.warn(`Conexão rejeitada - IP não autorizado: ${clientIp}`);
            ws.close(4001, 'IP not authorized');
            return;
        }
        
        // Verifica limite de conexões por IP
        if (!this.checkIpConnectionLimit(clientIp)) {
            this.logger.warn(`Conexão rejeitada - Limite de conexões por IP excedido: ${clientIp}`);
            ws.close(4002, 'Connection limit exceeded');
            return;
        }
        
        const clientInfo = {
            id: clientId,
            ws,
            ip: clientIp,
            connectedAt: Date.now(),
            lastActivity: Date.now(),
            authenticated: false,
            serverId: null,
            gameServerConnection: null,
            packetQueue: [],
            bytesSent: 0,
            bytesReceived: 0
        };
        
        this.wsClients.set(ws, clientInfo);
        this.stats.wsConnections++;
        
        this.logger.info(`Nova conexão WebSocket: ${clientId} de ${clientIp} (Total: ${this.stats.wsConnections})`);
        this.emit('clientConnected', clientInfo);
        
        // Configura handlers do WebSocket
        ws.on('message', (data, isBinary) => this.handleWebSocketMessage(ws, data, isBinary));
        ws.on('close', (code, reason) => this.handleWebSocketClose(ws, code, reason));
        ws.on('error', (error) => this.handleWebSocketError(ws, error));
        ws.on('pong', () => this.handleWebSocketPong(ws));
        
        // Envia pacote de inicialização (0x00)
        this.sendToClient(ws, this.createInitPacket(1));
        
        // Inicia heartbeat para este cliente
        this.startClientHeartbeat(ws);
    }

    checkIpAccess(ip) {
        const { ipWhitelist, ipBlacklist } = this.config.security;
        const normalizedIp = ip.replace('::ffff:', '');
        
        if (ipBlacklist.includes(normalizedIp)) return false;
        if (ipWhitelist.length > 0 && !ipWhitelist.includes(normalizedIp)) return false;
        return true;
    }

    checkIpConnectionLimit(ip) {
        const { maxConnectionsPerIp } = this.config.security;
        const normalizedIp = ip.replace('::ffff:', '');
        let count = 0;
        
        for (const [, clientInfo] of this.wsClients) {
            if (clientInfo.ip.replace('::ffff:', '') === normalizedIp) count++;
        }
        
        return count < maxConnectionsPerIp;
    }

    handleWebSocketMessage(ws, data, isBinary) {
        const clientInfo = this.wsClients.get(ws);
        if (!clientInfo) return;
        
        clientInfo.lastActivity = Date.now();
        clientInfo.bytesReceived += data.length;
        this.stats.bytesReceived += data.length;
        this.stats.packetsReceived++;
        
        // Converte para Buffer se necessário
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        
        // Log do pacote recebido
        if (this.config.gateway.packetLogEnabled) {
            this.logPacket('WS_RECV', clientInfo.id, buffer);
        }
        
        // Processa pacotes MU (podem vir fragmentados)
        this.processIncomingPackets(clientInfo, buffer);
    }

    processIncomingPackets(clientInfo, buffer) {
        let bufferRef = this.packetBuffers.get(clientInfo.id);
        
        if (!bufferRef) {
            bufferRef = Buffer.alloc(0);
        }
        
        bufferRef = Buffer.concat([bufferRef, buffer]);
        
        // Processa pacotes completos
        let offset = 0;
        while (offset < bufferRef.length) {
            if (bufferRef.length - offset < 3) break; // Header mínimo
            
            const header = bufferRef[offset];
            let packetSize = 0;
            let headOffset = 0;
            
            if (header === 0xC1) {
                // Pacote pequeno: C1 size head [...]
                if (bufferRef.length - offset < 3) break;
                packetSize = bufferRef[offset + 1];
                headOffset = 2;
            } else if (header === 0xC2) {
                // Pacote grande: C2 sizeHi sizeLo head [...]
                if (bufferRef.length - offset < 4) break;
                packetSize = bufferRef.readUInt16LE(offset + 1);
                headOffset = 3;
            } else {
                // Header inválido - descarta e tenta resync
                this.logger.warn(`Header inválido: 0x${header.toString(16)} do cliente ${clientInfo.id}`);
                this.stats.errors++;
                offset++;
                continue;
            }
            
            if (packetSize < 3 || packetSize > this.config.protocol.maxPacketSize) {
                this.logger.warn(`Tamanho de pacote inválido: ${packetSize} do cliente ${clientInfo.id}`);
                this.stats.errors++;
                offset++;
                continue;
            }
            
            if (bufferRef.length - offset >= packetSize) {
                // Pacote completo
                const packet = bufferRef.slice(offset, offset + packetSize);
                offset += packetSize;
                
                // Processa o pacote
                this.routePacket(clientInfo, packet);
            } else {
                // Pacote incompleto
                break;
            }
        }
        
        // Salva buffer restante
        if (offset < bufferRef.length) {
            this.packetBuffers.set(clientInfo.id, bufferRef.slice(offset));
        } else {
            this.packetBuffers.delete(clientInfo.id);
        }
    }

    routePacket(clientInfo, packet) {
        const header = packet[0];
        const head = header === 0xC1 ? packet[2] : packet[3];
        
        this.logger.debug(`Roteando pacote: cliente=${clientInfo.id}, header=0x${header.toString(16)}, head=0x${head.toString(16)}, size=${packet.length}`);
        
        // Determina para onde enviar baseado no head/comando
        switch (head) {
            case this.config.protocol.commands.SERVER_INFO_SUB_REQUEST: // 0x03
            case this.config.protocol.commands.SERVER_LIST_SUB_REQUEST: // 0x06
                // Requisições de servidor vão para ConnectServer
                this.forwardToConnectServer(clientInfo, packet);
                break;
                
            case this.config.protocol.commands.JS_CONNECT_ACCOUNT: // 0x01
            case this.config.protocol.commands.JS_DISCONNECT_ACCOUNT: // 0x02
            case this.config.protocol.commands.JS_MAP_SERVER_MOVE: // 0x03
            case this.config.protocol.commands.JS_MAP_SERVER_MOVE_AUTH: // 0x04
            case this.config.protocol.commands.JS_ACCOUNT_LEVEL: // 0x05
            case this.config.protocol.commands.JS_MAP_SERVER_MOVE_CANCEL: // 0x10
            case this.config.protocol.commands.JS_ACCOUNT_LEVEL_SAVE: // 0x11
            case this.config.protocol.commands.JS_SERVER_USER_INFO: // 0x20
            case this.config.protocol.commands.JS_EXTERNAL_DISCONNECT: // 0x30
            case this.config.protocol.commands.JS_SERVER_MESSAGE: // 0x2F
            case this.config.protocol.commands.JS_REGISTER_ACCOUNT: // 0x40
                // Protocolos de autenticação/account vão para JoinServer
                this.forwardToJoinServer(clientInfo, packet);
                break;
                
            case this.config.protocol.commands.DS_CHARACTER_LIST: // 0x01
            case this.config.protocol.commands.DS_CHARACTER_CREATE: // 0x02
            case this.config.protocol.commands.DS_CHARACTER_DELETE: // 0x03
            case this.config.protocol.commands.DS_CHARACTER_INFO: // 0x04
            case this.config.protocol.commands.DS_WAREHOUSE: // 0x05
            case this.config.protocol.commands.DS_CREATE_ITEM: // 0x07
            case this.config.protocol.commands.DS_OPTION_DATA: // 0x08
            case this.config.protocol.commands.DS_PET_ITEM_INFO: // 0x09
            case this.config.protocol.commands.DS_CONNECT_CHARACTER: // 0x70
            case this.config.protocol.commands.DS_DISCONNECT_CHARACTER: // 0x71
            case this.config.protocol.commands.DS_GLOBAL_WHISPER: // 0x72
                // Protocolos de personagem/dados vão para DataServer
                this.forwardToDataServer(clientInfo, packet);
                break;
                
            default:
                // Se cliente já tem GameServer associado, encaminha para lá
                if (clientInfo.gameServerConnection) {
                    this.forwardToGameServer(clientInfo.gameServerConnection, packet);
                } else {
                    // Tenta ConnectServer como fallback
                    this.forwardToConnectServer(clientInfo, packet);
                }
                break;
        }
    }

    forwardToConnectServer(clientInfo, packet) {
        const conn = this.tcpConnections.connectServer;
        if (conn && conn.connected) {
            this.sendTcpPacket(conn, packet, 'ConnectServer');
            clientInfo.serverId = 'connect';
        } else {
            this.logger.warn('ConnectServer não conectado, enfileirando pacote');
            clientInfo.packetQueue.push({ packet, target: 'connect' });
            this.reconnectTcpServer('connectServer');
        }
    }

    forwardToJoinServer(clientInfo, packet) {
        const conn = this.tcpConnections.joinServer;
        if (conn && conn.connected) {
            this.sendTcpPacket(conn, packet, 'JoinServer');
            clientInfo.serverId = 'join';
        } else {
            this.logger.warn('JoinServer não conectado, enfileirando pacote');
            clientInfo.packetQueue.push({ packet, target: 'join' });
            this.reconnectTcpServer('joinServer');
        }
    }

    forwardToDataServer(clientInfo, packet) {
        const conn = this.tcpConnections.dataServer;
        if (conn && conn.connected) {
            this.sendTcpPacket(conn, packet, 'DataServer');
            clientInfo.serverId = 'data';
        } else {
            this.logger.warn('DataServer não conectado, enfileirando pacote');
            clientInfo.packetQueue.push({ packet, target: 'data' });
            this.reconnectTcpServer('dataServer');
        }
    }

    forwardToGameServer(gameServerConn, packet) {
        if (gameServerConn && gameServerConn.connected) {
            this.sendTcpPacket(gameServerConn, packet, `GameServer-${gameServerConn.serverId}`);
        } else {
            this.logger.warn(`GameServer ${gameServerConn?.serverId} não conectado`);
        }
    }

    assignGameServer(clientInfo) {
        const bestServer = this.config.getBestGameServer();
        if (!bestServer) {
            this.logger.error('Nenhum GameServer disponível');
            return null;
        }
        
        let gameConn = this.tcpConnections.gameServers.get(bestServer.id);
        
        if (!gameConn || !gameConn.connected) {
            // Cria nova conexão para este GameServer
            gameConn = this.createGameServerConnection(bestServer);
        }
        
        if (gameConn && gameConn.connected) {
            clientInfo.gameServerConnection = gameConn;
            clientInfo.serverId = `game_${bestServer.id}`;
            gameConn.clientCount = (gameConn.clientCount || 0) + 1;
            this.config.updateGameServerLoad(bestServer.id, gameConn.clientCount);
            return gameConn;
        }
        
        return null;
    }

    async connectToTcpServers() {
        // ConnectServer
        await this.connectToConnectServer();
        
        // JoinServer
        await this.connectToJoinServer();
        
        // DataServer
        await this.connectToDataServer();
        
        // GameServers (conecta aos habilitados)
        for (const gs of this.config.getEnabledGameServers()) {
            await this.connectToGameServer(gs);
        }
    }

    async connectToConnectServer() {
        const { host, port, reconnectInterval, maxReconnectAttempts, timeout } = this.config.connectServer;
        
        return this.createTcpConnection('connectServer', host, port, {
            reconnectInterval,
            maxReconnectAttempts,
            timeout,
            onConnect: (conn) => {
                this.logger.info(`Conectado ao ConnectServer em ${host}:${port}`);
                this.flushPacketQueue('connect');
            },
            onData: (data) => this.handleTcpData('connectServer', data),
            onClose: () => this.handleTcpClose('connectServer'),
            onError: (err) => this.handleTcpError('connectServer', err)
        });
    }

    async connectToJoinServer() {
        const { host, port, reconnectInterval, maxReconnectAttempts, timeout } = this.config.joinServer;
        
        return this.createTcpConnection('joinServer', host, port, {
            reconnectInterval,
            maxReconnectAttempts,
            timeout,
            onConnect: (conn) => {
                this.logger.info(`Conectado ao JoinServer em ${host}:${port}`);
                // Envia ServerInfo para JoinServer
                this.sendJoinServerInfo(conn);
                this.flushPacketQueue('join');
            },
            onData: (data) => this.handleTcpData('joinServer', data),
            onClose: () => this.handleTcpClose('joinServer'),
            onError: (err) => this.handleTcpError('joinServer', err)
        });
    }

    async connectToDataServer() {
        const { host, port, reconnectInterval, maxReconnectAttempts, timeout } = this.config.dataServer;
        
        return this.createTcpConnection('dataServer', host, port, {
            reconnectInterval,
            maxReconnectAttempts,
            timeout,
            onConnect: (conn) => {
                this.logger.info(`Conectado ao DataServer em ${host}:${port}`);
                this.sendDataServerInfo(conn);
                this.flushPacketQueue('data');
            },
            onData: (data) => this.handleTcpData('dataServer', data),
            onClose: () => this.handleTcpClose('dataServer'),
            onError: (err) => this.handleTcpError('dataServer', err)
        });
    }

    async connectToGameServer(gameServerConfig) {
        const { id, host, port, name } = gameServerConfig;
        
        return this.createTcpConnection(`gameServer_${id}`, host, port, {
            reconnectInterval: 5000,
            maxReconnectAttempts: 10,
            timeout: 10000,
            serverId: id,
            serverName: name,
            onConnect: (conn) => {
                this.logger.info(`Conectado ao ${name} (${host}:${port})`);
                this.sendGameServerInfo(conn);
                this.flushPacketQueue(`game_${id}`);
            },
            onData: (data) => this.handleGameServerData(conn, data),
            onClose: () => this.handleGameServerClose(conn),
            onError: (err) => this.handleTcpError(`gameServer_${id}`, err)
        });
    }

    createTcpConnection(name, host, port, options) {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = options.maxReconnectAttempts || 10;
            
            const connect = () => {
                const socket = new net.Socket();
                socket.setTimeout(options.timeout || 10000);
                socket.setNoDelay(true);
                socket.setKeepAlive(true, 10000);
                
                const connInfo = {
                    name,
                    socket,
                    host,
                    port,
                    connected: false,
                    connecting: true,
                    reconnectAttempts: 0,
                    lastActivity: Date.now(),
                    serverId: options.serverId,
                    serverName: options.serverName,
                    clientCount: 0,
                    packetBuffer: Buffer.alloc(0)
                };
                
                socket.on('connect', () => {
                    attempts = 0;
                    const pendingTimer = this.reconnectTimers.get(name);
                    if (pendingTimer) clearTimeout(pendingTimer);
                    this.reconnectTimers.delete(name);
                    connInfo.connected = true;
                    connInfo.connecting = false;
                    connInfo.reconnectAttempts = 0;
                    this.tcpConnections[name] = connInfo;
                    this.stats.tcpConnections++;
                    if (options.onConnect) options.onConnect(connInfo);
                    resolve(connInfo);
                });
                
                socket.on('data', (data) => {
                    connInfo.lastActivity = Date.now();
                    if (options.onData) options.onData(data);
                });
                
                socket.on('close', (hadError) => {
                    connInfo.connected = false;
                    this.stats.tcpConnections--;
                    if (options.onClose) options.onClose(hadError);
                    
                    // Single-flight: close + health-check share one timer owner.
                    if (this.running && attempts < maxAttempts && !this.reconnectTimers.has(name)) {
                        attempts++;
                        connInfo.reconnectAttempts = attempts;
                        this.stats.reconnections++;
                        this.logger.info(`Reconectando ${name} (tentativa ${attempts}/${maxAttempts})...`);
                        const timer = setTimeout(() => {
                            this.reconnectTimers.delete(name);
                            connect();
                        }, options.reconnectInterval || 5000);
                        this.reconnectTimers.set(name, timer);
                    }
                });
                
                socket.on('error', (err) => {
                    if (options.onError) options.onError(err);
                    // Não rejeita aqui, deixa o close lidar com reconexão
                });
                
                socket.on('timeout', () => {
                    this.logger.warn(`Timeout na conexão ${name}`);
                    socket.destroy();
                });
                
                socket.connect(port, host);
            };
            
            connect();
            
            // Timeout inicial de conexão
            setTimeout(() => {
                if (!this.tcpConnections[name] || !this.tcpConnections[name].connected) {
                    reject(new Error(`Timeout conectando a ${name} (${host}:${port})`));
                }
            }, options.timeout || 10000);
        });
    }

    createGameServerConnection(gameServerConfig) {
        const connName = `gameServer_${gameServerConfig.id}`;
        
        return this.createTcpConnection(connName, gameServerConfig.host, gameServerConfig.port, {
            serverId: gameServerConfig.id,
            serverName: gameServerConfig.name,
            onConnect: (conn) => {
                this.tcpConnections.gameServers.set(gameServerConfig.id, conn);
                this.logger.info(`GameServer ${gameServerConfig.name} conectado`);
            },
            onClose: () => {
                this.tcpConnections.gameServers.delete(gameServerConfig.id);
            }
        }).catch(err => {
            this.logger.error(`Falha ao conectar GameServer ${gameServerConfig.name}:`, err);
            return null;
        });
    }

    sendTcpPacket(connInfo, packet, serverName) {
        if (!connInfo || !connInfo.connected || !connInfo.socket) {
            this.logger.warn(`Tentativa de enviar para ${serverName} desconectado`);
            return false;
        }
        
        try {
            connInfo.socket.write(packet);
            connInfo.lastActivity = Date.now();
            this.stats.packetsSent++;
            this.stats.bytesSent += packet.length;
            
            if (this.config.gateway.packetLogEnabled) {
                this.logPacket(`TCP_SEND_${serverName.toUpperCase()}`, connInfo.name, packet);
            }
            return true;
        } catch (error) {
            this.logger.error(`Erro ao enviar para ${serverName}:`, error);
            this.stats.errors++;
            return false;
        }
    }

    sendToClient(ws, packet) {
        if (!ws || ws.readyState !== WebSocket.OPEN) return false;
        
        try {
            ws.send(packet, { binary: true });
            this.stats.packetsSent++;
            this.stats.bytesSent += packet.length;
            
            const clientInfo = this.wsClients.get(ws);
            if (clientInfo) {
                clientInfo.bytesSent += packet.length;
            }
            
            if (this.config.gateway.packetLogEnabled) {
                this.logPacket('WS_SEND', clientInfo?.id || 'unknown', packet);
            }
            return true;
        } catch (error) {
            this.logger.error('Erro ao enviar para cliente WebSocket:', error);
            this.stats.errors++;
            return false;
        }
    }

    handleTcpData(serverName, data) {
        const connInfo = this.tcpConnections[serverName];
        if (!connInfo) return;
        
        connInfo.packetBuffer = Buffer.concat([connInfo.packetBuffer, data]);
        
        // Processa pacotes completos do buffer
        let offset = 0;
        while (offset < connInfo.packetBuffer.length) {
            if (connInfo.packetBuffer.length - offset < 3) break;
            
            const header = connInfo.packetBuffer[offset];
            let packetSize = 0;
            
            if (header === 0xC1) {
                if (connInfo.packetBuffer.length - offset < 3) break;
                packetSize = connInfo.packetBuffer[offset + 1];
            } else if (header === 0xC2) {
                if (connInfo.packetBuffer.length - offset < 4) break;
                packetSize = connInfo.packetBuffer.readUInt16LE(offset + 1);
            } else {
                // Header inválido - tenta resync
                offset++;
                continue;
            }
            
            if (packetSize < 3 || packetSize > this.config.protocol.maxPacketSize) {
                offset++;
                continue;
            }
            
            if (connInfo.packetBuffer.length - offset >= packetSize) {
                const packet = connInfo.packetBuffer.slice(offset, offset + packetSize);
                offset += packetSize;
                
                this.stats.packetsReceived++;
                this.stats.bytesReceived += packet.length;
                
                if (this.config.gateway.packetLogEnabled) {
                    this.logPacket(`TCP_RECV_${serverName.toUpperCase()}`, connInfo.name, packet);
                }
                
                // Roteia resposta de volta para cliente WebSocket apropriado
                this.routeTcpResponse(serverName, connInfo, packet);
            } else {
                break;
            }
        }
        
        // Mantém buffer restante
        if (offset > 0) {
            connInfo.packetBuffer = connInfo.packetBuffer.slice(offset);
        }
    }

    routeTcpResponse(serverName, connInfo, packet) {
        const header = packet[0];
        const head = header === 0xC1 ? packet[2] : packet[3];
        
        // Encontra cliente WebSocket associado
        let targetClient = null;
        
        for (const [ws, clientInfo] of this.wsClients) {
            if (clientInfo.serverId === serverName || 
                (serverName.startsWith('gameServer') && clientInfo.gameServerConnection === connInfo)) {
                targetClient = clientInfo;
                break;
            }
        }
        
        // Se não encontrou cliente específico, broadcast para todos no mesmo servidor
        if (!targetClient) {
            for (const [ws, clientInfo] of this.wsClients) {
                if (clientInfo.serverId === serverName || 
                    (serverName.startsWith('gameServer') && clientInfo.gameServerConnection === connInfo)) {
                    this.sendToClient(ws, packet);
                }
            }
        } else if (targetClient.ws.readyState === WebSocket.OPEN) {
            this.sendToClient(targetClient.ws, packet);
        }
    }

    handleGameServerData(connInfo, data) {
        // Similar ao handleTcpData mas específico para GameServers
        this.handleTcpData(`gameServer_${connInfo.serverId}`, data);
    }

    handleTcpClose(serverName, hadError) {
        this.logger.warn(`Conexão ${serverName} fechada${hadError ? ' com erro' : ''}`);
        
        // Notifica clientes WebSocket associados
        for (const [ws, clientInfo] of this.wsClients) {
            if (clientInfo.serverId === serverName) {
                this.sendToClient(ws, this.createDisconnectPacket());
                clientInfo.serverId = null;
            }
            if (serverName.startsWith('gameServer') && clientInfo.gameServerConnection?.name === serverName) {
                clientInfo.gameServerConnection = null;
            }
        }
    }

    handleTcpError(serverName, error) {
        this.logger.error(`Erro na conexão ${serverName}:`, error);
        this.stats.errors++;
    }

    flushPacketQueue(target) {
        for (const [ws, clientInfo] of this.wsClients) {
            const queue = clientInfo.packetQueue.filter(p => p.target === target);
            for (const { packet } of queue) {
                switch (target) {
                    case 'connect':
                        this.forwardToConnectServer(clientInfo, packet);
                        break;
                    case 'join':
                        this.forwardToJoinServer(clientInfo, packet);
                        break;
                    case 'data':
                        this.forwardToDataServer(clientInfo, packet);
                        break;
                }
            }
            // Remove itens processados
            clientInfo.packetQueue = clientInfo.packetQueue.filter(p => p.target !== target);
        }
    }

    reconnectTcpServer(serverName) {
        if (this.reconnectTimers.has(serverName)) return;
        const current = this.tcpConnections[serverName];
        if (current?.connecting) return;
        
        const timer = setTimeout(() => {
            this.reconnectTimers.delete(serverName);
            switch (serverName) {
                case 'connectServer': this.connectToConnectServer(); break;
                case 'joinServer': this.connectToJoinServer(); break;
                case 'dataServer': this.connectToDataServer(); break;
            }
        }, this.config[serverName.replace('Server', 'Server')]?.reconnectInterval || 5000);
        
        this.reconnectTimers.set(serverName, timer);
    }

    // Pacotes especiais
    createInitPacket(result) {
        // 0xC1 0x03 0x00 result
        return Buffer.from([0xC1, 0x03, 0x00, result]);
    }

    createDisconnectPacket() {
        // Pacote de desconexão genérico
        return Buffer.from([0xC1, 0x03, 0x00, 0x00]);
    }

    sendJoinServerInfo(conn) {
        // Envia SDHP_SERVER_INFO_RECV para JoinServer
        const packet = Buffer.alloc(0x58); // Tamanho típico
        packet[0] = 0xC1;
        packet[1] = packet.length;
        packet[2] = 0x00; // ServerInfo
        // Preenche dados do servidor...
        this.sendTcpPacket(conn, packet, 'JoinServer');
    }

    sendDataServerInfo(conn) {
        // Envia SDHP_SERVER_INFO_RECV para DataServer
        const packet = Buffer.alloc(0x58);
        packet[0] = 0xC1;
        packet[1] = packet.length;
        packet[2] = 0x00; // ServerInfo
        this.sendTcpPacket(conn, packet, 'DataServer');
    }

    sendGameServerInfo(conn) {
        // Envia SDHP_SERVER_INFO_RECV para GameServer
        const packet = Buffer.alloc(0x58);
        packet[0] = 0xC1;
        packet[1] = packet.length;
        packet[2] = 0x00; // ServerInfo
        this.sendTcpPacket(conn, packet, `GameServer-${conn.serverId}`);
    }

    // Heartbeat
    startClientHeartbeat(ws) {
        const interval = this.config.gateway.heartbeatInterval;
        const timer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.ping();
            } else {
                clearInterval(timer);
                this.heartbeatTimers.delete(ws);
            }
        }, interval);
        
        this.heartbeatTimers.set(ws, timer);
    }

    handleWebSocketPong(ws) {
        const clientInfo = this.wsClients.get(ws);
        if (clientInfo) {
            clientInfo.lastActivity = Date.now();
        }
    }

    handleWebSocketClose(ws, code, reason) {
        const clientInfo = this.wsClients.get(ws);
        if (!clientInfo) return;
        
        // Para heartbeat
        const timer = this.heartbeatTimers.get(ws);
        if (timer) {
            clearInterval(timer);
            this.heartbeatTimers.delete(ws);
        }
        
        // Decrementa contador do GameServer
        if (clientInfo.gameServerConnection) {
            clientInfo.gameServerConnection.clientCount = Math.max(0, (clientInfo.gameServerConnection.clientCount || 1) - 1);
        }
        
        this.wsClients.delete(ws);
        this.packetBuffers.delete(clientInfo.id);
        this.stats.wsConnections--;
        
        this.logger.info(`Cliente desconectado: ${clientInfo.id} (${clientInfo.ip}) - Code: ${code}, Reason: ${reason.toString()}`);
        this.emit('clientDisconnected', clientInfo);
    }

    handleWebSocketError(ws, error) {
        this.logger.error(`Erro WebSocket cliente ${this.wsClients.get(ws)?.id}:`, error);
        this.stats.errors++;
    }

    // Health Checks
    startHealthChecks() {
        if (!this.config.healthCheck.enabled) return;
        
        setInterval(() => {
            this.performHealthCheck();
        }, this.config.healthCheck.interval);
    }

    async performHealthCheck() {
        const results = {};
        
        // Verifica conexões TCP
        for (const [name, conn] of Object.entries(this.tcpConnections)) {
            if (name === 'gameServers') {
                for (const [id, gsConn] of conn) {
                    results[`gameServer_${id}`] = gsConn?.connected || false;
                }
            } else {
                results[name] = conn?.connected || false;
            }
        }
        
        // Verifica WebSocket server
        results.webSocket = this.wss?.listening || false;
        
        this.emit('healthCheck', results);
        
        // Tenta reconectar servidores caídos
        for (const [name, connected] of Object.entries(results)) {
            if (!connected && !name.startsWith('gameServer')) {
                this.reconnectTcpServer(name);
            }
        }
    }

    // Métricas Prometheus
    startMetricsServer() {
        const http = require('http');
        const { port, path: metricsPath, prefix } = this.config.metrics;
        
        this.metricsServer = http.createServer((req, res) => {
            if (req.url === metricsPath) {
                res.setHeader('Content-Type', 'text/plain; version=0.0.4');
                res.end(this.generateMetrics(prefix));
            } else {
                res.statusCode = 404;
                res.end('Not Found');
            }
        });
        
        this.metricsServer.listen(port, () => {
            this.logger.info(`Métricas Prometheus em http://localhost:${port}${metricsPath}`);
        });
    }

    generateMetrics(prefix) {
        const lines = [];
        const add = (name, value, labels = '') => {
            lines.push(`${prefix}${name}${labels} ${value}`);
        };
        
        add('ws_connections_total', this.stats.wsConnections);
        add('tcp_connections_total', this.stats.tcpConnections);
        add('packets_received_total', this.stats.packetsReceived);
        add('packets_sent_total', this.stats.packetsSent);
        add('bytes_received_total', this.stats.bytesReceived);
        add('bytes_sent_total', this.stats.bytesSent);
        add('errors_total', this.stats.errors);
        add('reconnections_total', this.stats.reconnections);
        
        // Por GameServer
        for (const [id, conn] of this.tcpConnections.gameServers) {
            add('game_server_connected', conn.connected ? 1 : 0, `{server_id="${id}"}`);
            add('game_server_clients', conn.clientCount || 0, `{server_id="${id}"}`);
        }
        
        return lines.join('\n') + '\n';
    }

    // Logging de pacotes
    logPacket(direction, connectionId, packet) {
        const hex = packet.slice(0, Math.min(packet.length, 64)).toString('hex').toUpperCase();
        const header = packet[0];
        const head = header === 0xC1 ? packet[2] : packet[3];
        this.logger.debug(`[PACKET] ${direction} | Conn: ${connectionId} | Header: 0x${header.toString(16)} | Head: 0x${head.toString(16)} | Size: ${packet.length} | Data: ${hex}${packet.length > 64 ? '...' : ''}`);
    }

    // Estatísticas
    getStats() {
        return {
            ...this.stats,
            wsClients: this.wsClients.size,
            tcpConnectServer: this.tcpConnections.connectServer?.connected || false,
            tcpJoinServer: this.tcpConnections.joinServer?.connected || false,
            tcpDataServer: this.tcpConnections.dataServer?.connected || false,
            tcpGameServers: Array.from(this.tcpConnections.gameServers.entries()).map(([id, conn]) => ({
                id,
                name: conn.serverName,
                connected: conn.connected,
                clients: conn.clientCount || 0
            })),
            uptime: process.uptime(),
            memory: process.memoryUsage()
        };
    }

    async stop() {
        this.logger.info('Parando MUGateway...');
        this.running = false;
        
        // Para health checks e métricas
        if (this.metricsServer) {
            this.metricsServer.close();
        }
        
        // Fecha conexões WebSocket
        for (const [ws, clientInfo] of this.wsClients) {
            ws.close(1001, 'Server shutting down');
        }
        this.wsClients.clear();
        
        // Fecha conexões TCP
        for (const [name, conn] of Object.entries(this.tcpConnections)) {
            if (name === 'gameServers') {
                for (const [, gsConn] of conn) {
                    gsConn.socket?.destroy();
                }
            } else if (conn?.socket) {
                conn.socket.destroy();
            }
        }
        
        // Para servidor WebSocket
        if (this.wss) {
            await new Promise(resolve => this.wss.close(resolve));
        }
        
        // Limpa timers
        for (const timer of this.heartbeatTimers.values()) clearInterval(timer);
        for (const timer of this.reconnectTimers.values()) clearTimeout(timer);
        this.heartbeatTimers.clear();
        this.reconnectTimers.clear();
        
        this.logger.info('MUGateway parado');
        this.emit('stopped');
    }
}

module.exports = MUGateway;