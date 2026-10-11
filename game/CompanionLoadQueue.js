// FIX154: bounded physical BMD companion preparation after player publication.
// No fabricated meshes: callers provide the real Pet/Helper/Mount factory.
export class CompanionLoadQueue {
    constructor({concurrency=2, yieldFrame=null}={}) {
        this.concurrency=Math.max(1,Math.min(4,Number(concurrency)||2));
        this.yieldFrame=yieldFrame || (()=>new Promise(resolve=>{
            if(typeof requestAnimationFrame==='function') requestAnimationFrame(()=>resolve());
            else setTimeout(resolve,0);
        }));
        this.queued=[];this.active=0;
        this.stats={finished:0,failed:0,skipped:0};
    }
    schedule(load,valid=()=>true) {
        return new Promise(resolve=>{
            this.queued.push({load,valid,resolve});
            this._pump();
        });
    }
    _pump() {
        while(this.active<this.concurrency && this.queued.length){
            const item=this.queued.shift(); this.active++;
            Promise.resolve().then(()=>this.yieldFrame()).then(async()=>{
                if(!item.valid()){this.stats.skipped++;return null;}
                try {
                    const value=await item.load();
                    if(!item.valid()) {value?.dispose?.();this.stats.skipped++;return null;}
                    this.stats.finished++;
                    return value;
                } catch(e) {this.stats.failed++;throw e;}
            }).then(item.resolve,err=>{console.warn('[Viewport companion] BMD fail-closed:',err?.message||err);item.resolve(null);})
             .finally(()=>{this.active--;this._pump();});
        }
    }
    snapshot(){return {queued:this.queued.length,active:this.active,...this.stats};}
}
export const remoteCompanionQueue=new CompanionLoadQueue();
