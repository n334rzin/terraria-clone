/**
 * MountSystem — 3 tiered mounts that grant stat bonuses via StatSystem.
 *
 * Mounts:
 *   SlimeSaddle  — Surface. Jump boost, double/triple jump at higher levels.
 *   BatWing      — Cavern. Flight, ore glow aura, dive-bomb at L3.
 *   GolemRider   — Underworld. Defense bonus, auto-mine nearby walls, 3×3 smash at L3.
 *
 * XP thresholds: L1 = 0 XP, L2 = 100 XP, L3 = 300 XP
 * XP is earned while the player is mounted and moving.
 *
 * MountManager handles:
 *   - G key → mount / dismount
 *   - XP gain each frame while mounted
 *   - Pushing stat contributions into StatSystem
 */

const MOUNT_XP_L2 = 100;
const MOUNT_XP_L3 = 300;

// ---------------------------------------------------------------------------
// Mount stat tables per level [L1, L2, L3]
// ---------------------------------------------------------------------------
const MOUNT_STATS = {
    slime: [
        { moveBonus: 0.40, jumpBonus: 0.10, extraJumps: 0 },
        { moveBonus: 0.60, jumpBonus: 0.20, extraJumps: 1 },
        { moveBonus: 0.70, jumpBonus: 0.30, extraJumps: 2, stomp: true },
    ],
    bat: [
        { moveBonus: 0.20, jumpBonus: 0.0, canFly: true },
        { moveBonus: 0.35, jumpBonus: 0.0, canFly: true, oreGlow: true },
        { moveBonus: 0.45, jumpBonus: 0.0, canFly: true, oreGlow: true, diveBomb: true },
    ],
    golem: [
        { defenseBonus: 5,  mineBonus: 0.20, autoMine: true },
        { defenseBonus: 10, mineBonus: 0.40, autoMine: true },
        { defenseBonus: 10, mineBonus: 0.40, autoMine: true, smash3x3: true },
    ],
};

// ---------------------------------------------------------------------------
// MountEntity — base class for all mount types
// ---------------------------------------------------------------------------
class MountEntity {
    constructor(type, w, h) {
        this.type   = type;
        this.w      = w;
        this.h      = h;
        this.x      = 0;
        this.y      = 0;
        this.vx     = 0;
        this.vy     = 0;
        this.onGround = false;
        this.xp     = 0;
        this.level  = 1; // 1..3

        // Rider sits at this offset relative to mount top-center
        this.riderOffsetX = 0;
        this.riderOffsetY = 0;

        // Extra jumps remaining this airtime
        this.extraJumpsLeft = 0;

        // Visual
        this.wobbleTime = 0;
        this.facing = 1;
    }

    get levelIndex() { return this.level - 1; }

    getStats() {
        return MOUNT_STATS[this.type][this.levelIndex];
    }

    addXP(amount) {
        this.xp += amount;
        if (this.level === 1 && this.xp >= MOUNT_XP_L2) {
            this.level = 2;
            events.emit('mount:levelup', { type: this.type, level: 2 });
        } else if (this.level === 2 && this.xp >= MOUNT_XP_L3) {
            this.level = 3;
            events.emit('mount:levelup', { type: this.type, level: 3 });
        }
    }

    _isSolidAt(bx, by, cm) {
        const id = cm.getBlockAt(bx, by);
        return id !== BLOCK.AIR && id !== BLOCK.TORCH && id !== BLOCK.COBWEB;
    }

    _collideY(cm) {
        const x0 = Math.floor(this.x / BLOCK_SIZE);
        const x1 = Math.floor((this.x + this.w - 1) / BLOCK_SIZE);
        if (this.vy >= 0) {
            const by = Math.floor((this.y + this.h - 1) / BLOCK_SIZE);
            for (let bx = x0; bx <= x1; bx++) {
                if (this._isSolidAt(bx, by, cm)) {
                    this.y = by * BLOCK_SIZE - this.h;
                    this.vy = 0;
                    this.onGround = true;
                    return;
                }
            }
        } else {
            const by = Math.floor(this.y / BLOCK_SIZE);
            for (let bx = x0; bx <= x1; bx++) {
                if (this._isSolidAt(bx, by, cm)) {
                    this.y = (by + 1) * BLOCK_SIZE;
                    this.vy = 0;
                    return;
                }
            }
        }
    }

    _collideX(cm) {
        const y0 = Math.floor(this.y / BLOCK_SIZE);
        const y1 = Math.floor((this.y + this.h - 1) / BLOCK_SIZE);
        if (this.vx > 0) {
            const bx = Math.floor((this.x + this.w - 1) / BLOCK_SIZE);
            for (let by = y0; by <= y1; by++) {
                if (this._isSolidAt(bx, by, cm)) { this.x = bx * BLOCK_SIZE - this.w; this.vx = 0; return; }
            }
        } else if (this.vx < 0) {
            const bx = Math.floor(this.x / BLOCK_SIZE);
            for (let by = y0; by <= y1; by++) {
                if (this._isSolidAt(bx, by, cm)) { this.x = (bx + 1) * BLOCK_SIZE; this.vx = 0; return; }
            }
        }
    }

    // Returns rider position so player.x/y can be synced
    getRiderPos() {
        return {
            x: this.x + this.w * 0.5 - 8 + this.riderOffsetX,
            y: this.y + this.riderOffsetY,
        };
    }

    drawHPBar() {} // mounts don't die, keep interface clean
}

// ---------------------------------------------------------------------------
// SlimeSaddle — bouncy surface mount
// ---------------------------------------------------------------------------
class SlimeSaddle extends MountEntity {
    constructor() {
        super('slime', 26, 20);
        this.riderOffsetY = -28;
        this.squishTimer = 0;
        this.color = `hsl(${130 + Math.random() * 30}, 65%, 40%)`;
    }

    update(dt, input, cm, statSystem) {
        this.wobbleTime += dt;
        if (this.squishTimer > 0) this.squishTimer -= dt;

        const stats = this.getStats();
        const moveSpeed = 200 * (1 + stats.moveBonus);

        // Horizontal
        if (input.keys['ArrowLeft'] || input.keys['KeyA']) { this.vx = -moveSpeed; this.facing = -1; }
        else if (input.keys['ArrowRight'] || input.keys['KeyD']) { this.vx = moveSpeed; this.facing = 1; }
        else this.vx *= 0.82;

        // Jump
        const jumpVy = -500 * (1 + stats.jumpBonus);
        if ((input.keys['Space'] || input.keys['ArrowUp'] || input.keys['KeyW']) && this.onGround) {
            this.vy = jumpVy;
            this.onGround = false;
            this.squishTimer = 0.15;
            this.extraJumpsLeft = stats.extraJumps || 0;
            if (window._audio) window._audio.playSelect();
        }
        // Extra jumps mid-air
        if (input.isKeyJustPressed && input.isKeyJustPressed('Space') && !this.onGround && this.extraJumpsLeft > 0) {
            this.vy = jumpVy * 0.85;
            this.extraJumpsLeft--;
        }

        // Gravity
        this.vy += 900 * dt;
        if (this.vy > 700) this.vy = 700;

        this.onGround = false;
        this.y += this.vy * dt; this._collideY(cm);
        this.x += this.vx * dt; this._collideX(cm);

        // L3 Stomp: high downward vy → AOE damage on landing
        if (stats.stomp && !this.onGround && this.vy > 500) {
            this._stompCharged = true;
        }
        if (stats.stomp && this.onGround && this._stompCharged) {
            this._stompCharged = false;
            this.squishTimer = 0.3;
            events.emit('mount:stomp', {
                x: this.x + this.w * 0.5,
                y: this.y + this.h,
                radius: 80,
            });
        }
    }

    draw(ctx, cam) {
        const { sx, sy } = cam.worldToScreen(this.x, this.y);
        const sq = this.onGround ? (0.75 + this.squishTimer * 0.5) : 1.1;
        const dW = this.w * (2 - sq), dH = this.h * sq;
        const ox = (this.w - dW) * 0.5;

        ctx.fillStyle = this.color;
        ctx.fillRect(sx + ox | 0, sy + this.h - dH | 0, dW | 0, dH | 0);

        // Eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(sx + 4 | 0, sy + this.h - dH + 3 | 0, 5, 5);
        ctx.fillRect(sx + 14 | 0, sy + this.h - dH + 3 | 0, 5, 5);
        ctx.fillStyle = '#111';
        ctx.fillRect(sx + 5 + (this.facing > 0 ? 1 : 0) | 0, sy + this.h - dH + 4 | 0, 2, 2);
        ctx.fillRect(sx + 15 + (this.facing > 0 ? 1 : 0) | 0, sy + this.h - dH + 4 | 0, 2, 2);

        // XP bar
        this._drawXPBar(ctx, sx, sy);
    }

    _drawXPBar(ctx, sx, sy) {
        const maxXP = this.level === 1 ? MOUNT_XP_L2 : MOUNT_XP_L3;
        if (this.level === 3) return;
        const pct = Math.min(1, this.xp / maxXP);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(sx, sy - 5, this.w, 3);
        ctx.fillStyle = '#88ff44';
        ctx.fillRect(sx, sy - 5, this.w * pct, 3);
    }
}

// ---------------------------------------------------------------------------
// BatWing — flight-capable cavern mount
// ---------------------------------------------------------------------------
class BatWing extends MountEntity {
    constructor() {
        super('bat', 28, 16);
        this.riderOffsetY = -26;
        this.flapTimer = 0;
        this.flapAngle = 0;
        this.glowRadius = 0;
    }

    update(dt, input, cm, statSystem) {
        this.wobbleTime += dt;
        this.flapTimer += dt;

        const stats = this.getStats();
        const flySpeed = 180 * (1 + stats.moveBonus);

        // Full 4-directional flight
        let mx = 0, my = 0;
        if (input.keys['ArrowLeft']  || input.keys['KeyA']) { mx = -1; this.facing = -1; }
        if (input.keys['ArrowRight'] || input.keys['KeyD']) { mx =  1; this.facing =  1; }
        if (input.keys['Space'] || input.keys['ArrowUp'] || input.keys['KeyW']) my = -1;
        if (input.keys['ArrowDown']  || input.keys['KeyS']) my =  1;

        if (mx !== 0 || my !== 0) {
            const mag = Math.sqrt(mx * mx + my * my);
            this.vx += (mx / mag) * flySpeed * dt * 8;
            this.vy += (my / mag) * flySpeed * dt * 8;
        }

        // Drag for responsive flight
        this.vx *= 0.88;
        this.vy *= 0.88;

        // Gravity (partial — bats fight it)
        this.vy += 200 * dt;
        if (this.vy > 400) this.vy = 400;
        if (this.vy < -400) this.vy = -400;
        if (this.vx > 400) this.vx = 400;
        if (this.vx < -400) this.vx = -400;

        this.onGround = false;
        this.y += this.vy * dt; this._collideY(cm);
        this.x += this.vx * dt; this._collideX(cm);

        // L2+ ore glow pulsing
        if (stats.oreGlow) {
            this.glowRadius = 80 + Math.sin(this.wobbleTime * 3) * 20;
        }

        // L3 dive bomb: fast downward + impact AOE
        if (stats.diveBomb && input.isKeyJustPressed && input.isKeyJustPressed('KeyF')) {
            this.vy = 600;
            this._diveBombing = true;
        }
        if (this._diveBombing && this.onGround) {
            this._diveBombing = false;
            events.emit('mount:divebomb', {
                x: this.x + this.w * 0.5,
                y: this.y + this.h,
                radius: 100,
            });
        }
    }

    draw(ctx, cam) {
        const { sx, sy } = cam.worldToScreen(this.x, this.y);
        const flap = Math.sin(this.flapTimer * 12) * 6;

        // Ore glow aura
        if (this.glowRadius > 0) {
            const gx = sx + this.w * 0.5, gy = sy + this.h * 0.5;
            const g = ctx.createRadialGradient(gx, gy, 5, gx, gy, this.glowRadius);
            g.addColorStop(0, 'rgba(180,120,255,0.15)');
            g.addColorStop(1, 'rgba(180,120,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(sx - this.glowRadius, sy - this.glowRadius, this.glowRadius * 2, this.glowRadius * 2);
        }

        // Wings
        ctx.fillStyle = '#3a1a5a';
        ctx.fillRect(sx - 6 | 0, sy + flap | 0, 8, 10);
        ctx.fillRect(sx + this.w - 2 | 0, sy - flap | 0, 8, 10);

        // Body
        ctx.fillStyle = '#5a2a7a';
        ctx.fillRect(sx | 0, sy | 0, this.w, this.h);

        // Eyes
        ctx.fillStyle = '#ff44ff';
        ctx.fillRect(sx + 4 | 0, sy + 3 | 0, 3, 3);
        ctx.fillRect(sx + this.w - 7 | 0, sy + 3 | 0, 3, 3);

        this._drawXPBar(ctx, sx, sy);
    }

    _drawXPBar(ctx, sx, sy) {
        const maxXP = this.level === 1 ? MOUNT_XP_L2 : MOUNT_XP_L3;
        if (this.level === 3) return;
        const pct = Math.min(1, this.xp / maxXP);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(sx, sy - 5, this.w, 3);
        ctx.fillStyle = '#aa44ff';
        ctx.fillRect(sx, sy - 5, this.w * pct, 3);
    }
}

// ---------------------------------------------------------------------------
// GolemRider — tanky underworld mount
// ---------------------------------------------------------------------------
class GolemRider extends MountEntity {
    constructor() {
        super('golem', 30, 28);
        this.riderOffsetY = -28;
        this.stepTimer = 0;
        this.autoMineTimer = 0;
    }

    update(dt, input, cm, statSystem) {
        this.wobbleTime += dt;
        this.stepTimer += dt;
        const stats = this.getStats();
        const moveSpeed = 120 * (1 + (stats.moveBonus || 0));

        if (input.keys['ArrowLeft']  || input.keys['KeyA']) { this.vx = -moveSpeed; this.facing = -1; }
        else if (input.keys['ArrowRight'] || input.keys['KeyD']) { this.vx = moveSpeed; this.facing =  1; }
        else this.vx *= 0.75;

        // Jump
        if ((input.keys['Space'] || input.keys['ArrowUp'] || input.keys['KeyW']) && this.onGround) {
            this.vy = -420;
            this.onGround = false;
        }

        // Gravity
        this.vy += 1000 * dt;
        if (this.vy > 800) this.vy = 800;

        this.onGround = false;
        this.y += this.vy * dt; this._collideY(cm);
        this.x += this.vx * dt; this._collideX(cm);

        // Auto-mine blocks directly in front of mount
        if (stats.autoMine) {
            this.autoMineTimer -= dt;
            if (this.autoMineTimer <= 0) {
                this.autoMineTimer = 0.6;
                this._tryAutoMine(cm);
            }
        }

        // L3 smash: Space + Down → 3x3 block clear
        if (stats.smash3x3 && input.isKeyJustPressed && input.isKeyJustPressed('KeyF') && this.onGround) {
            this._doSmash(cm);
        }
    }

    _tryAutoMine(cm) {
        const bx = Math.floor((this.x + this.w * 0.5 + this.facing * (this.w * 0.5 + 4)) / BLOCK_SIZE);
        const by = Math.floor((this.y + this.h * 0.5) / BLOCK_SIZE);
        const blockId = cm.getBlockAt(bx, by);
        if (blockId !== BLOCK.AIR && blockId !== BLOCK.BEDROCK && blockId !== BLOCK.TORCH) {
            cm.setBlockAt(bx, by, BLOCK.AIR);
            events.emit('block:break', { bx, by, blockId });
        }
    }

    _doSmash(cm) {
        const cx = Math.floor((this.x + this.w * 0.5) / BLOCK_SIZE);
        const by = Math.floor((this.y + this.h) / BLOCK_SIZE);
        for (let dy = 0; dy <= 2; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const id = cm.getBlockAt(cx + dx, by + dy);
                if (id !== BLOCK.AIR && id !== BLOCK.BEDROCK) {
                    cm.setBlockAt(cx + dx, by + dy, BLOCK.AIR);
                    events.emit('block:break', { bx: cx + dx, by: by + dy, blockId: id });
                }
            }
        }
        events.emit('mount:smash', { x: this.x + this.w * 0.5, y: this.y + this.h, radius: 60 });
    }

    draw(ctx, cam) {
        const { sx, sy } = cam.worldToScreen(this.x, this.y);
        const stepBob = Math.abs(this.vx) > 10 ? Math.sin(this.stepTimer * 8) * 2 : 0;

        // Body (blocky armored look)
        ctx.fillStyle = '#667788';
        ctx.fillRect(sx | 0, sy + stepBob | 0, this.w, this.h);

        // Chest plate
        ctx.fillStyle = '#998866';
        ctx.fillRect(sx + 4 | 0, sy + 4 + stepBob | 0, this.w - 8, this.h - 8);

        // Eyes (glowing)
        const glow = 0.7 + 0.3 * Math.sin(this.wobbleTime * 4);
        ctx.fillStyle = `rgba(255,120,0,${glow})`;
        ctx.fillRect(sx + 5 | 0, sy + 5 + stepBob | 0, 6, 5);
        ctx.fillRect(sx + this.w - 11 | 0, sy + 5 + stepBob | 0, 6, 5);

        // Legs
        ctx.fillStyle = '#445566';
        const legOff = Math.sin(this.stepTimer * 8) * 3;
        ctx.fillRect(sx + 2 | 0,        sy + this.h - 4 + stepBob | 0, 8, 4 + legOff);
        ctx.fillRect(sx + this.w - 10 | 0, sy + this.h - 4 + stepBob | 0, 8, 4 - legOff);

        this._drawXPBar(ctx, sx, sy);
    }

    _drawXPBar(ctx, sx, sy) {
        const maxXP = this.level === 1 ? MOUNT_XP_L2 : MOUNT_XP_L3;
        if (this.level === 3) return;
        const pct = Math.min(1, this.xp / maxXP);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(sx, sy - 5, this.w, 3);
        ctx.fillStyle = '#ffaa44';
        ctx.fillRect(sx, sy - 5, this.w * pct, 3);
    }
}

// ---------------------------------------------------------------------------
// MountManager — handles spawning wild mounts, mounting/dismounting, XP
// ---------------------------------------------------------------------------
class MountManager {
    constructor(statSystem, hud) {
        this.statSystem = statSystem;
        this.hud = hud;
        this.activeMount = null;    // currently ridden mount
        this.wildMounts = [];       // untamed mounts in the world

        // Mount items the player has collected (by type)
        this.ownedMounts = new Map(); // type → MountEntity

        // Wire events
        events.on('mount:levelup', ({ type, level }) => {
            if (this.hud) this.hud.showMessage(`Montaria ${type} nível ${level}!`, 3, '#88ff44');
        });
        events.on('mount:stomp', ({ x, y, radius }) => {
            events.emit('player:aoe', { x, y, radius, damage: 30 });
        });
        events.on('mount:divebomb', ({ x, y, radius }) => {
            events.emit('player:aoe', { x, y, radius, damage: 45 });
        });
        events.on('mount:smash', ({ x, y }) => {
            events.emit('player:aoe', { x, y, radius: 60, damage: 50 });
        });
    }

    /**
     * Called from engine.update() every frame.
     * If mounted: updates mount physics and syncs player position.
     * Also gains XP from movement.
     */
    update(dt, player, input, cm) {
        if (!this.activeMount) return;

        const mount = this.activeMount;
        mount.update(dt, input, cm, this.statSystem);

        // Sync player to ride position
        const rp = mount.getRiderPos();
        player.x = rp.x;
        player.y = rp.y;
        player.vx = mount.vx;
        player.vy = mount.vy;
        player.facing = mount.facing;

        // XP from movement
        const moved = Math.abs(mount.vx) + Math.abs(mount.vy);
        if (moved > 20) mount.addXP(dt * 4);

        // Push stats to StatSystem
        this._pushStats(mount);
    }

    _pushStats(mount) {
        const s = mount.getStats();
        this.statSystem.setMountContrib({
            defenseBonus: s.defenseBonus || 0,
            moveBonus:    s.moveBonus    || 0,
            mineBonus:    s.mineBonus    || 0,
            jumpBonus:    s.jumpBonus    || 0,
            canFly:       s.canFly       || false,
        });
    }

    /**
     * Mount the given type if the player owns the saddle item.
     * Called when G is pressed and player has the corresponding item.
     */
    tryMount(mountType, player, inventory) {
        if (this.activeMount) {
            this.dismount(player);
            return;
        }

        const itemMap = { slime: 'slime_saddle', bat: 'batwing_mount', golem: 'golem_saddle' };
        const itemId = itemMap[mountType];
        if (!itemId || !inventory.hasItem(itemId)) {
            if (this.hud) this.hud.showMessage('Sem sela para montar!', 2, '#ff8888');
            return;
        }

        // Reuse existing entity so XP is preserved
        if (!this.ownedMounts.has(mountType)) {
            const m = this._createMount(mountType);
            this.ownedMounts.set(mountType, m);
        }

        const mount = this.ownedMounts.get(mountType);
        mount.x = player.x - mount.w * 0.5 + 8;
        mount.y = player.y - mount.riderOffsetY;
        mount.vx = 0;
        mount.vy = 0;
        this.activeMount = mount;
        player._skipUpdate = true;
        this._pushStats(mount);
        if (this.hud) this.hud.showMessage(`Montou ${mount.type}! [G] para desmontar`, 3, '#88ff44');
        events.emit('mount:mount', { type: mountType });
    }

    /**
     * Auto-mount the best mount available given player inventory.
     * Called from engine when G is pressed without specifying a type.
     */
    tryMountAuto(player, inventory) {
        if (this.activeMount) { this.dismount(player); return; }

        const order = ['golem', 'bat', 'slime'];
        const itemMap = { slime: 'slime_saddle', bat: 'batwing_mount', golem: 'golem_saddle' };
        for (const t of order) {
            if (inventory.hasItem(itemMap[t])) {
                this.tryMount(t, player, inventory);
                return;
            }
        }
        if (this.hud) this.hud.showMessage('Sem montaria! Fabrique uma sela.', 2, '#ff8888');
    }

    dismount(player) {
        if (!this.activeMount) return;
        player._skipUpdate = false;
        this.statSystem.clearMountContrib();
        this.activeMount = null;
        events.emit('mount:dismount', {});
        if (this.hud) this.hud.showMessage('Desmontado.', 1, '#aaaaaa');
    }

    _createMount(type) {
        if (type === 'slime') return new SlimeSaddle();
        if (type === 'bat')   return new BatWing();
        if (type === 'golem') return new GolemRider();
        return new SlimeSaddle();
    }

    draw(ctx, cam) {
        if (this.activeMount) {
            this.activeMount.draw(ctx, cam);
        }
    }

    isMounted() { return !!this.activeMount; }
}
