// FIX154: generational, idempotent BMD companion publication. No model/scene
// dependency: every lane uses an authoritative model supplied by the caller.
const RETRY_MISSING_MS = 30_000;
export class StableCompanionLane {
    constructor(active, name, clock = () => Date.now()) {
        this.active = active;
        this.name = name;
        this.clock = clock;
        this.pending = new WeakMap();
        this.epoch = new WeakMap();
        this.failed = new WeakMap();
        this.stats = { reused: 0, deduped: 0, built: 0, failed: 0, suppressed: 0, superseded: 0 };
    }
    async ensure(owner, signature, factory) {
        if (!owner || !signature) return null;
        const current = this.active.get(owner);
        if (current?.renderer && current.__muModelSignature === signature) {
            this.stats.reused++;
            return current;
        }
        const running = this.pending.get(owner);
        if (running?.signature === signature) {
            this.stats.deduped++;
            return running.promise;
        }
        const fail = this.failed.get(owner);
        if (fail?.signature === signature && fail.until > this.clock()) {
            this.stats.suppressed++;
            return null;
        }
        const epoch = (this.epoch.get(owner) || 0) + 1;
        this.epoch.set(owner, epoch);
        // Never tear down the old valid GPU graph before the replacement BMD
        // and all its physical textures have successfully loaded.
        const promise = (async () => {
            let next = null;
            try {
                next = factory();
                await next.init();
                if (this.epoch.get(owner) !== epoch) {
                    next.dispose?.(); this.stats.superseded++; return null;
                }
                const previous = this.active.get(owner);
                next.__muModelSignature = signature;
                this.active.set(owner, next);
                if (previous && previous !== next) previous.dispose?.();
                this.failed.delete(owner);
                this.stats.built++;
                return next;
            } catch (error) {
                next?.dispose?.();
                if (this.epoch.get(owner) === epoch) {
                    this.failed.set(owner, { signature, until: this.clock() + RETRY_MISSING_MS });
                    this.stats.failed++;
                    console.warn(`[PetSystem] ${this.name} BMD real indisponível (${signature}):`, error?.message || error);
                }
                return null;
            } finally {
                if (this.pending.get(owner)?.epoch === epoch) this.pending.delete(owner);
            }
        })();
        this.pending.set(owner, { signature, epoch, promise });
        return promise;
    }
    dismiss(owner) {
        if (!owner) return;
        this.epoch.set(owner, (this.epoch.get(owner) || 0) + 1);
        this.pending.delete(owner);
        this.failed.delete(owner);
        const previous = this.active.get(owner);
        if (previous) { this.active.delete(owner); previous.dispose?.(); }
    }
    snapshot() { return {name:this.name, active:this.active.size, ...this.stats}; }
}
