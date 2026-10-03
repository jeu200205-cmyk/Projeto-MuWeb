// audio/SoundBoard.js — adapters para owners de som REAIS do cliente PC.
// Missing samples are fail-closed. Nenhum beep/oscillator/procedural é
// utilizado como substituto de produção para um wav ainda não portado.

import { Sound } from './SoundManager.js';

function playIfLoaded(id, options) {
    if (!Sound.buffers?.has(id)) return null;
    return Sound.play(id, options);
}

// PC ZzzCharacter.cpp/CGFxMainUi.cpp: SOUND_HEART -> pHeartBeat.wav.
export function playHpLow() { return playIfLoaded('sfx-heart'); }

let hpLowTimer = null;
export function startHpLowLoop(getHpRatio, threshold = 0.3, intervalMs = 2000) {
    stopHpLowLoop();
    hpLowTimer = setInterval(() => {
        let ratio = 1;
        try { ratio = getHpRatio?.() ?? 1; } catch { return; }
        if (ratio > 0 && ratio < threshold) playHpLow();
    }, intervalMs);
    return hpLowTimer;
}
export function stopHpLowLoop() {
    if (hpLowTimer) { clearInterval(hpLowTimer); hpLowTimer = null; }
}

// PC WSclient.cpp ReceiveLevelUp: SOUND_LEVEL_UP -> pLevelUp.wav.
export function playLevelUp() { return playIfLoaded('sfx-levelup'); }
export function playQuestComplete() { return null; }
export function playDead() { return null; }
export function playPetAttack() { return null; }
