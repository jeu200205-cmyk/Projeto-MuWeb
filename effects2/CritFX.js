// effects2/CritFX.js — Acerto crítico FIEL ao cliente PC (Main 5.2).
//
// Autoridade PC:
//   WSclient.cpp:3153-3249 (ReceiveAttackDamage → damage numbers):
//     float scale = 15.f;                    // dano normal
//     case 3: // DT_CRITICAL
//         scale = 50.f;                      // 3.33× o tamanho normal
//         Vector(0.f, 0.6f, 1.f, Light);     // azul-ciano (r=0, g=0.6, b=1)
//     CreatePoint(o->Position, Damage, Light, scale);  // ÚNICO número
//   ZzzEffectPoint.cpp:22-43 CreatePoint:
//     Position[2] += 140 (nasce ~140 acima do chão do alvo),
//     Gravity = 10, Scale = scale, MovePoints: Position[2] += Gravity por
//     frame (sobe e desacelera), Gravity -= 0.3/frame, morre quando
//     Gravity <= 0; Scale -= 5/frame até mínimo 15.
//   PC NÃO tem: flash de tela, texto "CRITICAL!" em DOM, burst de
//   partículas por crítico. O crítico é APENAS o número maior e azulado.
//   (SOUND_CRITICAL = sDarkCritical.wav toca só no buff AddCriticalDamage
//    do Dark Lord — ZzzCharacter.cpp:4266 — não por hit crit comum.)
//
// Porte: o FloatingText do web já projeta mundo→tela como o RenderNumber
// do PC. Aqui só fixamos cor/tamanho/velocidade segundo a autoridade.
export function playCrit(position, floatingText, damage, _opts = {}) {
    if (!floatingText || typeof floatingText.show !== 'function') return;

    // DT_CRITICAL (WSclient.cpp:3188-3189): scale 50 vs 15 normal.
    // FloatingText normal usa size 14px → crit = 14 * (50/15) ≈ 47px.
    const size = Math.round(14 * (50 / 15));
    // Vector(0.f, 0.6f, 1.f) → #00 99 FF
    const color = '#0099ff';

    // ZzzEffectPoint.cpp:32: nasce 140 unidades acima do alvo (mundo MU —
    // o web usa as MESMAS unidades, TERRAIN_SCALE=100).
    const pos = position.clone();
    pos.y += 140;

    // show() retorna o elemento: a cor vem de TEXT_STYLES, então aplicamos
    // a cor DT_CRITICAL direto no el (sem mutar o contrato do FloatingText).
    const el = floatingText.show(pos, String(Math.round(damage || 0)), 'damage', {
        size,
        life: 1.3,          // Gravity 10→0 a −0.3/frame = 33 frames ≈ 1.3s @25fps
        riseSpeed: 1.2,     // sobe projetado (FloatText é linear; PC desacelera)
    });
    if (el && el.style) el.style.color = color;
}
