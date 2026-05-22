/**
 * CombatSystem — Mining, block placement, sword attacks, enemy contact/projectile damage.
 *
 * Tool specialisation rules:
 *   Axe    → organic blocks (wood/leaves/plank) at full speed; blocked on minerals.
 *   Pickaxe→ mineral blocks at full speed (tier-gated); organic blocks at 15% (emergency only).
 *
 * Swing animation is driven here: startSwing() is called once when a new block is targeted
 * and then re-fired every SWING_PERIOD seconds while mining continues.
 */

// ── Reach ─────────────────────────────────────────────────────────────────────
const MINE_REACH       = 5;   // blocks
const PLACE_REACH      = 5;   // blocks
const MINE_REACH_SQ    = MINE_REACH  * MINE_REACH;   // pre-squared for cheap comparisons
const PLACE_REACH_SQ   = PLACE_REACH * PLACE_REACH;

// ── Invulnerability ───────────────────────────────────────────────────────────
const INVULN_TIME = 0.5; // seconds of invulnerability after taking damage

// ── Tool kind constants ───────────────────────────────────────────────────────
// Must match the toolKind field in itemRegistry.js
const TOOL_KIND = Object.freeze({ PICKAXE: 'pickaxe', AXE: 'axe', SWORD: 'sword' });

// ── Block classification ──────────────────────────────────────────────────────
// ORGANIC_BLOCKS: best mined by Axe. Pickaxe works but at heavy penalty.
const ORGANIC_BLOCKS = new Set([BLOCK.WOOD, BLOCK.LEAVES, BLOCK.PLANK]);

// NON_MINED_BLOCKS: neither tool can break these (structural / decorative).
// Add new un-mineable block IDs here — no other code needs to change.
const NON_MINED_BLOCKS = new Set([
    BLOCK.AIR, BLOCK.BEDROCK, BLOCK.TORCH,
    BLOCK.COBWEB, BLOCK.WORKBENCH, BLOCK.FURNACE, BLOCK.ANVIL,
]);

/**
 * Returns true if blockId is an organic block (wood/leaves/plank).
 * Axe is the optimal tool; pickaxe works at heavy penalty.
 */
function _isOrganic(blockId) { return ORGANIC_BLOCKS.has(blockId); }

/**
 * Returns true if blockId is a mineral block.
 * Pickaxe is required; axe is fully blocked.
 * Any block not in ORGANIC_BLOCKS and not in NON_MINED_BLOCKS is mineral.
 */
function _isMineral(blockId) {
    return !NON_MINED_BLOCKS.has(blockId) && !ORGANIC_BLOCKS.has(blockId);
}

// ── Melee attack ──────────────────────────────────────────────────────────────
const MELEE_REACH_PX       = 50;   // pixel radius for sword hit detection
const ATTACK_ARC_TOLERANCE = 20;   // px leniency: hit counts even slightly behind facing dir
const KNOCKBACK_MULTIPLIER = 40;   // scales item.knockback to pixel-force units
const KNOCKBACK_FALLBACK   = 300;  // force used when item has no knockback value

// ── Mining animation ──────────────────────────────────────────────────────────
const SWING_PERIOD = 0.35; // seconds between swing-animation pulses while mining

// ── Projectile damage ─────────────────────────────────────────────────────────
const PROJECTILE_DAMAGE    = 10;   // base damage of all enemy projectiles
const PROJECTILE_HIT_SQ    = 15 * 15; // 15 px hit radius, pre-squared

// ── Tool speed multipliers ────────────────────────────────────────────────────
const AXE_ON_ORGANIC_MULT      = 1.5;   // axe specialisation bonus
const PICKAXE_ON_ORGANIC_MULT  = 0.15;  // heavy penalty: use axe instead


class CombatSystem {
    /**
     * @param {ChunkManager}    chunkManager
     * @param {InventorySystem} inventorySystem
     * @param {EntityManager}   entityManager
     * @param {LightingSystem}  lighting
     * @param {HUD}             hud
     */
    constructor(chunkManager, inventorySystem, entityManager, lighting, hud) {
        this.chunkManager = chunkManager;
        this.inventory    = inventorySystem;
        this.entities     = entityManager;
        this.lighting     = lighting;
        this.hud          = hud;

        // ── Mining state ──────────────────────────────────────────────────────
        this.miningTarget   = null; // { bx, by } — block currently being mined
        this.miningProgress = 0;    // accumulated progress (0 → miningRequired)
        this.miningRequired = 0;    // hardness of the current target block
        // wrongTool is reset to false at the top of update() every frame,
        // then set to true inside _handleMining when the tool is inappropriate.
        // This makes it an ephemeral, per-frame flag rather than sticky state.
        this.wrongTool      = false;
        this.wrongToolTimer = 0;    // rate-limits the "wrong tool" HUD message

        // ── Attack state ──────────────────────────────────────────────────────
        this.attackCooldown = 0;    // seconds until next attack is allowed
        this.attackArc      = 0;    // 1→0 during the visual sword-swing arc
        this.attackArcDir   = 1;    // +1 = right, -1 = left

        // ── Mining swing animation ────────────────────────────────────────────
        // Fires player.startSwing() immediately on target-lock, then every SWING_PERIOD s.
        this.miningSwingTimer = 0;

        // ── Status effects ────────────────────────────────────────────────────
        this.webSlowTimer  = 0;   // seconds remaining of web-slow debuff
        this.webSlowFactor = 0.4; // movement speed multiplier while webbed

        // ── Statistics ───────────────────────────────────────────────────────
        this.blocksMined = 0;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Main per-frame update. Handles all input-driven actions and passive ticks.
     * @param {number}       dt
     * @param {Player}       player
     * @param {InputManager} input
     */
    update(dt, player, input) {
        // Decay cooldown timers
        this.attackCooldown = Math.max(0, this.attackCooldown - dt);
        this.wrongToolTimer = Math.max(0, this.wrongToolTimer  - dt);

        // wrongTool is purely display state: re-evaluated each frame by _handleMining.
        this.wrongTool = false;

        // Player invulnerability
        if (player.invulnTimer > 0) player.invulnTimer -= dt;

        // Web slow debuff tick
        if (this.webSlowTimer > 0) {
            this.webSlowTimer -= dt;
            if (this.webSlowTimer <= 0) {
                this.webSlowTimer = 0;
                if (this.hud) this.hud.showMessage('O efeito de teia passou.', 2, '#aaaaff');
            }
        }

        // Sword arc animation decay
        if (this.attackArc > 0) {
            this.attackArc -= dt * 8;
            if (this.attackArc < 0) this.attackArc = 0;
        }

        const selectedItem = this.inventory.getSelectedItem();

        // Squared block distance — no sqrt needed; MINE_REACH_SQ / PLACE_REACH_SQ for comparisons
        const pbx  = Math.floor((player.x + player.w * 0.5) / BLOCK_SIZE);
        const pby  = Math.floor((player.y + player.h * 0.5) / BLOCK_SIZE);
        const mbx  = input.mouseBlockX;
        const mby  = input.mouseBlockY;
        const ddx  = mbx - pbx;
        const ddy  = mby - pby;
        const dist2 = ddx * ddx + ddy * ddy;

        // ── Left click: mine or attack ────────────────────────────────────────
        if (input.mouseDown.left && !this.inventory.isOpen) {
            if (selectedItem && selectedItem.type === ITEM_TYPE.TOOL && dist2 <= MINE_REACH_SQ) {
                this._handleMining(dt, mbx, mby, selectedItem, player);
            } else if (selectedItem && selectedItem.type === ITEM_TYPE.WEAPON) {
                this._handleAttack(player, input);
            }
        } else {
            // Stop mining when button released or cursor moved to a different block
            if (this.miningTarget &&
                (!input.mouseDown.left ||
                 this.miningTarget.bx !== mbx || this.miningTarget.by !== mby)) {
                this.miningTarget     = null;
                this.miningProgress   = 0;
                this.miningSwingTimer = 0;
            }
        }

        // ── Right click: place block or use item ──────────────────────────────
        if (input.mouseJustPressed.right && !this.inventory.isOpen) {
            if (dist2 <= PLACE_REACH_SQ) {
                this._handlePlacement(mbx, mby, player, selectedItem);
            }
        }

        // ── Passive damage checks ─────────────────────────────────────────────
        this._checkEnemyContact(player);
        this._checkEnemyProjectiles(player, dt);
    }

    /**
     * Returns the movement speed multiplier imposed by active status effects.
     * Consumed by the player physics each frame.
     */
    getSpeedModifier() {
        return this.webSlowTimer > 0 ? this.webSlowFactor : 1.0;
    }

    /**
     * Draw mining progress, sword arc, block cursor, and web indicator.
     * @param {CanvasRenderingContext2D} ctx
     * @param {Camera} camera
     * @param {Player} player
     */
    draw(ctx, camera, player) {
        this._drawMiningProgress(ctx, camera);
        this._drawSwordArc(ctx, camera, player);
        this._drawBlockCursor(ctx, camera);
        this._drawWebIndicator(ctx, camera, player);
    }

    // ── Private: action handlers ──────────────────────────────────────────────

    /**
     * Progressive block-mining with tool specialisation and tier checks.
     *
     * Speed modifiers applied to (tool.mineSpeed × statSystem.mineSpeed × dt × 5):
     *   Axe   on organic → × AXE_ON_ORGANIC_MULT      (+50%)
     *   Pick  on organic → × PICKAXE_ON_ORGANIC_MULT   (−85%, emergency only)
     *   Pick  on mineral → × 1.0 (base)
     *
     * @param {number} dt
     * @param {number} bx  - target block X
     * @param {number} by  - target block Y
     * @param {Object} tool - item definition with toolKind / mineSpeed / mineTier
     * @param {Player} player
     */
    _handleMining(dt, bx, by, tool, player) {
        const blockId = this.chunkManager.getBlockAt(bx, by);
        if (blockId === BLOCK.AIR || blockId === BLOCK.BEDROCK) return;

        const organic = _isOrganic(blockId);
        const mineral = _isMineral(blockId);

        // Guard: axe cannot mine mineral blocks
        if (tool.toolKind === TOOL_KIND.AXE && mineral) {
            this.wrongTool = true;
            if (this.wrongToolTimer <= 0) {
                if (this.hud) this.hud.showMessage('Use a Picareta para minérios!', 2.5, '#ffaa44');
                this.wrongToolTimer = 2.5;
            }
            this.miningTarget     = null;
            this.miningProgress   = 0;
            this.miningSwingTimer = 0;
            return;
        }

        // Guard: pickaxe tier too low for this block
        if (!canMineTier(tool, blockId)) {
            this.wrongTool = true;
            if (this.wrongToolTimer <= 0) {
                if (this.hud) this.hud.showMessage('Picareta muito fraca! Evolua as ferramentas.', 2.5, '#ff6666');
                this.wrongToolTimer = 2.5;
            }
            return;
        }

        // Lock onto new target block
        const newTarget = !this.miningTarget || this.miningTarget.bx !== bx || this.miningTarget.by !== by;
        if (newTarget) {
            this.miningTarget     = { bx, by };
            this.miningProgress   = 0;
            this.miningRequired   = BLOCK_HARDNESS[blockId] || 5;
            player.startSwing(tool.toolKind || TOOL_KIND.PICKAXE);
            this.miningSwingTimer = SWING_PERIOD;
        }

        // Repeat swing pulse every SWING_PERIOD while button held
        this.miningSwingTimer -= dt;
        if (this.miningSwingTimer <= 0) {
            player.startSwing(tool.toolKind || TOOL_KIND.PICKAXE);
            this.miningSwingTimer = SWING_PERIOD;
        }

        // Speed multiplier from tool specialisation
        let toolKindMod = 1.0;
        if (organic) {
            toolKindMod = (tool.toolKind === TOOL_KIND.AXE)
                ? AXE_ON_ORGANIC_MULT
                : PICKAXE_ON_ORGANIC_MULT;
        }

        const mineSpeedMult = window._statSystem ? window._statSystem.mineSpeed : 1;
        this.miningProgress += (tool.mineSpeed || 1) * toolKindMod * mineSpeedMult * dt * 5;

        // Audio tick (probabilistic to avoid every-frame sound)
        if (Math.random() < dt * 8 && window._audio) window._audio.playMine();

        // Block broken
        if (this.miningProgress >= this.miningRequired) {
            const dropId = BLOCK_TO_ITEM[blockId];
            if (dropId) {
                const cx = bx * BLOCK_SIZE + BLOCK_SIZE * 0.5;
                const cy = by * BLOCK_SIZE + BLOCK_SIZE * 0.5;
                this.entities.spawnDrop(dropId, 1, cx, cy, { scatter: 30 });
            }
            if (blockId === BLOCK.TORCH) this.lighting.removeTorch(bx, by);
            this.chunkManager.setBlockAt(bx, by, BLOCK.AIR);
            this.miningTarget   = null;
            this.miningProgress = 0;
            this.blocksMined++;
            events.emit('block:break', { bx, by, blockId });
        }
    }

    /**
     * Place a block or torch at the target tile.
     * Aborts if: wrong item type, tile occupied, would overlap the player.
     */
    _handlePlacement(bx, by, player, selectedItem) {
        if (!selectedItem) return;
        if (selectedItem.type !== ITEM_TYPE.BLOCK && selectedItem.type !== ITEM_TYPE.LIGHT) return;
        if (this.chunkManager.getBlockAt(bx, by) !== BLOCK.AIR) return;

        // Prevent placing a block inside the player's hitbox
        const px0 = Math.floor(player.x / BLOCK_SIZE);
        const py0 = Math.floor(player.y / BLOCK_SIZE);
        const px1 = Math.floor((player.x + player.w - 1) / BLOCK_SIZE);
        const py1 = Math.floor((player.y + player.h - 1) / BLOCK_SIZE);
        if (bx >= px0 && bx <= px1 && by >= py0 && by <= py1) return;

        const blockId = selectedItem.blockId;
        if (blockId === undefined) return;

        this.chunkManager.setBlockAt(bx, by, blockId);
        this.inventory.consumeSelected(1);
        events.emit('block:place', { bx, by, blockId, isLight: selectedItem.type === ITEM_TYPE.LIGHT });

        if (selectedItem.type === ITEM_TYPE.LIGHT) {
            this.lighting.addTorch(bx, by);
        }
    }

    /**
     * Melee sword attack: applies damage and knockback to all enemies in range.
     * Hit detection: circular radius (MELEE_REACH_PX) + directional arc tolerance.
     */
    _handleAttack(player, input) {
        if (this.attackCooldown > 0) return;
        const item = this.inventory.getSelectedItem();
        if (!item) return;

        this.attackCooldown = item.attackSpeed || 0.35;
        this.attackArc      = 1.0;
        this.attackArcDir   = player.facing;

        player.startSwing(TOOL_KIND.SWORD);
        if (window._audio) window._audio.playSwoosh();

        const { cx: pcx, cy: pcy } = player.getCenter();
        const reachSq = (MELEE_REACH_PX + 0) * (MELEE_REACH_PX + 0); // extended per enemy width below
        let hitAny = false;

        for (const e of this.entities.getEnemies()) {
            const { cx: ecx, cy: ecy } = e.getCenter();
            const dx = ecx - pcx;
            const dy = ecy - pcy;
            const threshold = MELEE_REACH_PX + e.w * 0.5;
            if (dx * dx + dy * dy < threshold * threshold) {
                // Directional arc: must be roughly in front of the player
                if ((this.attackArcDir > 0 && dx > -ATTACK_ARC_TOLERANCE) ||
                    (this.attackArcDir < 0 && dx <  ATTACK_ARC_TOLERANCE)) {
                    const knockDir = dx === 0 ? player.facing : Math.sign(dx);
                    e.takeDamage(item.damage, knockDir, -0.3,
                        item.knockback ? item.knockback * KNOCKBACK_MULTIPLIER : KNOCKBACK_FALLBACK);
                    hitAny = true;
                    events.emit('enemy:damage', { enemy: e, amount: item.damage, x: ecx, y: ecy, source: 'melee' });
                }
            }
        }
        if (hitAny) events.emit('combat:hit', { x: pcx, y: pcy });
    }

    /**
     * Checks whether any enemy projectile (laser, web, ember) has hit the player.
     * Uses squared-distance for the hit radius — no sqrt required.
     */
    _checkEnemyProjectiles(player, dt) {
        if (player.invulnTimer > 0 || player.isDead) return;

        const { cx: pcx, cy: pcy } = player.getCenter();

        for (const e of this.entities.getEnemies()) {
            if (!e.projectiles) continue;

            for (let i = e.projectiles.length - 1; i >= 0; i--) {
                const p  = e.projectiles[i];
                const dx = p.x - pcx;
                const dy = p.y - pcy;

                if (dx * dx + dy * dy < PROJECTILE_HIT_SQ) {
                    if (p.isWeb) {
                        this.webSlowTimer = 3;
                        if (this.hud) this.hud.showMessage('Preso em teia! Movimento lento.', 2, '#aaaaaa');
                        events.emit('player:webbed', { duration: 3 });
                    } else {
                        const finalDmg = window._statSystem
                            ? window._statSystem.applyDefense(PROJECTILE_DAMAGE)
                            : PROJECTILE_DAMAGE;
                        player.takeDamage(finalDmg);
                        this.hud.shake(0.15);
                        events.emit('player:damage', { amount: finalDmg, source: 'projectile', x: p.x, y: p.y });
                    }
                    e.projectiles.splice(i, 1);
                }
            }
        }
    }

    /**
     * AABB contact damage from enemies touching the player.
     * Knocks the player back and triggers invulnerability.
     */
    _checkEnemyContact(player) {
        if (player.invulnTimer > 0 || player.isDead) return;

        for (const e of this.entities.getEnemies()) {
            if (player.x < e.x + e.w && player.x + player.w > e.x &&
                player.y < e.y + e.h && player.y + player.h > e.y) {
                const finalDmg = window._statSystem
                    ? window._statSystem.applyDefense(e.damage)
                    : e.damage;
                player.takeDamage(finalDmg);
                this.hud.shake(0.2);
                const dx = player.x - e.x;
                player.vx = Math.sign(dx) * 250;
                player.vy = -200;
                events.emit('player:damage', {
                    amount: finalDmg, source: 'contact',
                    x: player.x + player.w * 0.5, y: player.y + player.h * 0.3,
                });
                break; // one hit per frame
            }
        }
    }

    // ── Private: draw helpers ─────────────────────────────────────────────────

    /** Yellow progress bar above the block being mined + darkening crack overlay. */
    _drawMiningProgress(ctx, camera) {
        if (!this.miningTarget || this.miningRequired <= 0) return;
        const { bx, by } = this.miningTarget;
        const { sx, sy } = camera.worldToScreen(bx * BLOCK_SIZE, by * BLOCK_SIZE);
        const progress = this.miningProgress / this.miningRequired;

        ctx.fillStyle = `rgba(0,0,0,${progress * 0.5})`;
        ctx.fillRect(sx, sy, BLOCK_SIZE, BLOCK_SIZE);

        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(sx, sy - 6, BLOCK_SIZE, 4);
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(sx, sy - 6, BLOCK_SIZE * progress, 4);
    }

    /** Animated sword-blade line drawn at the player's shoulder during an attack. */
    _drawSwordArc(ctx, camera, player) {
        if (this.attackArc <= 0) return;
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

    /**
     * Highlights the hovered block.
     * White outline = tool OK; red fill + X = wrong tool for this block type.
     */
    _drawBlockCursor(ctx, camera) {
        if (this.inventory.isOpen) return;
        const mouseWorld = camera.screenToWorld(
            window._input ? window._input.mouseScreenX : 0,
            window._input ? window._input.mouseScreenY : 0);
        const hbx = Math.floor(mouseWorld.wx / BLOCK_SIZE);
        const hby = Math.floor(mouseWorld.wy / BLOCK_SIZE);
        const { sx, sy } = camera.worldToScreen(hbx * BLOCK_SIZE, hby * BLOCK_SIZE);

        if (this.wrongTool) {
            ctx.strokeStyle = 'rgba(255,80,80,0.85)';
            ctx.lineWidth = 2;
            ctx.strokeRect(sx, sy, BLOCK_SIZE, BLOCK_SIZE);
            ctx.fillStyle = 'rgba(255,60,60,0.55)';
            ctx.fillRect(sx, sy, BLOCK_SIZE, BLOCK_SIZE);
            ctx.strokeStyle = '#ff4444';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(sx + 3, sy + 3);                         ctx.lineTo(sx + BLOCK_SIZE - 3, sy + BLOCK_SIZE - 3);
            ctx.moveTo(sx + BLOCK_SIZE - 3, sy + 3);            ctx.lineTo(sx + 3, sy + BLOCK_SIZE - 3);
            ctx.stroke();
        } else {
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(sx, sy, BLOCK_SIZE, BLOCK_SIZE);
        }
    }

    /** "TEIA" text above the player while the web-slow debuff is active. */
    _drawWebIndicator(ctx, camera, player) {
        if (this.webSlowTimer <= 0) return;
        const { sx, sy } = camera.worldToScreen(player.x, player.y - 10);
        ctx.fillStyle = 'rgba(200,200,200,0.7)';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('TEIA', sx + player.w * 0.5, sy);
        ctx.textAlign = 'left';
    }
}
