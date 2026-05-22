/**
 * CombatSystem — Handles mining, building, sword attacks, and player-enemy contact damage.
 */

const MINE_REACH = 5; // blocks
const PLACE_REACH = 5;
const INVULN_TIME = 0.5; // seconds after taking damage

class CombatSystem {
    constructor(chunkManager, inventorySystem, entityManager, lighting, hud) {
        this.chunkManager = chunkManager;
        this.inventory = inventorySystem;
        this.entities = entityManager;
        this.lighting = lighting;
        this.hud = hud;

        // Mining state
        this.miningTarget = null; // { bx, by }
        this.miningProgress = 0;
        this.miningRequired = 0;

        // Attack state
        this.attackCooldown = 0;
        this.attackArc = 0; // current visual arc angle (0 = no attack)
        this.attackArcDir = 1;

        // Status effects
        this.webSlowTimer = 0; // seconds of slow movement
        this.webSlowFactor = 0.4; // speed multiplier when slowed

        // Stats
        this.blocksMined = 0;
    }

    /**
     * Main update: processes mouse interactions, attacks, contact damage.
     */
    update(dt, player, input) {
        this.attackCooldown = Math.max(0, this.attackCooldown - dt);

        // Player invulnerability timer
        if (player.invulnTimer > 0) player.invulnTimer -= dt;

        // Web slow effect
        if (this.webSlowTimer > 0) {
            this.webSlowTimer -= dt;
            if (this.webSlowTimer <= 0) {
                this.webSlowTimer = 0;
                if (this.hud) this.hud.showMessage('O efeito de teia passou.', 2, '#aaaaff');
            }
        }

        // Attack arc animation
        if (this.attackArc > 0) {
            this.attackArc -= dt * 8;
            if (this.attackArc < 0) this.attackArc = 0;
        }

        const selectedItem = this.inventory.getSelectedItem();
        const pbx = Math.floor((player.x + player.w * 0.5) / BLOCK_SIZE);
        const pby = Math.floor((player.y + player.h * 0.5) / BLOCK_SIZE);
        const mbx = input.mouseBlockX;
        const mby = input.mouseBlockY;
        const dist = Math.sqrt((mbx - pbx) ** 2 + (mby - pby) ** 2);

        // --- Left Click ---
        if (input.mouseDown.left && !this.inventory.isOpen) {
            if (selectedItem && selectedItem.type === ITEM_TYPE.TOOL && dist <= MINE_REACH) {
                this._handleMining(dt, mbx, mby, selectedItem);
            } else if (selectedItem && selectedItem.type === ITEM_TYPE.WEAPON) {
                this._handleAttack(player, input);
            }
        } else {
            // Reset mining if not holding left click or target changed
            if (this.miningTarget && (!input.mouseDown.left ||
                this.miningTarget.bx !== mbx || this.miningTarget.by !== mby)) {
                this.miningTarget = null;
                this.miningProgress = 0;
            }
        }

        // --- Right Click (place block / torch) ---
        if (input.mouseJustPressed.right && !this.inventory.isOpen) {
            if (dist <= PLACE_REACH) {
                this._handlePlacement(mbx, mby, player, selectedItem);
            }
        }

        // --- Contact damage from enemies ---
        this._checkEnemyContact(player);

        // --- Enemy projectiles (lasers, webs, embers) ---
        this._checkEnemyProjectiles(player, dt);
    }

    /**
     * Mine a block progressively.
     */
    _handleMining(dt, bx, by, tool) {
        const blockId = this.chunkManager.getBlockAt(bx, by);
        if (blockId === BLOCK.AIR) return;
        if (blockId === BLOCK.BEDROCK) return;

        // Tier check: pickaxe must meet block's mining tier
        if (!canMineTier(tool, blockId)) {
            if (this.hud && Math.random() < dt * 2) {
                this.hud.showMessage('Picareta muito fraca para este bloco!', 2, '#ff8888');
            }
            return;
        }

        // Start or continue mining
        if (!this.miningTarget || this.miningTarget.bx !== bx || this.miningTarget.by !== by) {
            this.miningTarget = { bx, by };
            this.miningProgress = 0;
            this.miningRequired = BLOCK_HARDNESS[blockId] || 5;
        }

        // Tool kind bonus: axes mine wood faster, pickaxes mine stone faster
        let toolKindMod = 1.0;
        const isWoodBlock = (blockId === BLOCK.WOOD || blockId === BLOCK.LEAVES);
        if (isWoodBlock && tool.toolKind === 'axe') {
            toolKindMod = 1.5; // axe is 50% faster on wood
        } else if (isWoodBlock && tool.toolKind !== 'axe') {
            toolKindMod = 0.4; // pickaxe is slow on wood
        } else if (!isWoodBlock && tool.toolKind === 'axe') {
            toolKindMod = 0.4; // axe is slow on non-wood
        }
        const equipMineBonus = window._equipment ? window._equipment.getMineSpeedMultiplier() : 1;
        this.miningProgress += (tool.mineSpeed || 1) * toolKindMod * equipMineBonus * dt * 5;

        // Mining tick sound
        if (Math.random() < dt * 8 && window._audio) window._audio.playMine();

        if (this.miningProgress >= this.miningRequired) {
            // Break block → spawn drop físico (em vez de adicionar direto ao inventário)
            const dropId = BLOCK_TO_ITEM[blockId];
            if (dropId) {
                const cx = bx * BLOCK_SIZE + BLOCK_SIZE * 0.5;
                const cy = by * BLOCK_SIZE + BLOCK_SIZE * 0.5;
                this.entities.spawnDrop(dropId, 1, cx, cy, { scatter: 30 });
            }
            // If it was a torch, remove from lighting
            if (blockId === BLOCK.TORCH) {
                this.lighting.removeTorch(bx, by);
            }
            // Particles
            if (window._particles) {
                const color = BLOCK_COLORS[blockId] || '#666';
                window._particles.emitBlockBreak(bx * BLOCK_SIZE, by * BLOCK_SIZE, color);
            }
            // Audio
            if (window._audio) window._audio.playBlockBreak();

            this.chunkManager.setBlockAt(bx, by, BLOCK.AIR);
            this.miningTarget = null;
            this.miningProgress = 0;
            this.blocksMined++;
        }
    }

    /**
     * Place a block or torch.
     */
    _handlePlacement(bx, by, player, selectedItem) {
        if (!selectedItem) return;
        if (selectedItem.type !== ITEM_TYPE.BLOCK && selectedItem.type !== ITEM_TYPE.LIGHT) return;

        // Can't place on non-air
        if (this.chunkManager.getBlockAt(bx, by) !== BLOCK.AIR) return;

        // Can't bury the player
        const px0 = Math.floor(player.x / BLOCK_SIZE);
        const py0 = Math.floor(player.y / BLOCK_SIZE);
        const px1 = Math.floor((player.x + player.w - 1) / BLOCK_SIZE);
        const py1 = Math.floor((player.y + player.h - 1) / BLOCK_SIZE);
        if (bx >= px0 && bx <= px1 && by >= py0 && by <= py1) return;

        const blockId = selectedItem.blockId;
        if (blockId === undefined) return;

        this.chunkManager.setBlockAt(bx, by, blockId);
        this.inventory.consumeSelected(1);

        // Audio
        if (window._audio) window._audio.playPlace();

        // If torch, register light
        if (selectedItem.type === ITEM_TYPE.LIGHT) {
            this.lighting.addTorch(bx, by);
        }
    }

    /**
     * Sword attack.
     */
    _handleAttack(player, input) {
        if (this.attackCooldown > 0) return;
        const item = this.inventory.getSelectedItem();
        if (!item) return;

        this.attackCooldown = item.attackSpeed || 0.35;
        this.attackArc = 1.0;
        this.attackArcDir = player.facing;

        // Swing animation + swoosh audio
        player.startSwing();
        if (window._audio) window._audio.playSwoosh();

        // Check if any enemies are in melee range
        const reach = 50; // pixels
        const pcx = player.x + player.w * 0.5;
        const pcy = player.y + player.h * 0.5;
        let hitAny = false;

        for (const e of this.entities.getEnemies()) {
            const ecx = e.x + e.w * 0.5;
            const ecy = e.y + e.h * 0.5;
            const dx = ecx - pcx;
            const dy = ecy - pcy;
            const d = Math.sqrt(dx * dx + dy * dy);

            // Within reach and in facing direction
            if (d < reach + e.w * 0.5) {
                if ((this.attackArcDir > 0 && dx > -20) || (this.attackArcDir < 0 && dx < 20)) {
                    const knockDir = dx === 0 ? player.facing : Math.sign(dx);
                    e.takeDamage(item.damage, knockDir, -0.3, item.knockback * 40 || 300);
                    hitAny = true;
                    // Hit particles
                    if (window._particles) window._particles.emitHitSparks(ecx, ecy);
                }
            }
        }
        if (hitAny && window._audio) window._audio.playHit();
    }

    /**
     * Check enemy projectiles (lasers, webs, embers) hitting player.
     */
    _checkEnemyProjectiles(player, dt) {
        if (player.invulnTimer > 0 || player.isDead) return;

        const pcx = player.x + player.w * 0.5;
        const pcy = player.y + player.h * 0.5;

        for (const e of this.entities.getEnemies()) {
            if (!e.projectiles) continue;

            for (let i = e.projectiles.length - 1; i >= 0; i--) {
                const p = e.projectiles[i];
                const dx = p.x - pcx;
                const dy = p.y - pcy;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Hit detection
                if (dist < 15) {
                    if (p.isWeb) {
                        // Web slow effect
                        this.webSlowTimer = 3;
                        if (this.hud) this.hud.showMessage('Preso em teia! Movimento lento.', 2, '#aaaaaa');
                        if (window._audio) window._audio.playHit();
                    } else {
                        // Damage projectile (apply defense)
                        const projRaw = 10;
                        const eqP = window._equipment;
                        const bDef = window._buffs ? window._buffs._getDefenseBonus() : 0;
                        const tDef = (eqP ? eqP.totalDefense : 0) + bDef;
                        player.takeDamage(Math.max(1, Math.round(projRaw - tDef * 0.5)));
                        this.hud.shake(0.15);
                        if (window._audio) window._audio.playDamage();
                        if (window._particles) window._particles.emitPlayerDamage(p.x, p.y);
                    }
                    e.projectiles.splice(i, 1);
                }
            }
        }
    }

    /**
     * Get current movement speed modifier (for web slow effect).
     */
    getSpeedModifier() {
        return this.webSlowTimer > 0 ? this.webSlowFactor : 1.0;
    }

    /**
     * Check contact damage between player and enemies.
     */
    _checkEnemyContact(player) {
        if (player.invulnTimer > 0 || player.isDead) return;

        for (const e of this.entities.getEnemies()) {
            // AABB intersection
            if (player.x < e.x + e.w && player.x + player.w > e.x &&
                player.y < e.y + e.h && player.y + player.h > e.y) {
                const rawDmg = e.damage;
                const eq = window._equipment;
                const buffDef = window._buffs ? window._buffs._getDefenseBonus() : 0;
                const totalDef = (eq ? eq.totalDefense : 0) + buffDef;
                const finalDmg = Math.max(1, Math.round(rawDmg - totalDef * 0.5));
                player.takeDamage(finalDmg);
                this.hud.shake(0.2);
                // Audio + particles
                if (window._audio) window._audio.playDamage();
                if (window._particles) window._particles.emitPlayerDamage(player.x + player.w * 0.5, player.y + player.h * 0.3);
                // Knockback player away from enemy
                const dx = player.x - e.x;
                player.vx = Math.sign(dx) * 250;
                player.vy = -200;
                break;
            }
        }
    }

    /**
     * Draw mining progress indicator and attack arc.
     */
    draw(ctx, camera, player) {
        // Mining progress bar on targeted block
        if (this.miningTarget && this.miningRequired > 0) {
            const { bx, by } = this.miningTarget;
            const wx = bx * BLOCK_SIZE;
            const wy = by * BLOCK_SIZE;
            const { sx, sy } = camera.worldToScreen(wx, wy);

            const progress = this.miningProgress / this.miningRequired;

            // Crack overlay
            ctx.fillStyle = `rgba(0,0,0,${progress * 0.5})`;
            ctx.fillRect(sx, sy, BLOCK_SIZE, BLOCK_SIZE);

            // Progress bar
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(sx, sy - 6, BLOCK_SIZE, 4);
            ctx.fillStyle = '#ffcc00';
            ctx.fillRect(sx, sy - 6, BLOCK_SIZE * progress, 4);
        }

        // Sword attack arc
        if (this.attackArc > 0) {
            const pcx = player.x + player.w * 0.5;
            const pcy = player.y + player.h * 0.3;
            const { sx, sy } = camera.worldToScreen(pcx, pcy);

            ctx.save();
            ctx.translate(sx, sy);
            const angle = this.attackArcDir > 0
                ? -Math.PI * 0.3 + (1 - this.attackArc) * Math.PI * 0.8
                : Math.PI * 1.3 - (1 - this.attackArc) * Math.PI * 0.8;

            ctx.rotate(angle);
            ctx.fillStyle = 'rgba(200,200,220,0.8)';
            ctx.fillRect(0, -2, 35, 4);
            ctx.fillStyle = '#aaa';
            ctx.fillRect(30, -3, 6, 6);
            ctx.restore();
        }

        // Block highlight (cursor)
        if (!this.inventory.isOpen) {
            const hbx = Math.floor(camera.screenToWorld(
                window._input ? window._input.mouseScreenX : 0,
                window._input ? window._input.mouseScreenY : 0).wx / BLOCK_SIZE);
            const hby = Math.floor(camera.screenToWorld(
                window._input ? window._input.mouseScreenX : 0,
                window._input ? window._input.mouseScreenY : 0).wy / BLOCK_SIZE);
            const { sx, sy } = camera.worldToScreen(hbx * BLOCK_SIZE, hby * BLOCK_SIZE);
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(sx, sy, BLOCK_SIZE, BLOCK_SIZE);
        }

        // Web slow indicator
        if (this.webSlowTimer > 0) {
            const { sx, sy } = camera.worldToScreen(player.x, player.y - 10);
            ctx.fillStyle = 'rgba(200,200,200,0.7)';
            ctx.font = '12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('TEIA', sx + player.w * 0.5, sy);
            ctx.textAlign = 'left';
        }
    }
}
