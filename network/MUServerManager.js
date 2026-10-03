/**
 * MUServerManager.js - Gerenciador dos Servidores MU Reais
 * 
 * Responsável por:
 * - Inicialização/parada dos 4 servidores (Connect, Game, Join, Data)
 * - Health checks contínuos
 * - Restart automático em caso de falha
 * - Configuração de portas/IPs via config.json
 * - Logs centralizados
 * - Métricas de jogadores online
 * - Balanceamento de carga entre GameServers
 */

const EventEmitter = require('events');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const MUConfig = require('./MUConfig');
const ServerLauncher = require('./ServerLauncher');
const { createLogger } = require('./utils/logger');

class MUServerManager extends EventEmitter {
    constructor(config = null) {
        super();
        this.config = config || new MUConfig();
        this.logger = createLogger('MUServerManager', this.config.logging);
        
        this.launcher = new ServerLauncher(this.config.processManager);
        this.servers = new Map(); // name -> serverInfo
        this.healthCheckInterval = null;
        this.metricsInterval = null;
        this.running = false;
        
        // Estado dos servidores
        this.serverStatus = {
            connectServer: { running: false, pid: null, restarts: 0, lastStart: null, lastHealthCheck: null },
            gameServer: { running: false, pid: null, restarts: 0, lastStart: null, lastHealthCheck: null },
            joinServer: { running: false, pid: null, restarts: 0, lastStart: null, lastHealthCheck: null },
            dataServer: { running: false, pid: null, restarts: 0, lastStart: null, lastHealthCheck: null }
        };
        
        // Métricas agregadas
        this.metrics = {
            totalPlayers: 0,
            serversOnline: 0,
            serversTotal: 0,
            uptime: 0,
            startTime: Date.now()
        };
    }

    async start() {
        if (this.running) {
            this.logger.warn('ServerManager já está rodando');
            return;
        }

        this.logger.info('Iniciando MUServerManager...');
        this.running = true;

        try {
            // Inicia servidores se autoStart habilitado
            if (this.config.processManager.autoStart) {
                await this.startAllServers();
            }

            // Inicia health checks
            this.startHealthChecks();

            // Inicia coleta de métricas
            this.startMetricsCollection();

            this.logger.info('MUServerManager iniciado com sucesso');
            this.emit('started');

        } catch (error) {
            this.logger.error('Erro ao iniciar ServerManager:', error);
            throw error;
        }
    }

    async startAllServers() {
        const serverConfigs = this.config.processManager.servers;
        const workDir = this.config.processManager.workingDirectory;

        // Ordem de inicialização: DataServer -> JoinServer -> ConnectServer -> GameServer
        const startOrder = ['dataServer', 'joinServer', 'connectServer', 'gameServer'];

        for (const serverName of startOrder) {
            const serverConfig = serverConfigs[serverName];
            if (serverConfig) {
                try {
                    await this.startServer(serverName, serverConfig, workDir);
                    // Pequena pausa entre inicializações
                    await this.sleep(2000);
                } catch (error) {
                    this.logger.error(`Falha ao iniciar ${serverName}:`, error);
                    // Continua com os outros servidores
                }
            }
        }
    }

    async startServer(name, serverConfig, workDir) {
        if (this.serverStatus[name].running) {
            this.logger.warn(`${name} já está rodando`);
            return;
        }

        this.logger.info(`Iniciando ${name}...`);
        
        try {
            const result = await this.launcher.launch(serverConfig.executable, {
                cwd: workDir,
                args: serverConfig.args,
                env: { ...process.env, ...serverConfig.env },
                detached: true
            });

            this.serverStatus[name] = {
                running: true,
                pid: result.pid,
                restarts: this.serverStatus[name].restarts,
                lastStart: Date.now(),
                lastHealthCheck: null
            };

            this.servers.set(name, {
                name,
                process: result.process,
                pid: result.pid,
                config: serverConfig,
                startTime: Date.now()
            });

            this.logger.info(`${name} iniciado com PID ${result.pid}`);
            this.emit('serverStarted', name, result.pid);

            // Configura handlers do processo
            this.setupProcessHandlers(name, result.process);

        } catch (error) {
            this.serverStatus[name].running = false;
            throw error;
        }
    }

    setupProcessHandlers(name, process) {
        process.on('exit', (code, signal) => {
            this.logger.warn(`${name} finalizou com código ${code}, sinal ${signal}`);
            this.handleServerExit(name, code, signal);
        });

        process.on('error', (error) => {
            this.logger.error(`Erro no processo ${name}:`, error);
            this.emit('serverError', name, error);
        });

        // Captura stdout/stderr para logs
        if (process.stdout) {
            process.stdout.on('data', (data) => {
                const output = data.toString().trim();
                if (output) this.logger.debug(`[${name}] ${output}`);
            });
        }

        if (process.stderr) {
            process.stderr.on('data', (data) => {
                const output = data.toString().trim();
                if (output) this.logger.warn(`[${name} ERROR] ${output}`);
            });
        }
    }

    async handleServerExit(name, code, signal) {
        this.serverStatus[name].running = false;
        this.serverStatus[name].pid = null;
        this.servers.delete(name);
        this.emit('serverStopped', name, code, signal);

        // Auto-restart se habilitado
        if (this.config.processManager.autoRestart && this.running) {
            const maxRestarts = this.config.processManager.maxRestarts;
            const currentRestarts = this.serverStatus[name].restarts;

            if (currentRestarts < maxRestarts) {
                this.serverStatus[name].restarts++;
                this.logger.info(`Reiniciando ${name} (tentativa ${currentRestarts + 1}/${maxRestarts})...`);
                
                setTimeout(async () => {
                    try {
                        const serverConfig = this.config.processManager.servers[name];
                        await this.startServer(name, serverConfig, this.config.processManager.workingDirectory);
                    } catch (error) {
                        this.logger.error(`Falha no restart de ${name}:`, error);
                    }
                }, this.config.processManager.restartDelay);
            } else {
                this.logger.error(`${name} excedeu máximo de restarts (${maxRestarts})`);
                this.emit('serverMaxRestartsReached', name);
            }
        }
    }

    async stopServer(name) {
        const server = this.servers.get(name);
        if (!server || !server.process) {
            this.logger.warn(`${name} não está rodando`);
            return;
        }

        this.logger.info(`Parando ${name} (PID: ${server.pid})...`);

        try {
            // Tenta graceful shutdown primeiro
            server.process.kill('SIGTERM');
            
            // Aguarda até 10 segundos
            await this.waitForExit(server.process, 10000);
            
        } catch (error) {
            // Force kill se necessário
            this.logger.warn(`Force killing ${name}...`);
            server.process.kill('SIGKILL');
            await this.waitForExit(server.process, 5000);
        }

        this.serverStatus[name].running = false;
        this.serverStatus[name].pid = null;
        this.servers.delete(name);
        this.emit('serverStopped', name, 0, 'SIGTERM');
    }

    async stopAllServers() {
        this.logger.info('Parando todos os servidores...');
        
        // Ordem inversa: GameServer -> ConnectServer -> JoinServer -> DataServer
        const stopOrder = ['gameServer', 'connectServer', 'joinServer', 'dataServer'];
        
        for (const name of stopOrder) {
            await this.stopServer(name);
            await this.sleep(1000);
        }
    }

    waitForExit(process, timeout) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                resolve(false); // Timeout
            }, timeout);

            process.on('exit', () => {
                clearTimeout(timer);
                resolve(true);
            });
        });
    }

    startHealthChecks() {
        const interval = this.config.healthCheck.interval || 10000;
        
        this.healthCheckInterval = setInterval(async () => {
            await this.performHealthChecks();
        }, interval);

        // Health check inicial
        this.performHealthChecks();
    }

    async performHealthChecks() {
        const results = {};
        
        for (const [name, status] of Object.entries(this.serverStatus)) {
            const isHealthy = await this.checkServerHealth(name);
            status.lastHealthCheck = Date.now();
            results[name] = isHealthy;
            
            if (!isHealthy && status.running) {
                this.logger.warn(`Health check falhou para ${name}`);
                this.emit('healthCheckFailed', name);
                
                // Tenta reiniciar se autoRestart habilitado
                if (this.config.processManager.autoRestart) {
                    this.handleServerExit(name, -1, 'HEALTH_CHECK_FAILED');
                }
            }
        }

        this.metrics.serversOnline = Object.values(results).filter(v => v).length;
        this.metrics.serversTotal = Object.keys(results).length;
        
        this.emit('healthCheck', results);
        return results;
    }

    async checkServerHealth(serverName) {
        const endpoint = this.config.healthCheck.endpoints.find(e => e.name === serverName.replace('Server', '').toLowerCase());
        if (!endpoint) {
            // Verifica se processo ainda existe
            return this.serverStatus[serverName].running && this.serverStatus[serverName].pid;
        }

        return new Promise((resolve) => {
            const socket = require('net').createConnection(endpoint.port, endpoint.host, () => {
                socket.destroy();
                resolve(true);
            });

            socket.on('error', () => resolve(false));
            socket.setTimeout(this.config.healthCheck.timeout || 5000, () => {
                socket.destroy();
                resolve(false);
            });
        });
    }

    startMetricsCollection() {
        this.metricsInterval = setInterval(() => {
            this.collectMetrics();
        }, 30000); // A cada 30 segundos
    }

    async collectMetrics() {
        try {
            // Coleta métricas dos GameServers via gateway ou conexão direta
            // Por enquanto, usa dados do config
            let totalPlayers = 0;
            for (const gs of this.config.gameServers) {
                totalPlayers += gs.currentUsers || 0;
            }
            this.metrics.totalPlayers = totalPlayers;
            this.metrics.uptime = Date.now() - this.metrics.startTime;

            this.emit('metrics', { ...this.metrics });
        } catch (error) {
            this.logger.error('Erro ao coletar métricas:', error);
        }
    }

    // API pública para controle
    async restartServer(name) {
        this.logger.info(`Reiniciando ${name} manualmente...`);
        await this.stopServer(name);
        await this.sleep(2000);
        
        const serverConfig = this.config.processManager.servers[name];
        if (serverConfig) {
            await this.startServer(name, serverConfig, this.config.processManager.workingDirectory);
        }
    }

    getServerStatus(name) {
        const status = this.serverStatus[name];
        if (!status) return null;

        const server = this.servers.get(name);
        return {
            name,
            running: status.running,
            pid: status.pid,
            restarts: status.restarts,
            lastStart: status.lastStart,
            lastHealthCheck: status.lastHealthCheck,
            uptime: status.lastStart ? Date.now() - status.lastStart : 0,
            memory: server?.process ? this.getProcessMemory(server.pid) : null
        };
    }

    getAllStatus() {
        const result = {};
        for (const name of this.serverStatus.keys()) {
            result[name] = this.getServerStatus(name);
        }
        return result;
    }

    getMetrics() {
        return {
            ...this.metrics,
            servers: this.getAllStatus()
        };
    }

    getProcessMemory(pid) {
        try {
            // Tenta obter uso de memória do processo
            // No Windows, usa tasklist; no Linux, /proc
            return null; // Implementação específica de SO
        } catch {
            return null;
        }
    }

    // Configuração dinâmica
    updateServerConfig(name, config) {
        if (this.config.processManager.servers[name]) {
            this.config.processManager.servers[name] = {
                ...this.config.processManager.servers[name],
                ...config
            };
            this.config.saveConfig();
            this.logger.info(`Configuração de ${name} atualizada`);
        }
    }

    addGameServer(gameServerConfig) {
        const newId = Math.max(...this.config.gameServers.map(s => s.id), 0) + 1;
        const server = { ...gameServerConfig, id: newId };
        this.config.gameServers.push(server);
        this.config.saveConfig();
        this.logger.info(`GameServer adicionado: ${server.name} (ID: ${newId})`);
        return server;
    }

    removeGameServer(serverId) {
        const index = this.config.gameServers.findIndex(s => s.id === serverId);
        if (index !== -1) {
            const removed = this.config.gameServers.splice(index, 1)[0];
            this.config.saveConfig();
            this.logger.info(`GameServer removido: ${removed.name}`);
            return true;
        }
        return false;
    }

    updateGameServerLoad(serverId, currentUsers) {
        this.config.updateGameServerLoad(serverId, currentUsers);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async stop() {
        this.logger.info('Parando MUServerManager...');
        this.running = false;

        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
        }

        await this.stopAllServers();
        this.launcher.cleanup();

        this.logger.info('MUServerManager parado');
        this.emit('stopped');
    }
}

module.exports = MUServerManager;