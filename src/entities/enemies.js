/**
 * Enemy classes — Surface, Cavern, Underworld + 3 Bosses.
 * All share a base interface: update(dt), draw(ctx, camera), takeDamage(), isDead()
 *
 * SURFACE:   Slime (day), Zombie Neon (night)
 * CAVERN:    Bat, CyberInfiltrator, CrystalSpider
 * UNDERWORLD:FireDemon, ScrapSentinel
 * BOSS 1:    SentinelProbe   (Cavern — Old Battery)
 * BOSS 2:    BrassGolem      (Gold zone — Mech Heart)
 * BOSS 3:    BossEye         (Underworld — Deep Invoker)  — 2 phases
 */

const ENEMY_TYPE = Object.freeze({
    SLIME: 0, ZOMBIE: 1, BAT: 2,
    CYBER_INFILTRATOR: 3, CRYSTAL_SPIDER: 4,
    FIRE_DEMON: 5, SCRAP_SENTINEL: 6,
    BOSS_PROBE: 10, BOSS_GOLEM: 11, BOSS_EYE: 12,
});

// ---------------------------------------------------------------------------
// Base Enemy
// ---------------------------------------------------------------------------
class Enemy {
    constructor(x, y, w, h, type) {
        this.x = x; this.y = y;
        this.w = w; this.h = h;
        this.vx = 0; this.vy = 0;
        this.type = type;
        this.hp = 50;
        this.maxHp = 50;
        this.damage = 10;
        this.alive = true;
        this.flashTimer = 0;
        this.knockbackVx = 0;
        this.knockbackVy = 0;
        this.despawnDist = 1500;
        this.dropsCrystal = false;
        this.coinDrop = 0;
        this.isBoss = false;
    }

    takeDamage(amount, knockDirX = 0, knockDirY = 0, knockForce = 300) {
        this.hp -= amount;
        this.flashTimer = 0.15;
        if (!this.isBoss) {
            this.knockbackVx = knockDirX * knockForce;
            this.knockbackVy = knockDirY * knockForce - 150;
        } else {
            this.knockbackVx = knockDirX * knockForce * 0.15;
            this.knockbackVy = knockDirY * knockForce * 0.1;
        }
        if (this.hp <= 0) { this.alive = false; }
    }

    isDead() { return !this.alive; }

    getCenter() {
        return { cx: this.x + this.w * 0.5, cy: this.y + this.h * 0.5 };
    }

    _applyKnockback(dt) {
        this.x += this.knockbackVx * dt;
        this.y += this.knockbackVy * dt;
        this.knockbackVx *= 0.85;
        this.knockbackVy *= 0.85;
    }

    _isSolidAt(bx, by, cm) {
        const id = cm.getBlockAt(bx, by);
        return id !== BLOCK.AIR && id !== BLOCK.TORCH && id !== BLOCK.COBWEB;
    }

    _collideWorld(cm) {
        const x0 = Math.floor(this.x / BLOCK_SIZE);
        const y0 = Math.floor(this.y / BLOCK_SIZE);
        const x1 = Math.floor((this.x + this.w - 1) / BLOCK_SIZE);
        const y1 = Math.floor((this.y + this.h - 1) / BLOCK_SIZE);
        for (let bx = x0; bx <= x1; bx++) {
            for (let by = y0; by <= y1; by++) {
                if (this._isSolidAt(bx, by, cm)) {
                    if (this.vy > 0) {
                        this.y = by * BLOCK_SIZE - this.h;
                        this.vy = 0;
                        this.onGround = true;
                    }
                    return true;
                }
            }
        }
        return false;
    }

    _collideX(cm) {
        const nx0 = Math.floor(this.x / BLOCK_SIZE);
        const nx1 = Math.floor((this.x + this.w - 1) / BLOCK_SIZE);
        const ny0 = Math.floor(this.y / BLOCK_SIZE);
        const ny1 = Math.floor((this.y + this.h - 1) / BLOCK_SIZE);
        for (let bx = nx0; bx <= nx1; bx++) {
            for (let by = ny0; by <= ny1; by++) {
                if (this._isSolidAt(bx, by, cm)) {
                    if (this.vx > 0) this.x = bx * BLOCK_SIZE - this.w;
                    else this.x = (bx + 1) * BLOCK_SIZE;
                    this.vx = 0;
                }
            }
        }
    }

    drawHPBar(ctx, sx, sy) {
        if (this.hp >= this.maxHp) return;
        const barW = Math.max(this.w, 20);
        const barH = 3;
        ctx.fillStyle = '#300';
        ctx.fillRect(sx, sy - 6, barW, barH);
        ctx.fillStyle = '#f44';
        ctx.fillRect(sx, sy - 6, barW * (this.hp / this.maxHp), barH);
    }
}

// ===========================================================================
// SURFACE: Slime (day)
// ===========================================================================
class Slime extends Enemy {
    constructor(x, y) {
        super(x, y, 20, 16, ENEMY_TYPE.SLIME);
        this.hp = 40; this.maxHp = 40;
        this.damage = 8; this.coinDrop = 2;
        this.jumpCooldown = 0;
        this.jumpInterval = 1.2;
        this.aggroRange = 200;
        this.onGround = false;
        this.color = `hsl(${100 + Math.random() * 60}, 70%, 45%)`;
    }

    update(dt, px, py, cm) {
        this._applyKnockback(dt);
        this.flashTimer = Math.max(0, this.flashTimer - dt);
        this.vy += 900 * dt; if (this.vy > 600) this.vy = 600;
        this.onGround = false;
        this.y += this.vy * dt; this._collideWorld(cm);
        this.x += this.vx * dt; this.vx *= 0.92;
        this.jumpCooldown -= dt;
        if (this.onGround && this.jumpCooldown <= 0) {
            const dx = px - this.x;
            this.vy = -350 - Math.random() * 100;
            if (Math.abs(dx) < this.aggroRange) this.vx = Math.sign(dx) * (150 + Math.random() * 80);
            else this.vx = (Math.random() - 0.5) * 120;
            this.jumpCooldown = this.jumpInterval + Math.random() * 0.5;
        }
    }

    draw(ctx, cam) {
        const { sx, sy } = cam.worldToScreen(this.x, this.y);
        ctx.fillStyle = this.flashTimer > 0 ? '#ff3333' : this.color;
        const sq = this.onGround ? 0.8 : 1.1;
        const dH = this.h * sq, dW = this.w * (2 - sq), ox = (this.w - dW) * 0.5;
        ctx.fillRect(sx + ox | 0, sy + this.h - dH | 0, dW | 0, dH | 0);
        ctx.fillStyle = '#fff';
        ctx.fillRect(sx + 5 | 0, sy + this.h - dH + 4 | 0, 4, 4);
        ctx.fillRect(sx + 12 | 0, sy + this.h - dH + 4 | 0, 4, 4);
        ctx.fillStyle = '#111';
        ctx.fillRect(sx + 6 | 0, sy + this.h - dH + 5 | 0, 2, 2);
        ctx.fillRect(sx + 13 | 0, sy + this.h - dH + 5 | 0, 2, 2);
        this.drawHPBar(ctx, sx, sy);
    }
}

// ===========================================================================
// SURFACE: Zombie with Neon Eyes (night)
// ===========================================================================
class Zombie extends Enemy {
    constructor(x, y) {
        super(x, y, 14, 30, ENEMY_TYPE.ZOMBIE);
        this.hp = 60; this.maxHp = 60;
        this.damage = 15; this.coinDrop = 3;
        this.speed = 60; this.onGround = false;
        this.neonPhase = Math.random() * Math.PI * 2;
    }

    update(dt, px, py, cm) {
        this._applyKnockback(dt);
        this.flashTimer = Math.max(0, this.flashTimer - dt);
        this.neonPhase += dt * 4;
        this.vy += 1200 * dt; if (this.vy > 700) this.vy = 700;
        const dx = px - this.x, dir = Math.sign(dx);
        this.vx = dir * this.speed;
        const fx = dir > 0 ? this.x + this.w + 2 : this.x - 2;
        const fbx = Math.floor(fx / BLOCK_SIZE), fby = Math.floor((this.y + this.h) / BLOCK_SIZE);
        const hby = Math.floor(this.y / BLOCK_SIZE);
        if (this._isSolidAt(fbx, fby - 1, cm) && !this._isSolidAt(fbx, hby - 1, cm) && this.onGround) this.vy = -400;
        this.onGround = false;
        this.y += this.vy * dt; this._collideWorld(cm);
        this.x += this.vx * dt; this._collideX(cm);
    }

    draw(ctx, cam) {
        const { sx, sy } = cam.worldToScreen(this.x, this.y);
        const f = this.flashTimer > 0;
        ctx.fillStyle = f ? '#ff3333' : '#2a5a2a';
        ctx.fillRect(sx | 0, sy | 0, this.w, this.h);
        ctx.fillStyle = f ? '#ff5555' : '#3a7a3a';
        ctx.fillRect(sx | 0, sy | 0, this.w, 10);
        // Neon eyes
        const glow = 0.6 + 0.4 * Math.sin(this.neonPhase);
        ctx.fillStyle = `rgba(0,255,180,${glow})`;
        ctx.fillRect(sx + 2 | 0, sy + 3 | 0, 3, 3);
        ctx.fillRect(sx + 9 | 0, sy + 3 | 0, 3, 3);
        ctx.fillStyle = f ? '#ff3333' : '#2a5a2a';
        ctx.fillRect(sx - 3 | 0, sy + 10 | 0, 3, 12);
        ctx.fillRect(sx + this.w | 0, sy + 10 | 0, 3, 12);
        this.drawHPBar(ctx, sx, sy);
    }
}

// ===========================================================================
// CAVERN: Bat — flies through blocks, drops crystals
// ===========================================================================
class Bat extends Enemy {
    constructor(x, y) {
        super(x, y, 18, 12, ENEMY_TYPE.BAT);
        this.hp = 25; this.maxHp = 25;
        this.damage = 8; this.coinDrop = 1;
        this.speed = 100;
        this.wobbleTime = Math.random() * 10;
        this.dropsCrystal = true;
    }

    update(dt, px, py, cm) {
        this._applyKnockback(dt);
        this.flashTimer = Math.max(0, this.flashTimer - dt);
        this.wobbleTime += dt;
        const dx = px - this.x, dy = py - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        this.vx = (dx / dist) * this.speed + Math.sin(this.wobbleTime * 5) * 40;
        this.vy = (dy / dist) * this.speed + Math.cos(this.wobbleTime * 4) * 30;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
    }

    draw(ctx, cam) {
        const { sx, sy } = cam.worldToScreen(this.x, this.y);
        const f = this.flashTimer > 0;
        const wo = Math.sin(this.wobbleTime * 12) * 4;
        ctx.fillStyle = f ? '#ff4444' : '#4a2a4a';
        ctx.fillRect(sx - 4 | 0, sy + wo | 0, 6, 8);
        ctx.fillRect(sx + this.w - 2 | 0, sy - wo | 0, 6, 8);
        ctx.fillStyle = f ? '#ff6666' : '#3a1a3a';
        ctx.fillRect(sx + 3 | 0, sy | 0, 12, this.h);
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(sx + 5 | 0, sy + 3 | 0, 2, 2);
        ctx.fillRect(sx + 10 | 0, sy + 3 | 0, 2, 2);
        this.drawHPBar(ctx, sx, sy);
    }
}

// ===========================================================================
// CAVERN: Cyber Infiltrator — corrupted robot, fires slow lasers
// ===========================================================================
class CyberInfiltrator extends Enemy {
    constructor(x, y) {
        super(x, y, 16, 28, ENEMY_TYPE.CYBER_INFILTRATOR);
        this.hp = 80; this.maxHp = 80;
        this.damage = 12; this.coinDrop = 5;
        this.speed = 45;
        this.onGround = false;
        this.shootTimer = 2.5;
        this.shootInterval = 3.0;
        this.facing = -1;
        this.scanPhase = 0;
        this.projectiles = [];
    }

    update(dt, px, py, cm) {
        this._applyKnockback(dt);
        this.flashTimer = Math.max(0, this.flashTimer - dt);
        this.scanPhase += dt * 3;
        this.vy += 1200 * dt; if (this.vy > 700) this.vy = 700;
        const dx = px - this.x;
        this.facing = Math.sign(dx) || 1;
        this.vx = this.facing * this.speed;
        this.onGround = false;
        this.y += this.vy * dt; this._collideWorld(cm);
        this.x += this.vx * dt; this._collideX(cm);
        // Laser shooting
        this.shootTimer -= dt;
        if (this.shootTimer <= 0) {
            this.shootTimer = this.shootInterval;
            const dist = Math.sqrt(dx * dx + (py - this.y) ** 2) || 1;
            this.projectiles.push({
                x: this.x + this.w * 0.5,
                y: this.y + 10,
                vx: (dx / dist) * 120,
                vy: ((py - this.y) / dist) * 120,
                life: 3.0,
            });
        }
        // Update projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
            if (p.life <= 0) this.projectiles.splice(i, 1);
        }
    }

    draw(ctx, cam) {
        const { sx, sy } = cam.worldToScreen(this.x, this.y);
        const f = this.flashTimer > 0;
        // Body — dark metallic
        ctx.fillStyle = f ? '#ff4444' : '#3a3a5a';
        ctx.fillRect(sx | 0, sy + 8 | 0, this.w, 20);
        // Head — angular
        ctx.fillStyle = f ? '#ff6666' : '#4a4a6a';
        ctx.fillRect(sx + 2 | 0, sy | 0, 12, 10);
        // Scan eye (red pulsing)
        const eyeGlow = 0.5 + 0.5 * Math.sin(this.scanPhase);
        ctx.fillStyle = `rgba(255,0,0,${eyeGlow})`;
        ctx.fillRect(sx + 4 | 0, sy + 3 | 0, 8, 2);
        // Legs
        ctx.fillStyle = '#2a2a3a';
        ctx.fillRect(sx + 2 | 0, sy + 26 | 0, 3, 4);
        ctx.fillRect(sx + 11 | 0, sy + 26 | 0, 3, 4);
        // Laser projectiles
        ctx.fillStyle = '#ff2222';
        ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 4;
        for (const p of this.projectiles) {
            const { sx: lx, sy: ly } = cam.worldToScreen(p.x, p.y);
            ctx.fillRect(lx - 2 | 0, ly - 1 | 0, 4, 2);
        }
        ctx.shadowBlur = 0;
        this.drawHPBar(ctx, sx, sy);
    }
}

// ===========================================================================
// CAVERN: Crystal Spider — walks on walls, spits web (slows player)
// ===========================================================================
class CrystalSpider extends Enemy {
    constructor(x, y) {
        super(x, y, 22, 14, ENEMY_TYPE.CRYSTAL_SPIDER);
        this.hp = 55; this.maxHp = 55;
        this.damage = 10; this.coinDrop = 3;
        this.speed = 70; this.onGround = false;
        this.webTimer = 4; this.webInterval = 5;
        this.dropsCrystal = true;
        this.facing = Math.random() > 0.5 ? 1 : -1;
        this.legPhase = 0;
        this.projectiles = [];
    }

    update(dt, px, py, cm) {
        this._applyKnockback(dt);
        this.flashTimer = Math.max(0, this.flashTimer - dt);
        this.legPhase += dt * 8;
        this.vy += 900 * dt; if (this.vy > 600) this.vy = 600;
        const dx = px - this.x;
        this.facing = Math.sign(dx) || 1;
        this.vx = this.facing * this.speed;
        this.onGround = false;
        this.y += this.vy * dt; this._collideWorld(cm);
        this.x += this.vx * dt; this._collideX(cm);
        // Web spit
        this.webTimer -= dt;
        if (this.webTimer <= 0 && Math.abs(dx) < 300) {
            this.webTimer = this.webInterval;
            const dy = py - this.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
            this.projectiles.push({
                x: this.x + this.w * 0.5, y: this.y,
                vx: (dx / dist) * 100, vy: (dy / dist) * 100,
                life: 2.5, isWeb: true,
            });
        }
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
            if (p.life <= 0) this.projectiles.splice(i, 1);
        }
    }

    draw(ctx, cam) {
        const { sx, sy } = cam.worldToScreen(this.x, this.y);
        const f = this.flashTimer > 0;
        // Body — purple crystal
        ctx.fillStyle = f ? '#ff4488' : '#8844aa';
        ctx.fillRect(sx + 3 | 0, sy + 2 | 0, 16, 10);
        // Crystal shards on back
        ctx.fillStyle = '#aa66cc';
        ctx.fillRect(sx + 6 | 0, sy | 0, 4, 3);
        ctx.fillRect(sx + 12 | 0, sy | 0, 3, 4);
        // Legs (animated)
        ctx.fillStyle = f ? '#ff6699' : '#664488';
        for (let i = 0; i < 4; i++) {
            const lx = sx + 2 + i * 5;
            const ly = sy + 12 + Math.sin(this.legPhase + i * 1.5) * 2;
            ctx.fillRect(lx | 0, ly | 0, 2, 4);
        }
        // Eyes
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(sx + 5 | 0, sy + 5 | 0, 2, 2);
        ctx.fillRect(sx + 14 | 0, sy + 5 | 0, 2, 2);
        // Web projectiles
        ctx.fillStyle = 'rgba(200,200,200,0.7)';
        for (const p of this.projectiles) {
            const { sx: wx, sy: wy } = cam.worldToScreen(p.x, p.y);
            ctx.fillRect(wx - 3 | 0, wy - 3 | 0, 6, 6);
        }
        this.drawHPBar(ctx, sx, sy);
    }
}

// ===========================================================================
// UNDERWORLD: Fire Demon — flies, launches embers
// ===========================================================================
class FireDemon extends Enemy {
    constructor(x, y) {
        super(x, y, 20, 26, ENEMY_TYPE.FIRE_DEMON);
        this.hp = 100; this.maxHp = 100;
        this.damage = 20; this.coinDrop = 8;
        this.speed = 70;
        this.wobbleTime = Math.random() * 10;
        this.shootTimer = 1.5; this.shootInterval = 2.5;
        this.projectiles = [];
    }

    update(dt, px, py, cm) {
        this._applyKnockback(dt);
        this.flashTimer = Math.max(0, this.flashTimer - dt);
        this.wobbleTime += dt;
        const dx = px - this.x, dy = py - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        this.vx = (dx / dist) * this.speed + Math.sin(this.wobbleTime * 3) * 30;
        this.vy = (dy / dist) * this.speed * 0.7 + Math.cos(this.wobbleTime * 2) * 20;
        this.x += this.vx * dt; this.y += this.vy * dt;
        // Ember shooting
        this.shootTimer -= dt;
        if (this.shootTimer <= 0) {
            this.shootTimer = this.shootInterval;
            for (let a = -1; a <= 1; a++) {
                const angle = Math.atan2(dy, dx) + a * 0.3;
                this.projectiles.push({
                    x: this.x + this.w * 0.5, y: this.y + this.h * 0.5,
                    vx: Math.cos(angle) * 150, vy: Math.sin(angle) * 150,
                    life: 2.0,
                });
            }
        }
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
            if (p.life <= 0) this.projectiles.splice(i, 1);
        }
    }

    draw(ctx, cam) {
        const { sx, sy } = cam.worldToScreen(this.x, this.y);
        const f = this.flashTimer > 0;
        // Wings (fiery)
        const wo = Math.sin(this.wobbleTime * 8) * 3;
        ctx.fillStyle = f ? '#ff8800' : '#cc4400';
        ctx.fillRect(sx - 6 | 0, sy + 4 + wo | 0, 8, 14);
        ctx.fillRect(sx + this.w - 2 | 0, sy + 4 - wo | 0, 8, 14);
        // Body
        ctx.fillStyle = f ? '#ffaa44' : '#881100';
        ctx.fillRect(sx + 2 | 0, sy + 2 | 0, 16, 22);
        // Head — horns
        ctx.fillStyle = '#aa2200';
        ctx.fillRect(sx + 4 | 0, sy | 0, 12, 8);
        ctx.fillStyle = '#cc4400';
        ctx.fillRect(sx + 3 | 0, sy - 3 | 0, 3, 4);
        ctx.fillRect(sx + 14 | 0, sy - 3 | 0, 3, 4);
        // Eyes
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(sx + 6 | 0, sy + 3 | 0, 3, 2);
        ctx.fillRect(sx + 12 | 0, sy + 3 | 0, 3, 2);
        // Ember projectiles
        ctx.fillStyle = '#ff6600';
        ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 3;
        for (const p of this.projectiles) {
            const { sx: ex, sy: ey } = cam.worldToScreen(p.x, p.y);
            ctx.fillRect(ex - 2 | 0, ey - 2 | 0, 4, 4);
        }
        ctx.shadowBlur = 0;
        this.drawHPBar(ctx, sx, sy);
    }
}

// ===========================================================================
// UNDERWORLD: Scrap Sentinel — heavy mech tank, slow but tanky
// ===========================================================================
class ScrapSentinel extends Enemy {
    constructor(x, y) {
        super(x, y, 28, 32, ENEMY_TYPE.SCRAP_SENTINEL);
        this.hp = 150; this.maxHp = 150;
        this.damage = 25; this.coinDrop = 12;
        this.speed = 30; this.onGround = false;
        this.chargeCooldown = 4; this.isCharging = false;
        this.chargeTimer = 0; this.chargeDir = 1;
        this.trackPhase = 0;
    }

    update(dt, px, py, cm) {
        this._applyKnockback(dt);
        this.flashTimer = Math.max(0, this.flashTimer - dt);
        this.trackPhase += dt * 2;
        this.vy += 1200 * dt; if (this.vy > 600) this.vy = 600;
        const dx = px - this.x;
        if (this.isCharging) {
            this.vx = this.chargeDir * 250;
            this.chargeTimer -= dt;
            if (this.chargeTimer <= 0) { this.isCharging = false; this.chargeCooldown = 3; }
        } else {
            this.vx = Math.sign(dx) * this.speed;
            this.chargeCooldown -= dt;
            if (this.chargeCooldown <= 0 && Math.abs(dx) < 300) {
                this.isCharging = true;
                this.chargeTimer = 0.8;
                this.chargeDir = Math.sign(dx) || 1;
            }
        }
        this.onGround = false;
        this.y += this.vy * dt; this._collideWorld(cm);
        this.x += this.vx * dt; this._collideX(cm);
    }

    draw(ctx, cam) {
        const { sx, sy } = cam.worldToScreen(this.x, this.y);
        const f = this.flashTimer > 0;
        // Tracks
        ctx.fillStyle = '#333';
        ctx.fillRect(sx | 0, sy + 28 | 0, this.w, 4);
        const tp = Math.sin(this.trackPhase) * 2;
        for (let i = 0; i < 5; i++) {
            ctx.fillStyle = '#555';
            ctx.fillRect(sx + 2 + i * 5 + tp | 0, sy + 28 | 0, 3, 4);
        }
        // Hull — heavy armor
        ctx.fillStyle = f ? '#ff5544' : '#5a5a5a';
        ctx.fillRect(sx + 2 | 0, sy + 8 | 0, 24, 20);
        // Turret head
        ctx.fillStyle = f ? '#ff7766' : '#6a6a6a';
        ctx.fillRect(sx + 5 | 0, sy | 0, 18, 12);
        // Eye slit
        ctx.fillStyle = this.isCharging ? '#ff0000' : '#ffaa00';
        ctx.fillRect(sx + 8 | 0, sy + 4 | 0, 12, 3);
        // Shoulder plates
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(sx - 2 | 0, sy + 10 | 0, 4, 10);
        ctx.fillRect(sx + 26 | 0, sy + 10 | 0, 4, 10);
        this.drawHPBar(ctx, sx, sy);
    }
}

// ===========================================================================
// BOSS 1: Sentinel Probe — flying drone with energy shield + burst fire
// ===========================================================================
class SentinelProbe extends Enemy {
    constructor(x, y) {
        super(x, y, 48, 32, ENEMY_TYPE.BOSS_PROBE);
        this.hp = 800; this.maxHp = 800;
        this.damage = 18; this.isBoss = true;
        this.speed = 90; this.wobbleTime = 0;
        this.shieldHp = 200; this.maxShieldHp = 200;
        this.burstTimer = 3; this.burstCount = 0;
        this.despawnDist = Infinity;
        this.projectiles = [];
        this.bossName = 'A Sonda Sentinela';
    }

    takeDamage(amount, kx, ky, kf) {
        if (this.shieldHp > 0) {
            this.shieldHp -= amount;
            this.flashTimer = 0.1;
            if (this.shieldHp <= 0) { this.shieldHp = 0; }
            return;
        }
        super.takeDamage(amount, kx, ky, kf);
    }

    update(dt, px, py, cm) {
        this._applyKnockback(dt);
        this.flashTimer = Math.max(0, this.flashTimer - dt);
        this.wobbleTime += dt;
        const dx = px - (this.x + this.w * 0.5), dy = py - (this.y + this.h * 0.5);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        // Float around player
        const targetDist = 150;
        const factor = dist > targetDist ? 1 : -0.5;
        this.x += (dx / dist) * this.speed * factor * dt + Math.sin(this.wobbleTime * 2) * 30 * dt;
        this.y += (dy / dist) * this.speed * factor * 0.7 * dt + Math.cos(this.wobbleTime * 1.5) * 20 * dt;
        // Burst fire
        this.burstTimer -= dt;
        if (this.burstTimer <= 0) {
            this.burstCount++;
            if (this.burstCount >= 5) { this.burstTimer = 2.5; this.burstCount = 0; }
            else { this.burstTimer = 0.15; }
            const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.3;
            this.projectiles.push({
                x: this.x + this.w * 0.5, y: this.y + this.h * 0.5,
                vx: Math.cos(angle) * 200, vy: Math.sin(angle) * 200, life: 2.5,
            });
        }
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
            if (p.life <= 0) this.projectiles.splice(i, 1);
        }
        // Regenerate shield slowly
        if (this.shieldHp < this.maxShieldHp && this.shieldHp > 0) {
            this.shieldHp = Math.min(this.maxShieldHp, this.shieldHp + 5 * dt);
        }
    }

    draw(ctx, cam) {
        const { sx, sy } = cam.worldToScreen(this.x, this.y);
        const cx = sx + this.w * 0.5, cy = sy + this.h * 0.5;
        const f = this.flashTimer > 0;
        // Shield
        if (this.shieldHp > 0) {
            const alpha = 0.15 + 0.1 * Math.sin(this.wobbleTime * 4);
            ctx.strokeStyle = `rgba(0,200,255,${alpha + 0.3})`;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(cx, cy, 30, 22, 0, 0, Math.PI * 2); ctx.stroke();
        }
        // Body — hexagonal drone
        ctx.fillStyle = f ? '#ff6666' : '#4a6a8a';
        ctx.fillRect(sx + 8 | 0, sy + 4 | 0, 32, 24);
        // Side pods
        ctx.fillStyle = '#3a5a7a';
        ctx.fillRect(sx | 0, sy + 10 | 0, 10, 12);
        ctx.fillRect(sx + 38 | 0, sy + 10 | 0, 10, 12);
        // Central eye
        ctx.fillStyle = '#00ccff';
        ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(cx - 2, cy - 2, 2, 0, Math.PI * 2); ctx.fill();
        // Antenna
        ctx.strokeStyle = '#6a8aaa'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, sy + 4); ctx.lineTo(cx, sy - 4); ctx.stroke();
        ctx.fillStyle = '#ff4444';
        ctx.fillRect(cx - 1, sy - 5, 3, 3);
        // Projectiles
        ctx.fillStyle = '#00aaff';
        ctx.shadowColor = '#00ccff'; ctx.shadowBlur = 5;
        for (const p of this.projectiles) {
            const { sx: px2, sy: py2 } = cam.worldToScreen(p.x, p.y);
            ctx.fillRect(px2 - 2 | 0, py2 - 2 | 0, 4, 4);
        }
        ctx.shadowBlur = 0;
    }
}

// ===========================================================================
// BOSS 2: Brass Golem — ground-based melee tank, smashes with fists
// ===========================================================================
class BrassGolem extends Enemy {
    constructor(x, y) {
        super(x, y, 40, 50, ENEMY_TYPE.BOSS_GOLEM);
        this.hp = 1500; this.maxHp = 1500;
        this.damage = 30; this.isBoss = true;
        this.speed = 55; this.onGround = false;
        this.slamCooldown = 4; this.isSlamming = false;
        this.slamTimer = 0; this.wobbleTime = 0;
        this.despawnDist = Infinity;
        this.bossName = 'O Golem de Latão';
        this.shockwave = null;
    }

    update(dt, px, py, cm) {
        this._applyKnockback(dt);
        this.flashTimer = Math.max(0, this.flashTimer - dt);
        this.wobbleTime += dt;
        this.vy += 1400 * dt; if (this.vy > 800) this.vy = 800;
        const dx = px - this.x;
        if (this.isSlamming) {
            this.vx = 0;
            this.slamTimer -= dt;
            if (this.slamTimer <= 0) {
                this.isSlamming = false;
                this.slamCooldown = 3;
                this.shockwave = { x: this.x + this.w * 0.5, y: this.y + this.h, radius: 0, maxRadius: 120, life: 0.5 };
            }
        } else {
            this.vx = Math.sign(dx) * this.speed;
            this.slamCooldown -= dt;
            if (this.slamCooldown <= 0 && Math.abs(dx) < 200 && this.onGround) {
                this.isSlamming = true;
                this.slamTimer = 0.6;
                this.vy = -500;
            }
        }
        this.onGround = false;
        this.y += this.vy * dt; this._collideWorld(cm);
        this.x += this.vx * dt; this._collideX(cm);
        // Shockwave
        if (this.shockwave) {
            this.shockwave.radius += 300 * dt;
            this.shockwave.life -= dt;
            if (this.shockwave.life <= 0) this.shockwave = null;
        }
    }

    draw(ctx, cam) {
        const { sx, sy } = cam.worldToScreen(this.x, this.y);
        const f = this.flashTimer > 0;
        // Legs
        ctx.fillStyle = f ? '#ff8844' : '#8a7030';
        ctx.fillRect(sx + 6 | 0, sy + 40 | 0, 10, 12);
        ctx.fillRect(sx + 24 | 0, sy + 40 | 0, 10, 12);
        // Torso
        ctx.fillStyle = f ? '#ffaa66' : '#aa8840';
        ctx.fillRect(sx + 4 | 0, sy + 14 | 0, 32, 28);
        // Chest plate
        ctx.fillStyle = '#ccaa44';
        ctx.fillRect(sx + 10 | 0, sy + 18 | 0, 20, 12);
        ctx.fillStyle = '#ffdd66';
        ctx.fillRect(sx + 14 | 0, sy + 20 | 0, 12, 4);
        // Head
        ctx.fillStyle = f ? '#ffcc88' : '#bb9950';
        ctx.fillRect(sx + 10 | 0, sy | 0, 20, 16);
        // Eyes
        ctx.fillStyle = this.isSlamming ? '#ff0000' : '#ff8800';
        ctx.fillRect(sx + 14 | 0, sy + 5 | 0, 4, 4);
        ctx.fillRect(sx + 22 | 0, sy + 5 | 0, 4, 4);
        // Fists (raised if slamming)
        const fistY = this.isSlamming ? sy + 2 : sy + 20;
        ctx.fillStyle = f ? '#ffaa66' : '#997740';
        ctx.fillRect(sx - 6 | 0, fistY | 0, 10, 12);
        ctx.fillRect(sx + 36 | 0, fistY | 0, 10, 12);
        // Shockwave
        if (this.shockwave) {
            const sw = this.shockwave;
            const { sx: swx, sy: swy } = cam.worldToScreen(sw.x, sw.y);
            ctx.strokeStyle = `rgba(255,170,0,${sw.life * 2})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(swx, swy, sw.radius, sw.radius * 0.3, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
}

// ===========================================================================
// BOSS 3: The Great Eye of the Core — 2 Phases
// Phase 1: floats, spawns mini-slimes, dashes
// Phase 2 (<50% HP): opens mech mouth, extreme speed charge
// ===========================================================================
class BossEye extends Enemy {
    constructor(x, y) {
        super(x, y, 64, 64, ENEMY_TYPE.BOSS_EYE);
        this.hp = 2500; this.maxHp = 2500;
        this.damage = 30; this.isBoss = true;
        this.speed = 80;
        this.bossPhase = 1;     // 1 or 2
        this.actionTimer = 5; this.actionCycle = 0;
        this.dashDir = { x: 0, y: 0 };
        this.dashSpeed = 500; this.isDashing = false; this.dashTimer = 0;
        this.wobbleTime = 0;
        this.despawnDist = Infinity;
        this.pupilOffset = { x: 0, y: 0 };
        this.spawnCallback = null;
        this.bossName = 'O Grande Olho do Núcleo';
        this.mouthOpen = 0;
    }

    update(dt, px, py, cm) {
        this._applyKnockback(dt);
        this.flashTimer = Math.max(0, this.flashTimer - dt);
        this.wobbleTime += dt;
        this.actionTimer -= dt;

        // Phase transition
        if (this.bossPhase === 1 && this.hp <= this.maxHp * 0.5) {
            this.bossPhase = 2;
            this.speed = 140;
            this.dashSpeed = 700;
            this.damage = 40;
        }

        const dx = px - (this.x + this.w * 0.5);
        const dy = py - (this.y + this.h * 0.5);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        this.pupilOffset.x = (dx / dist) * 8;
        this.pupilOffset.y = (dy / dist) * 8;

        if (this.isDashing) {
            this.x += this.dashDir.x * this.dashSpeed * dt;
            this.y += this.dashDir.y * this.dashSpeed * dt;
            this.dashTimer -= dt;
            if (this.dashTimer <= 0) this.isDashing = false;
            return;
        }

        // Mouth animation for phase 2
        if (this.bossPhase === 2) {
            this.mouthOpen = Math.min(1, this.mouthOpen + dt * 2);
        }

        if (this.actionTimer <= 0) {
            this.actionCycle = (this.actionCycle + 1) % (this.bossPhase === 2 ? 4 : 3);
            this.actionTimer = this.bossPhase === 2 ? 3 : 5;

            if (this.actionCycle === 1) {
                this.dashDir = { x: dx / dist, y: dy / dist };
                this.isDashing = true;
                this.dashTimer = this.bossPhase === 2 ? 1.2 : 0.8;
            } else if (this.actionCycle === 2 && this.spawnCallback) {
                this.spawnCallback(this.x, this.y + this.h);
                this.spawnCallback(this.x + this.w, this.y + this.h);
                if (this.bossPhase === 2) this.spawnCallback(this.x + this.w * 0.5, this.y + this.h);
            } else if (this.bossPhase === 2 && this.actionCycle === 3) {
                // Phase 2: double dash
                this.dashDir = { x: dx / dist, y: dy / dist };
                this.isDashing = true;
                this.dashTimer = 1.5;
            }
        }

        const nx = dx / dist, ny = dy / dist;
        this.x += nx * this.speed * dt + Math.sin(this.wobbleTime * 2) * 20 * dt;
        this.y += ny * this.speed * dt + Math.cos(this.wobbleTime * 1.5) * 15 * dt;
    }

    draw(ctx, cam) {
        const { sx, sy } = cam.worldToScreen(this.x, this.y);
        const cx = sx + this.w * 0.5, cy = sy + this.h * 0.5;
        const f = this.flashTimer > 0;
        const p2 = this.bossPhase === 2;

        // Glow
        const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 50);
        grad.addColorStop(0, p2 ? 'rgba(255,50,0,0.4)' : 'rgba(200,0,0,0.3)');
        grad.addColorStop(1, 'rgba(200,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(sx - 20, sy - 20, this.w + 40, this.h + 40);

        // Outer eye
        ctx.fillStyle = f ? '#ff6666' : (p2 ? '#ff2200' : '#cc2222');
        ctx.beginPath(); ctx.ellipse(cx, cy, this.w * 0.5, this.h * 0.45, 0, 0, Math.PI * 2); ctx.fill();

        // White
        ctx.fillStyle = p2 ? '#ffcccc' : '#ffeeee';
        ctx.beginPath(); ctx.ellipse(cx, cy, this.w * 0.35, this.h * 0.3, 0, 0, Math.PI * 2); ctx.fill();

        // Pupil
        ctx.fillStyle = '#110022';
        ctx.beginPath(); ctx.ellipse(cx + this.pupilOffset.x, cy + this.pupilOffset.y, 10, 12, 0, 0, Math.PI * 2); ctx.fill();

        // Glint
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(cx + this.pupilOffset.x - 4, cy + this.pupilOffset.y - 4, 3, 0, Math.PI * 2); ctx.fill();

        // Phase 2: Mechanical mouth below the eye
        if (p2 && this.mouthOpen > 0) {
            const mouthH = 20 * this.mouthOpen;
            ctx.fillStyle = '#440000';
            ctx.fillRect(cx - 16 | 0, cy + 20 | 0, 32, mouthH);
            // Teeth
            ctx.fillStyle = '#cc8800';
            for (let i = 0; i < 6; i++) {
                ctx.fillRect(cx - 14 + i * 5 | 0, cy + 20 | 0, 3, 5 * this.mouthOpen);
                ctx.fillRect(cx - 14 + i * 5 | 0, cy + 20 + mouthH - 5 * this.mouthOpen | 0, 3, 5 * this.mouthOpen);
            }
        }

        // Veins
        ctx.strokeStyle = f ? '#ff4444' : (p2 ? '#cc2200' : '#881111');
        ctx.lineWidth = p2 ? 3 : 2;
        for (let i = 0; i < (p2 ? 8 : 6); i++) {
            const a = (i / (p2 ? 8 : 6)) * Math.PI * 2 + this.wobbleTime * (p2 ? 1 : 0.5);
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * 28, cy + Math.sin(a) * 24);
            ctx.lineTo(cx + Math.cos(a) * 42 + Math.sin(this.wobbleTime + i) * 5,
                       cy + Math.sin(a) * 38 + Math.cos(this.wobbleTime + i) * 5);
            ctx.stroke();
        }
    }
}
