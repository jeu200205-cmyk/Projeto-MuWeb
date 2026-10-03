/**
 * index.js - Ponto de Entrada Principal da Infraestrutura de Rede MU Online
 * 
 * Inicializa:
 * - MUGateway (WebSocket ↔ TCP Gateway)
 * - MUServerManager (Gerenciador dos servidores reais)
 * - Configuração centralizada
 * - Graceful shutdown
 * - CLI para controle
 */

const MUConfig = require('./MUConfig');
const MUGateway = require('./MUGateway');
const MUServerManager = require('./MUServerManager');
const ServerLauncher = require('./ServerLauncher');
const { createLogger } = require('./utils/logger');

class MUNetworkInfrastructure {
    constructor(options = {}) {
        this.options = options;
        this.config = options.config || new MUConfig(options.configPath);
        this.logger = createLogger('MUNetwork', this.config.logging);
        
        this.gateway = null;
        this.serverManager = null;
        this.running = false;
        
        // Setup graceful shutdown
        this.setupSignalHandlers();
    }

    setupSignalHandlers() {
        const shutdown = async (signal) => {
            this.logger.info(`Recebido sinal ${signal}, iniciando shutdown graceful...`);
            await this.stop();
            process.exit(0);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
        
        // Windows
        if (process.platform === 'win32') {
            process.on('exit', () => this.stop());
        }
    }

    async start() {
        if (this.running) {
            this.logger.warn('Infraestrutura já está rodando');
            return;
        }

        this.logger.info('=== Iniciando Infraestrutura de Rede MU Online ===');
        this.logger.info(`Versão: 1.0.0`);
        this.logger.info(`Config: ${this.config.configPath}`);
        this.logger.info(`Diretório servidores: ${this.config.processManager.workingDirectory}`);

        try {
            // Inicia ServerManager (gerencia processos dos servidores reais)
            this.serverManager = new MUServerManager(this.config);
            
            // Eventos do ServerManager
            this.serverManager.on('serverStarted', (name, pid) => {
                this.logger.info(`✓ ${name} iniciado (PID: ${pid})`);
            });
            
            this.serverManager.on('serverStopped', (name, code, signal) => {
                this.logger.warn(`✗ ${name} parado (Code: ${code}, Signal: ${signal})`);
            });
            
            this.serverManager.on('healthCheckFailed', (name) => {
                this.logger.error(`⚠ Health check falhou para ${name}`);
            });
            
            this.serverManager.on('metrics', (metrics) => {
                this.logger.debug(`Métricas: ${JSON.stringify(metrics)}`);
            });

            await this.serverManager.start();

            // Inicia Gateway WebSocket ↔ TCP
            this.gateway = new MUGateway(this.config);
            
            // Eventos do Gateway
            this.gateway.on('clientConnected', (clientInfo) => {
                this.logger.info(`🌐 Cliente conectado: ${clientInfo.id} (${clientInfo.ip})`);
            });
            
            this.gateway.on('clientDisconnected', (clientInfo) => {
                this.logger.info(`🌐 Cliente desconectado: ${clientInfo.id}`);
            });
            
            this.gateway.on('healthCheck', (results) => {
                const failed = Object.entries(results).filter(([_, v]) => !v);
                if (failed.length > 0) {
                    this.logger.warn(`Health check falhou: ${failed.map(([k]) => k).join(', ')}`);
                }
            });

            await this.gateway.start();

            this.running = true;
            
            this.logger.info('=== Infraestrutura iniciada com sucesso ===');
            this.logger.info(`Gateway WebSocket: ws://${this.config.gateway.host}:${this.config.gateway.port}`);
            this.logger.info(`Métricas Prometheus: http://localhost:${this.config.metrics.port}${this.config.metrics.path}`);
            
            // Log status inicial
            this.logStatus();

            return this;

        } catch (error) {
            this.logger.error('Erro ao iniciar infraestrutura:', error);
            await this.stop();
            throw error;
        }
    }

    async stop() {
        if (!this.running) return;
        
        this.logger.info('=== Parando Infraestrutura ===');
        this.running = false;

        try {
            if (this.gateway) {
                await this.gateway.stop();
                this.gateway = null;
            }

            if (this.serverManager) {
                await this.serverManager.stop();
                this.serverManager = null;
            }

            this.logger.info('=== Infraestrutura parada ===');
        } catch (error) {
            this.logger.error('Erro ao parar infraestrutura:', error);
        }
    }

    logStatus() {
        const gatewayStats = this.gateway?.getStats() || {};
        const serverMetrics = this.serverManager?.getMetrics() || {};
        
        this.logger.info('--- Status Atual ---');
        this.logger.info(`Clientes WebSocket: ${gatewayStats.wsConnections || 0}`);
        this.logger.info(`Conexões TCP: ${gatewayStats.tcpConnections || 0}`);
        this.logger.info(`Pacotes Recebidos: ${gatewayStats.packetsReceived || 0}`);
        this.logger.info(`Pacotes Enviados: ${gatewayStats.packetsSent || 0}`);
        this.logger.info(`Erros: ${gatewayStats.errors || 0}`);
        this.logger.info(`Servidores Online: ${serverMetrics.serversOnline || 0}/${serverMetrics.serversTotal || 0}`);
        this.logger.info(`Jogadores Total: ${serverMetrics.totalPlayers || 0}`);
        this.logger.info('-------------------');
    }

    // CLI Commands
    async handleCommand(command, args) {
        switch (command) {
            case 'status':
                this.logStatus();
                break;
                
            case 'gateway':
                console.log(JSON.stringify(this.gateway?.getStats(), null, 2));
                break;
                
            case 'servers':
                console.log(JSON.stringify(this.serverManager?.getAllStatus(), null, 2));
                break;
                
            case 'metrics':
                console.log(JSON.stringify(this.serverManager?.getMetrics(), null, 2));
                break;
                
            case 'restart':
                if (args[0] && this.serverManager) {
                    await this.serverManager.restartServer(args[0]);
                } else {
                    console.log('Uso: restart <serverName>');
                }
                break;
                
            case 'start':
                if (args[0] && this.serverManager) {
                    const serverConfig = this.config.processManager.servers[args[0]];
                    if (serverConfig) {
                        await this.serverManager.startServer(args[0], serverConfig, this.config.processManager.workingDirectory);
                    }
                } else {
                    console.log('Uso: start <serverName>');
                }
                break;
                
            case 'stop':
                if (args[0] && this.serverManager) {
                    await this.serverManager.stopServer(args[0]);
                } else {
                    console.log('Uso: stop <serverName>');
                }
                break;
                
            case 'add-gs':
                if (args.length >= 3 && this.serverManager) {
                    const [name, host, port] = args;
                    this.serverManager.addGameServer({ name, host, port: parseInt(port) });
                } else {
                    console.log('Uso: add-gs <name> <host> <port>');
                }
                break;
                
            case 'remove-gs':
                if (args[0] && this.serverManager) {
                    this.serverManager.removeGameServer(parseInt(args[0]));
                } else {
                    console.log('Uso: remove-gs <serverId>');
                }
                break;
                
            case 'config':
                console.log(JSON.stringify(this.config.config, null, 2));
                break;
                
            case 'help':
            default:
                this.printHelp();
                break;
        }
    }

    printHelp() {
        console.log(`
MU Online Network Infrastructure - CLI

Comandos:
  status              - Mostra status geral
  gateway             - Estatísticas detalhadas do gateway
  servers             - Status de todos os servidores
  metrics             - Métricas agregadas
  restart <name>      - Reinicia servidor (connectServer, gameServer, joinServer, dataServer)
  start <name>        - Inicia servidor
  stop <name>         - Para servidor
  add-gs <name> <host> <port>  - Adiciona GameServer
  remove-gs <id>      - Remove GameServer
  config              - Mostra configuração completa
  help                - Mostra esta ajuda

Servidores gerenciados:
  - connectServer (ConnectServer.exe) - Porta 44405
  - gameServer (GameServer.exe)       - Porta 55901
  - joinServer (JoinServer.exe)       - Porta 55970
  - dataServer (DataServer.exe)       - Porta 55960

Gateway WebSocket: ws://localhost:9091
Métricas Prometheus: http://localhost:9092/metrics
        `);
    }
}

// Execução direta
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    const commandArgs = args.slice(1);

    const infra = new MUNetworkInfrastructure();

    if (command) {
        // Modo CLI - executa comando e sai
        infra.start().then(() => {
            return infra.handleCommand(command, commandArgs);
        }).then(() => {
            // Para comandos de consulta, mantém rodando por um tempo
            if (['status', 'gateway', 'servers', 'metrics', 'config'].includes(command)) {
                setTimeout(() => process.exit(0), 1000);
            } else {
                process.exit(0);
            }
        }).catch(err => {
            console.error('Erro:', err.message);
            process.exit(1);
        });
    } else {
        // Modo daemon - inicia e mantém rodando
        infra.start().catch(err => {
            console.error('Erro fatal:', err);
            process.exit(1);
        });
    }
}

module.exports = {
    MUNetworkInfrastructure,
    MUConfig,
    MUGateway,
    MUServerManager,
    ServerLauncher
};