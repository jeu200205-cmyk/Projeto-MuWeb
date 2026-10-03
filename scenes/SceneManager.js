// scenes/SceneManager.js — Gerenciador de cenas com transição fade.
// Cada cena é uma classe com: mount(container), show(params), hide(), update(dt), dispose().

const FADE_MS = 350;

export default class SceneManager {
  constructor(rootEl) {
    this.root = rootEl || document.body;
    // Só define 'relative' se o elemento estiver em 'static' (position: fixed/absolute do CSS deve ser preservado!)
    const computed = (this.root.ownerDocument && this.root.ownerDocument.defaultView)
      ? this.root.ownerDocument.defaultView.getComputedStyle(this.root).position
      : 'static';
    if (computed === 'static') this.root.style.position = 'relative';
    this.scenes = new Map();      // name -> SceneClass
    this._current = null;         // { name, instance, el }
    this._transitioning = false;
    this._pendingSwitch = null;   // B6-fix v2: troca enfileirada durante transição
    this._fadeEl = this._createFadeOverlay();
    this.onDidSwitch = null;
  }

  _createFadeOverlay() {
    const el = document.createElement('div');
    el.dataset.muFadeOverlay = '1';
    el.style.cssText = `
      position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;
      transition:opacity ${FADE_MS}ms ease;z-index:9999;`;
    this.root.appendChild(el);
    return el;
  }

  register(name, SceneClass) {
    this.scenes.set(name, SceneClass);
    return this;
  }

  async switchTo(name, params = {}, options = {}) {
    if (this._transitioning) {
      // B6-fix v2: NÃO descarta — enfileira (last-wins). Eventos de cena podem
      // disparar dentro da janela de fade (ex.: loginResult ~200ms após submit) e a
      // troca seguinte seria engolida silenciosamente (race real encontrado E2E).
      // DEDUPE: se a troca em ANDAMENTO já vai para a MESMA cena, não re-enfileira
      // (dupla emissão de 'server-selected' remontava a cena login e apagava inputs).
      if (this._switchingTo === name) return;
      this._pendingSwitch = { name, params, options };
      return;
    }
    const SceneClass = this.scenes.get(name);
    if (!SceneClass) throw new Error(`SceneManager: cena não registrada: ${name}`);
    const fadeMs = Number.isFinite(options?.fadeMs) ? Math.max(0, options.fadeMs) : FADE_MS;
    // R41 UI: a superseded R40 transition already owns an opaque fade. Reusing
    // that barrier must not schedule another FADE_MS fade-in before mounting the
    // final scene; under decode pressure that added a blank/old-scene interval.
    const alreadyOpaque = options?._alreadyOpaque === true;

    this._transitioning = true;
    this._switchingTo = name;
    console.info(`[SceneManager] switch START -> ${name}`);
    try {
      if (!alreadyOpaque) await this._fade(1, fadeMs);
      else {
        this._fadeEl.style.transition = 'none';
        this._fadeEl.style.opacity = '1';
        this._fadeEl.style.pointerEvents = 'auto';
      }

      // remove cena atual (dispose ANTES de montar a nova)
      if (this._current) {
        try { await this._current.instance.hide?.(); } catch (e) { console.warn('[SceneManager] hide falhou:', e); }
        try { await this._current.instance.dispose?.(); } catch (e) { console.warn('[SceneManager] dispose falhou:', e); }
        if (this._current.el && this._current.el.parentNode) {
          this._current.el.parentNode.removeChild(this._current.el);
        }
        this._current = null; // sem cena ativa durante a transição
      }

      // monta nova cena — B6-fix: ESPERA mount/show assíncronos
      const host = document.createElement('div');
      host.className = `scene scene-${name}`;
      host.dataset.muSceneHost = name;
      host.style.cssText = 'position:absolute;inset:0;overflow:hidden;z-index:10;background:transparent;';
      this.root.insertBefore(host, this._fadeEl);

      const instance = new SceneClass();
      if (typeof instance.mount === 'function') await instance.mount(host);
      if (typeof instance.show === 'function') await instance.show(params);

      // R40 UI: a newer scene request may arrive while the authored owners of this
      // scene are still decoding. The old flow published/faded-in this now-obsolete
      // scene and only then consumed _pendingSwitch, producing a visible one-frame
      // (or much longer under decode pressure) flash and delayed final first paint.
      // Keep the fade opaque, retire the superseded instance immediately, and let
      // finally consume the last-wins request. No asset/protocol contract changes.
      if (this._pendingSwitch && this._pendingSwitch.name !== name) {
        try { await instance.hide?.(); } catch (e) { console.warn('[SceneManager] superseded hide falhou:', e); }
        try { await instance.dispose?.(); } catch (e) { console.warn('[SceneManager] superseded dispose falhou:', e); }
        if (host.parentNode) host.parentNode.removeChild(host);
        console.info(`[SceneManager] switch SUPERSEDED before publish -> ${name}; pending=${this._pendingSwitch.name}`);
        return;
      }

      // _current só após mount+show completarem (eventos podem ser hookados)
      this._current = { name, instance, el: host };
      await this._fade(0, fadeMs);
      try { this.onDidSwitch?.(name, instance); } catch (e) { console.warn('[SceneManager] onDidSwitch falhou:', e); }
      console.info(`[SceneManager] switch PASS -> ${name} | fade=${this._fadeEl.style.opacity}`);
    } catch (err) {
      // Falha durante mount/show não pode deixar o overlay preto preso em 9999.
      console.error(`[SceneManager] switch FAIL -> ${name}:`, err);
      try { await this._fade(0, fadeMs); } catch (fadeErr) { console.error('[SceneManager] falha ao limpar fade:', fadeErr); }
      throw err;
    } finally {
      this._transitioning = false;
      this._switchingTo = null;
      // R41 UI: consume last-wins before fail-opening the overlay. R40 retired a
      // superseded scene before publish, but finally immediately exposed opacity=0
      // and then the pending switch waited another fade-in. That contradicted the
      // opaque handoff contract and could expose an empty/previous frame. Preserve
      // the existing opaque barrier and tell the pending switch to mount directly.
      const pending = this._pendingSwitch;
      this._pendingSwitch = null;
      const handoff = pending && pending.name !== this._current?.name;
      if (this._fadeEl) {
        if (handoff) {
          this._fadeEl.style.transition = 'none';
          this._fadeEl.style.opacity = '1';
          this._fadeEl.style.pointerEvents = 'auto';
        } else {
          this._fadeEl.style.opacity = '0';
          this._fadeEl.style.pointerEvents = 'none';
        }
      }
      if (handoff) {
        this.switchTo(pending.name, pending.params, { ...(pending.options || {}), _alreadyOpaque: true }).catch((e) =>
          console.error(`[SceneManager] pending switch FAIL -> ${pending.name}:`, e));
      }
    }
  }

  _fade(target, duration = FADE_MS) {
    const ms = Math.max(0, Number(duration) || 0);
    this._fadeEl.style.transition = ms > 0 ? `opacity ${ms}ms ease` : 'none';
    this._fadeEl.style.pointerEvents = target ? 'auto' : 'none';
    this._fadeEl.style.opacity = String(target);
    // R15: Loading→World já tem a tela de loading cobrindo o frame e o PC não
    // adiciona um fade web artificial. duration=0 deve ser síncrono; em frame
    // pesado, setTimeout(350) do R14 chegou a resolver 12,5s depois por starvation.
    if (ms === 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  get current() { return this._current ? this._current.instance : null; }
  get currentScene() { return this._current ? this._current.instance : null; }
  get currentName() { return this._current ? this._current.name : null; }

  update(dt) {
    if (this._current && typeof this._current.instance.update === 'function') {
      this._current.instance.update(dt);
    }
  }
}
