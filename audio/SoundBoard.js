// audio/SoundBoard.js — adapters para owners de som REAIS do cliente PC.
// R16: missing sample is fail-closed. Nenhum beep/oscillator/procedural é
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

// Nenhum owner PC exato de "quest complete" foi provado nesta lane.
export function playQuestComplete() { return null; }

// Owner de morte depende da classe/sexo/estado. Não fabricar um stinger genérico.
export function playDead() { return null; }

// Pet possui owners/action collectors específicos; não fabricar woosh genérico.
export function playPetAttack() { return null; }
