import { GameTimer } from './Timer.js';
import { Input } from './Input.js';
import { GameScene } from '../graphics/Scene.js';
import { EffectManager } from '../graphics/Effects.js';
import { Sound } from '../audio/SoundManager.js';
import { Net } from '../net/WSClient.js';
import { Saves, Assets } from '../data/LoadData.js';
import { ChatSystem } from './ChatSystem.js';

/**
 * Game.js - Port de Winmain.cpp / ZzzScene.cpp
 * Classe principal do jogo - loop, estados, integração dos sistemas
 */
export class Game {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.state = 'loading'; // loading, menu, playing
        this.paused = false;

        // Carrega configurações salvas
        this.settings = Saves.load('settings', {
            volume: 0.8,
            muted: false,
            resolution: 'auto'
        });
    }

    async init() {
        this._setStatus('Inicializando renderizador...');

        // Engine 3D
        this.scene = new GameScene(this.container);
        this.effects = new EffectManager(this.scene.scene);

        // Input
        Input.init(window);

        // Chat
        this.chat = new ChatSystem();

        // Configura som
        Sound.setVolume(this.settings.volume);
        Sound.setMuted(this.settings.muted);

        // Desbloquear áudio no primeiro clique (política do browser)
        const unlock = () => {
            Sound.init();
            Sound.uiSuccess();
            window.removeEventListener('click', unlock);
        };
        window.addEventListener('click', unlock);

        // Eventos de jogo
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Escape') this._onEscape();
        });

        // Clique no chão = efeito mágico
        window.addEventListener('click', (e) => {
            if (e.target.tagName === 'CANVAS') {
                this.effects.createMagicEffect(this.scene.mainObject.position, 0x66ccff);
                Sound.playBeep(520, 0.15, 'triangle', 0.2);
            }
        });

        // Tecla M = mudo
        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyM') {
                Sound.setMuted(!Sound.muted);
                this.settings.muted = Sound.muted;
                this._saveSettings();
                this.chat._addSystem(Sound.muted ? 'Som: desligado' : 'Som: ligado');
            }
        });

        this._setStatus('Pronto!');
        this._buildHUD();
        this.state = 'playing';

        // Loop principal
        this._loop = this._loop.bind(this);
        requestAnimationFrame(this._loop);
    }

    _loop() {
        GameTimer.update();
        const dt = GameTimer.deltaTime;
        const elapsed = GameTimer.elapsed;

        if (!this.paused && this.state === 'playing') {
            this.scene.update(dt, elapsed);
            this.effects.update(dt);
        }

        this.scene.render();
        this._updateHUD();

        Input.update(); // limpar estados de input

        requestAnimationFrame(this._loop);
    }

    _buildHUD() {
        this.hud = document.createElement('div');
        this.hud.style.cssText = `
            position: fixed;
            top: 15px;
            right: 15px;
            background: rgba(0,0,0,0.65);
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 8px;
            padding: 12px 16px;
            color: #e8e8e8;
            font-family: Consolas, monospace;
            font-size: 12px;
            z-index: 999;
            min-width: 150px;
            backdrop-filter: blur(4px);
        `;
        document.body.appendChild(this.hud);
    }

    _updateHUD() {
        if (!this.hud) return;
        const vibrate = Sound.muted ? '🔇' : '🔊';
        this.hud.innerHTML = `
            <div style="margin-bottom:4px; color:#ff6b35; font-weight:bold;">⚡ STATUS</div>
            <div>FPS: ${GameTimer.fps}</div>
            <div>Som: ${vibrate} ${(Sound.volume * 100) | 0}%</div>
            <div>Rede: ${Net.connected ? '<span style="color:#7f7">online</span>' : '<span style="color:#888">offline</span>'}</div>
            <div style="margin-top:6px; color:#888; font-size:10px;">
                Botão direito: girar câmera<br>
                Rodinha: zoom | M: mudo
            </div>
        `;
    }

    _onEscape() {
        this.chat._addSystem('Tecla ESC pressionada');
    }

    _setStatus(text) {
        const el = document.getElementById('statusText');
        if (el) el.textContent = text;
    }

    _saveSettings() {
        Saves.save('settings', this.settings);
    }
}
