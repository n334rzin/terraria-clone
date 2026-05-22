/**
 * ParticleSystem — Lightweight particle effects for block breaking, hits, etc.
 * Object-pool based for zero GC pressure.
 */

const PARTICLE_POOL_SIZE = 200;

class Particle {
    constructor() {
        this.active = false;
        this.x = 0; this.y = 0;
        this.vx = 0; this.vy = 0;
        this.life = 0; this.maxLife = 0;
        this.size = 3;
        this.color = '#fff';
        this.gravity = 600;
    }

    init(x, y, vx, vy, life, size, color, gravity) {
        this.active = true;
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.life = life; this.maxLife = life;
        this.size = size;
        this.color = color;
        this.gravity = gravity !== undefined ? gravity : 600;
    }

    update(dt) {
        if (!this.active) return;
        this.vy += this.gravity * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        if (this.life <= 0) this.active = false;
    }

    draw(ctx, camera) {
        if (!this.active) return;
        const { sx, sy } = camera.worldToScreen(this.x, this.y);
        const alpha = Math.max(0, this.life / this.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.fillRect(Math.round(sx), Math.round(sy), this.size, this.size);
        ctx.globalAlpha = 1;
    }
}

class ParticleSystem {
    constructor() {
        this.pool = [];
        for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
            this.pool.push(new Particle());
        }
    }

    _getParticle() {
        for (const p of this.pool) {
            if (!p.active) return p;
        }
        return null;
    }

    /**
     * Emit block-break fragments.
     * @param {number} worldX - world pixel X of block top-left
     * @param {number} worldY - world pixel Y of block top-left
     * @param {string} color  - block color
     */
    emitBlockBreak(worldX, worldY, color) {
        const count = 4 + Math.floor(Math.random() * 3); // 4-6 particles
        for (let i = 0; i < count; i++) {
            const p = this._getParticle();
            if (!p) break;
            const px = worldX + Math.random() * BLOCK_SIZE;
            const py = worldY + Math.random() * BLOCK_SIZE;
            const vx = (Math.random() - 0.5) * 200;
            const vy = -100 - Math.random() * 150;
            const size = 2 + Math.floor(Math.random() * 3);
            p.init(px, py, vx, vy, 0.4 + Math.random() * 0.2, size, color, 700);
        }
    }

    /**
     * Emit hit sparks when enemy is damaged.
     */
    emitHitSparks(worldX, worldY) {
        const count = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
            const p = this._getParticle();
            if (!p) break;
            const vx = (Math.random() - 0.5) * 250;
            const vy = -80 - Math.random() * 120;
            const colors = ['#ffdd44', '#ffffff', '#ffaa22'];
            const color = colors[Math.floor(Math.random() * colors.length)];
            p.init(worldX, worldY, vx, vy, 0.25 + Math.random() * 0.15, 2, color, 500);
        }
    }

    /**
     * Emit damage particles on player.
     */
    emitPlayerDamage(worldX, worldY) {
        const count = 5;
        for (let i = 0; i < count; i++) {
            const p = this._getParticle();
            if (!p) break;
            const vx = (Math.random() - 0.5) * 180;
            const vy = -60 - Math.random() * 100;
            p.init(worldX, worldY, vx, vy, 0.3, 2, '#ff3333', 400);
        }
    }

    /**
     * Update all active particles.
     */
    update(dt) {
        for (const p of this.pool) {
            if (p.active) p.update(dt);
        }
    }

    /**
     * Draw all active particles.
     */
    draw(ctx, camera) {
        for (const p of this.pool) {
            if (p.active) p.draw(ctx, camera);
        }
    }

    /**
     * Count active particles (for debug).
     */
    getActiveCount() {
        let c = 0;
        for (const p of this.pool) if (p.active) c++;
        return c;
    }
}
