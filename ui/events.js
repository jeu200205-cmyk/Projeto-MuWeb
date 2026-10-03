// ui/events.js — Simple EventTarget polyfill and utilities
// For environments where EventTarget is not available or needs extension

export class EventEmitter {
    constructor() {
        this._events = new Map();
    }
    
    on(event, listener) {
        if (!this._events.has(event)) this._events.set(event, new Set());
        this._events.get(event).add(listener);
        return this;
    }
    
    off(event, listener) {
        if (this._events.has(event)) {
            this._events.get(event).delete(listener);
        }
        return this;
    }
    
    once(event, listener) {
        const onceWrapper = (...args) => {
            this.off(event, onceWrapper);
            listener(...args);
        };
        return this.on(event, onceWrapper);
    }
    
    emit(event, ...args) {
        if (this._events.has(event)) {
            this._events.get(event).forEach(listener => {
                try { listener(...args); } catch (e) { console.error(e); }
            });
        }
        return this;
    }
    
    removeAllListeners(event) {
        if (event) this._events.delete(event);
        else this._events.clear();
        return this;
    }
    
    listenerCount(event) {
        return this._events.has(event) ? this._events.get(event).size : 0;
    }
}

// Extend EventTarget with emitter methods if needed
export function makeEventTarget(obj) {
    const emitter = new EventEmitter();
    obj.on = emitter.on.bind(emitter);
    obj.off = emitter.off.bind(emitter);
    obj.once = emitter.once.bind(emitter);
    obj.emit = emitter.emit.bind(emitter);
    obj.removeAllListeners = emitter.removeAllListeners.bind(emitter);
    return obj;
}

// CustomEvent polyfill for older environments
if (typeof window !== 'undefined' && !window.CustomEvent) {
    window.CustomEvent = function(event, params) {
        params = params || { bubbles: false, cancelable: false, detail: undefined };
        const evt = document.createEvent('CustomEvent');
        evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
        return evt;
    };
    window.CustomEvent.prototype = window.Event.prototype;
}

// Export native EventTarget if available
export { EventTarget } from 'events';