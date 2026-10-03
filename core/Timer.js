/**
 * Timer.js - Port de Time/Timer.cpp e CTimCheck
 * Gerencia tempo de jogo, delta time e FPS
 */
export class Timer {
    constructor() {
        this._startTime = performance.now();
        this._lastTime = this._startTime;
        this._deltaTime = 0;
        this._fps = 0;
        this._frameCount = 0;
        this._fpsTime = 0;
        this._timeScale = 1.0;
        this._paused = false;
    }

    /**
     * Atualiza o timer - chamar a cada frame
     */
    update() {
        const now = performance.now();
        let rawDelta = (now - this._lastTime) / 1000.0;

        // R15.6 TIMING: não limitar frames fisicamente lentos a 100 ms.
        // Com renderSubmit ~131-152 ms (e piores frames >300 ms), o clamp antigo
        // fazia movimento/animação/sistemas avançarem só 0.1 s por frame e o jogo
        // ficava artificialmente lento justamente quando o FPS caía. Preservamos
        // o delta real durante carga normal; somente uma suspensão longa (aba em
        // background/debugger >1 s) usa 100 ms de recuperação para evitar teleporte.
        const suspended = rawDelta > 1.0;
        const gameDelta = suspended ? 0.1 : Math.max(0, rawDelta);

        this._deltaTime = this._paused ? 0 : gameDelta * this._timeScale;
        this._lastTime = now;

        // Calcular FPS
        this._frameCount++;
        // FPS deve usar tempo de parede, inclusive frame lento; não gameDelta.
        this._fpsTime += Math.max(0, rawDelta);
        if (this._fpsTime >= 0.5) {
            this._fps = Math.round(this._frameCount / this._fpsTime);
            this._frameCount = 0;
            this._fpsTime = 0;
        }
    }

    get deltaTime() { return this._deltaTime; }
    get fps() { return this._fps; }
    get elapsed() { return (performance.now() - this._startTime) / 1000.0; }
    get timeScale() { return this._timeScale; }

    setTimeScale(scale) { this._timeScale = Math.max(0, scale); }
    pause() { this._paused = true; }
    resume() { this._paused = false; }
    get paused() { return this._paused; }
}

/**
 * CTimCheck - Port de Time/CTimCheck.cpp
 * Verificador de intervalos de tempo
 */
export class TimCheck {
    constructor(intervalMs = 1000) {
        this._interval = intervalMs;
        this._lastTick = performance.now();
    }

    /**
     * Verifica se o intervalo passou
     * @returns {boolean}
     */
    check() {
        const now = performance.now();
        if (now - this._lastTick >= this._interval) {
            this._lastTick = now;
            return true;
        }
        return false;
    }

    get remaining() {
        const elapsed = performance.now() - this._lastTick;
        return Math.max(0, this._interval - elapsed);
    }

    reset() { this._lastTick = performance.now(); }
    setInterval(ms) { this._interval = ms; }
}

// Instância global do timer (como o original usa globais)
export const GameTimer = new Timer();
