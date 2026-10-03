/**
 * Pathfinding.js - A* simples em grid de tiles
 * Para navegação futura de monstros/jogador no tile grid do mapa
 */

class MinHeap {
    constructor() { this.items = []; }
    get size() { return this.items.length; }
    push(node) {
        this.items.push(node);
        let i = this.items.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this.items[p].f <= this.items[i].f) break;
            [this.items[p], this.items[i]] = [this.items[i], this.items[p]];
            i = p;
        }
    }
    pop() {
        if (this.items.length === 1) return this.items.pop();
        const top = this.items[0];
        this.items[0] = this.items.pop();
        let i = 0;
        for (;;) {
            const l = i * 2 + 1, r = l + 1;
            let smallest = i;
            if (l < this.items.length && this.items[l].f < this.items[smallest].f) smallest = l;
            if (r < this.items.length && this.items[r].f < this.items[smallest].f) smallest = r;
            if (smallest === i) break;
            [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
            i = smallest;
        }
        return top;
    }
}

export class PathGrid {
    /**
     * @param {number} width  - tiles em X
     * @param {number} height - tiles em Z
     * @param {number} tileSize - tamanho do tile em unidades do mundo
     */
    constructor(width, height, tileSize = 10) {
        this.width = width;
        this.height = height;
        this.tileSize = tileSize;
        // 0 = livre, >0 = bloqueado
        this.costs = new Uint8Array(width * height);
    }

    setBlocked(x, y, blocked = true) {
        if (this.isValid(x, y)) this.costs[y * this.width + x] = blocked ? 1 : 0;
    }

    isBlocked(x, y) {
        if (!this.isValid(x, y)) return true;
        return this.costs[y * this.width + x] > 0;
    }

    isValid(x, y) {
        return x >= 0 && y >= 0 && x < this.width && y < this.height;
    }

    /** Converte posição do mundo para tile */
    worldToTile(wx, wz, originX = 0, originZ = 0) {
        return {
            x: Math.floor((wx - originX) / this.tileSize),
            y: Math.floor((wz - originZ) / this.tileSize)
        };
    }

    /** Converte tile para centro em coordenadas do mundo */
    tileToWorld(tx, ty, originX = 0, originZ = 0) {
        return {
            x: originX + (tx + 0.5) * this.tileSize,
            z: originZ + (ty + 0.5) * this.tileSize
        };
    }

    _heuristic(ax, ay, bx, by) {
        // Octile para movimento diagonal
        const dx = Math.abs(ax - bx);
        const dy = Math.abs(ay - by);
        return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy);
    }

    /**
     * A* pathfinding.
     * @returns {Array<{x,y}>} lista de tiles do início ao fim, ou null se sem caminho
     */
    findPath(sx, sy, ex, ey, { allowDiagonal = true, maxIterations = 50000 } = {}) {
        if (!this.isValid(sx, sy) || !this.isValid(ex, ey)) return null;
        if (this.isBlocked(ex, ey)) return null;
        if (sx === ex && sy === ey) return [{ x: sx, y: sy }];

        const w = this.width;
        const gScore = new Float32Array(w * this.height).fill(Infinity);
        const cameFrom = new Int32Array(w * this.height).fill(-1);
        const closed = new Uint8Array(w * this.height);

        const open = new MinHeap();
        const startIdx = sy * w + sx;
        gScore[startIdx] = 0;
        open.push({ x: sx, y: sy, f: this._heuristic(sx, sy, ex, ey) });

        const dirs = allowDiagonal
            ? [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
               [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]]
            : [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1]];

        let iterations = 0;
        while (open.size > 0) {
            if (++iterations > maxIterations) return null;

            const current = open.pop();
            const cIdx = current.y * w + current.x;
            if (closed[cIdx]) continue;
            closed[cIdx] = 1;

            if (current.x === ex && current.y === ey) {
                // Reconstrói caminho
                const path = [];
                let idx = cIdx;
                while (idx !== -1) {
                    path.push({ x: idx % w, y: Math.floor(idx / w) });
                    idx = cameFrom[idx];
                }
                return path.reverse();
            }

            for (const [dx, dy, cost] of dirs) {
                const nx = current.x + dx;
                const ny = current.y + dy;
                if (!this.isValid(nx, ny) || this.isBlocked(nx, ny)) continue;

                // Impede corte de quina em diagonal
                if (dx !== 0 && dy !== 0 &&
                    (this.isBlocked(current.x + dx, current.y) ||
                     this.isBlocked(current.x, current.y + dy))) continue;

                const nIdx = ny * w + nx;
                if (closed[nIdx]) continue;

                const tentative = gScore[cIdx] + cost;
                if (tentative < gScore[nIdx]) {
                    gScore[nIdx] = tentative;
                    cameFrom[nIdx] = cIdx;
                    open.push({ x: nx, y: ny, f: tentative + this._heuristic(nx, ny, ex, ey) });
                }
            }
        }
        return null;
    }

    /**
     * Caminho em coordenadas de mundo (conveniência).
     * @returns {Array<{x,z}>} ou null
     */
    findWorldPath(startWorld, endWorld, originX = 0, originZ = 0, opts = {}) {
        const s = this.worldToTile(startWorld.x, startWorld.z, originX, originZ);
        const e = this.worldToTile(endWorld.x, endWorld.z, originX, originZ);
        const tiles = this.findPath(s.x, s.y, e.x, e.y, opts);
        if (!tiles) return null;
        return tiles.map(t => this.tileToWorld(t.x, t.y, originX, originZ));
    }

    /** Suaviza o caminho com line-of-sight simples (string-pulling básico) */
    smoothPath(path) {
        if (!path || path.length <= 2) return path;
        const result = [path[0]];
        let anchor = 0;
        for (let i = 2; i < path.length; i++) {
            if (!this._lineOfSight(path[anchor], path[i])) {
                result.push(path[i - 1]);
                anchor = i - 1;
            }
        }
        result.push(path[path.length - 1]);
        return result;
    }

    _lineOfSight(a, b) {
        // Bresenham
        let x0 = a.x, y0 = a.y;
        const x1 = b.x, y1 = b.y;
        const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        for (;;) {
            if (this.isBlocked(x0, y0)) return false;
            if (x0 === x1 && y0 === y1) return true;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
    }
}

export default PathGrid;
