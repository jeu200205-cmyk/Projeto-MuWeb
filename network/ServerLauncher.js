/**
 * ServerLauncher.js - Inicializador dos Servidores MU Reais
 * 
 * Responsável por:
 * - Iniciar ConnectServer.exe, GameServer.exe, JoinServer.exe, DataServer.exe
 * - Monitoramento de processos
 * - Restart automático
 * - Logs centralizados
 * - Health checks de processo
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('./utils/logger');

class ServerLauncher {
    constructor(config = {}) {
        this.config = config;
        this.logger = createLogger('ServerLauncher');
        this.processes = new Map(); // name -> { process, pid, startTime, config }
        this.monitors = new Map(); // name -> intervalId
    }

    /**
     * Inicia um executável do servidor MU
     * @param {string} executable - Nome do executável (ex: 'ConnectServer.exe')
     * @param {Object} options - Opções de inicialização
     * @returns {Promise<Object>} - { process, pid }
     */
    async launch(executable, options = {}) {
        const {
            cwd = process.cwd(),
            args = [],
            env = {},
            detached = true,
            windowsHide = false
        } = options;

        const fullPath = path.join(cwd, executable);
        
        // Verifica se executável existe
        if (!fs.existsSync(fullPath)) {
            // Tenta encontrar em subdiretórios comuns
            const foundPath = this.findExecutable(executable, cwd);
            if (!foundPath) {
                throw new Error(`Executável não encontrado: ${executable} em ${cwd}`);
            }
        }

        this.logger.info(`Iniciando ${executable} em ${cwd}`);
        this.logger.debug(`Argumentos: ${args.join(' ')}`);

        return new Promise((resolve, reject) => {
            const childProcess = spawn(executable, args, {
                cwd,
                env: { ...process.env, ...env },
                detached,
                windowsHide,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            childProcess.on('spawn', () => {
                this.logger.info(`${executable} spawnado com PID ${childProcess.pid}`);
            });

            childProcess.on('error', (error) => {
                this.logger.error(`Erro ao spawnar ${executable}:`, error);
                reject(error);
            });

            // Aguarda um pouco para confirmar que processo iniciou
            setTimeout(() => {
                if (childProcess.killed || childProcess.exitCode !== null) {
                    reject(new Error(`Processo ${executable} terminou imediatamente`));
                } else {
                    this.processes.set(executable, {
                        process: childProcess,
                        pid: childProcess.pid,
                        startTime: Date.now(),
                        config: options,
                        executable
                    });
                    resolve({ process: childProcess, pid: childProcess.pid });
                }
            }, 1000);
        });
    }

    /**
     * Procura executável em subdiretórios comuns
     */
    findExecutable(executable, baseDir) {
        const searchDirs = [
            baseDir,
            path.join(baseDir, 'ConnectServer'),
            path.join(baseDir, 'GameServer'),
            path.join(baseDir, 'JoinServer'),
            path.join(baseDir, 'DataServer'),
            path.join(baseDir, 'Release'),
            path.join(baseDir, 'Debug'),
            path.join(baseDir, 'x64', 'Release'),
            path.join(baseDir, 'x64', 'Debug')
        ];

        for (const dir of searchDirs) {
            const fullPath = path.join(dir, executable);
            if (fs.existsSync(fullPath)) {
                this.logger.info(`Executável encontrado em: ${fullPath}`);
                return fullPath;
            }
        }

        return null;
    }

    /**
     * Verifica se um processo está rodando
     */
    isRunning(name) {
        const procInfo = this.processes.get(name);
        if (!procInfo) return false;
        
        try {
            process.kill(procInfo.pid, 0); // Signal 0 apenas verifica existência
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Obtém informações de um processo
     */
    getProcessInfo(name) {
        const procInfo = this.processes.get(name);
        if (!procInfo) return null;

        return {
            name: procInfo.executable,
            pid: procInfo.pid,
            running: this.isRunning(name),
            uptime: Date.now() - procInfo.startTime,
            startTime: procInfo.startTime
        };
    }

    /**
     * Obtém todos os processos gerenciados
     */
    getAllProcesses() {
        const result = {};
        for (const [name] of this.processes) {
            result[name] = this.getProcessInfo(name);
        }
        return result;
    }

    /**
     * Para um processo graciosamente
     */
    async stop(name, force = false, timeout = 10000) {
        const procInfo = this.processes.get(name);
        if (!procInfo) {
            this.logger.warn(`Processo ${name} não encontrado`);
            return false;
        }

        this.logger.info(`Parando ${name} (PID: ${procInfo.pid})...`);

        return new Promise((resolve) => {
            const childProcess = procInfo.process;
            
            const onExit = (code, signal) => {
                this.logger.info(`${name} finalizado - Code: ${code}, Signal: ${signal}`);
                this.cleanupProcess(name);
                resolve(true);
            };

            childProcess.once('exit', onExit);

            if (force) {
                childProcess.kill('SIGKILL');
            } else {
                childProcess.kill('SIGTERM');
            }

            // Timeout para force kill
            setTimeout(() => {
                if (!childProcess.killed) {
                    this.logger.warn(`Force killing ${name} após timeout`);
                    childProcess.kill('SIGKILL');
                }
            }, timeout);
        });
    }

    /**
     * Reinicia um processo
     */
    async restart(name) {
        const procInfo = this.processes.get(name);
        if (!procInfo) {
            throw new Error(`Processo ${name} não está sendo gerenciado`);
        }

        const config = procInfo.config;
        await this.stop(name);
        await this.sleep(2000);
        return this.launch(procInfo.executable, config);
    }

    /**
     * Inicia monitoramento de saúde do processo
     */
    startHealthMonitor(name, interval = 30000, onUnhealthy) {
        if (this.monitors.has(name)) {
            this.stopHealthMonitor(name);
        }

        const monitorId = setInterval(async () => {
            const running = this.isRunning(name);
            if (!running) {
                this.logger.warn(`Health check falhou para ${name}`);
                if (onUnhealthy) {
                    await onUnhealthy(name);
                }
            }
        }, interval);

        this.monitors.set(name, monitorId);
        this.logger.debug(`Health monitor iniciado para ${name} (intervalo: ${interval}ms)`);
    }

    /**
     * Para monitoramento de saúde
     */
    stopHealthMonitor(name) {
        const monitorId = this.monitors.get(name);
        if (monitorId) {
            clearInterval(monitorId);
            this.monitors.delete(name);
            this.logger.debug(`Health monitor parado para ${name}`);
        }
    }

    /**
     * Cleanup de um processo específico
     */
    cleanupProcess(name) {
        this.processes.delete(name);
        this.stopHealthMonitor(name);
    }

    /**
     * Cleanup de todos os processos
     */
    cleanup() {
        this.logger.info('Limpando todos os processos...');
        
        for (const name of this.processes.keys()) {
            this.stopHealthMonitor(name);
        }

        // Para todos os processos
        const stopPromises = [];
        for (const [name, procInfo] of this.processes) {
            stopPromises.push(this.stop(name, true, 5000));
        }

        return Promise.all(stopPromises).then(() => {
            this.processes.clear();
            this.logger.info('Todos os processos limpos');
        });
    }

    /**
     * Obtém uso de CPU/Memória do processo (Windows)
     */
    async getProcessStats(pid) {
        return new Promise((resolve) => {
            const cmd = process.platform === 'win32' 
                ? `wmic process where "ProcessId=${pid}" get WorkingSetSize,PageFileUsage,PercentProcessorTime /format:csv`
                : `ps -p ${pid} -o pid,pcpu,pmem,etime,comm`;

            const { exec } = require('child_process');
            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    resolve(null);
                    return;
                }

                try {
                    if (process.platform === 'win32') {
                        // Parse WMIC output
                        const lines = stdout.trim().split('\n');
                        if (lines.length >= 2) {
                            const headers = lines[0].split(',');
                            const values = lines[1].split(',');
                            const stats = {};
                            headers.forEach((h, i) => {
                                stats[h.trim()] = values[i]?.trim();
                            });
                            resolve({
                                memoryMB: parseInt(stats.WorkingSetSize) / 1024 / 1024,
                                pageFileMB: parseInt(stats.PageFileUsage) / 1024 / 1024,
                                cpuPercent: parseFloat(stats.PercentProcessorTime) || 0
                            });
                        }
                    } else {
                        // Parse ps output
                        const lines = stdout.trim().split('\n');
                        if (lines.length >= 2) {
                            const parts = lines[1].trim().split(/\s+/);
                            resolve({
                                cpuPercent: parseFloat(parts[1]) || 0,
                                memoryPercent: parseFloat(parts[2]) || 0,
                                elapsed: parts[3],
                                command: parts[4]
                            });
                        }
                    }
                } catch (e) {
                    resolve(null);
                }
            });
        });
    }

    /**
     * Mata processo por PID (fallback)
     */
    static killByPid(pid, signal = 'SIGTERM') {
        try {
            process.kill(pid, signal);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Mata processo por nome (Windows)
     */
    static killByName(name) {
        return new Promise((resolve) => {
            const cmd = process.platform === 'win32'
                ? `taskkill /F /IM "${name}"`
                : `pkill -f "${name}"`;

            const { exec } = require('child_process');
            exec(cmd, (error, stdout, stderr) => {
                resolve(!error);
            });
        });
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = ServerLauncher;