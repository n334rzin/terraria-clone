/**
 * CombatSystem — Handles mining, building, sword attacks, and player-enemy contact damage.
 */

const MINE_REACH = 5; // blocks
const PLACE_REACH = 5;
const INVULN_TIME = 0.5; // seconds after taking damage

// Blocos orgânicos: exigem MACHADO para minerar com eficiência máxima.
// Picareta consegue minerar madeira, mas com penalidade severa.
const ORGANIC_BLOCKS = new Set([BLOCK.WOOD, BLOCK.LEAVES, BLOCK.PLANK]);

// Blocos minerais: MACHADO não consegue minerar — só picareta.
// (tudo que não está em ORGANIC_BLOCKS)
function _isOrganic(blockId) { return ORGANIC_BLOCKS.has(blockId); }
function _isMineral(blockId) {
    return !ORGANIC_BLOCKS.has(blockId)
        && blockId !== BLOCK.AIR
        && blockId !== BLOCK.BEDROCK
        && blockId !== BLOCK.TORCH
        && blockId !== BLOCK.COBWEB
        && blockId !== BLOCK.WORKBENCH
        && blockId !== BLOCK.FURNACE
        && blockId !== BLOCK.ANVIL;
}

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
        this.wrongTool = false;        // true quando ferramenta errada está selecionada
        this.wrongToolTimer = 0;       // cooldown para repetir a mensagem

        // Attack state
        this.attackCooldown = 0;
        this.attackArc = 0; // current visual arc angle (0 = no attack)
        this.attackArcDir = 1;

        // Mining swing animation timer — triggers player.startSwing() periodically
        this.miningSwingTimer = 0;

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
        this.attackCooldown  = Math.max(0, this.attackCooldown - dt);
        this.wrongToolTimer  = Math.max(0, this.wrongToolTimer  - dt);
        this.wrongTool = false; // reset; será reavaliado abaixo

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
                this._handleMining(dt, mbx, mby, selectedItem, player);
            } else if (selectedItem && selectedItem.type === ITEM_TYPE.WEAPON) {
                this._handleAttack(player, input);
            }
        } else {
            // Reset mining if not holding left click or target changed
            if (this.miningTarget && (!input.mouseDown.left ||
                this.miningTarget.bx !== mbx || this.miningTarget.by !== mby)) {
                this.miningTarget = null;
                this.miningProgress = 0;
                this.miningSwingTimer = 0;
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
     * Especialização de ferramentas:
     *   • Machado  → orgânicos (madeira/folhas/tábua) em velocidade total; minerais BLOQUEADO.
     *   • Picareta → minerais em velocidade total (escalado por tier); orgânicos a 15%.
     */
    _handleMining(dt, bx, by, tool, player) {
        const blockId = this.chunkManager.getBlockAt(bx, by);
        if (blockId === BLOCK.AIR) return;
        if (blockId === BLOCK.BEDROCK) return;

        const organic = _isOrganic(blockId);
        const mineral = _isMineral(blockId);

        // ── Verificação de tipo de ferramenta ──────────────────────────────
        if (tool.toolKind === 'axe' && mineral) {
            // Machado em pedra/minério: bloqueado completamente
            this.wrongTool = true;
            if (this.wrongToolTimer <= 0) {
                if (this.hud) this.hud.showMessage('Use a Picareta para minérios!', 2.5, '#ffaa44');
                this.wrongToolTimer = 2.5;
            }
            this.miningTarget = null;
            this.miningProgress = 0;
            this.miningSwingTimer = 0;
            return;
        }

        // ── Verificação de tier (picareta muito fraca) ─────────────────────
        if (!canMineTier(tool, blockId)) {
            this.wrongTool = true;
            if (this.wrongToolTimer <= 0) {
                if (this.hud) this.hud.showMessage('Picareta muito fraca! Evolua as ferramentas.', 2.5, '#ff6666');
                this.wrongToolTimer = 2.5;
            }
            return;
        }

        // ── Inicia / continua mineração ────────────────────────────────────
        const newTarget = !this.miningTarget || this.miningTarget.bx !== bx || this.miningTarget.by !== by;
        if (newTarget) {
            this.miningTarget = { bx, by };
            this.miningProgress = 0;
            this.miningRequired = BLOCK_HARDNESS[blockId] || 5;
            // Dispara swing imediatamente ao começar a minerar
            if (player) player.startSwing(tool.toolKind || 'pickaxe');
            this.miningSwingTimer = 0.35;
        }

        // Mantém a animação de swing enquanto minera (repete a cada ~0.35 s)
        if (player) {
            this.miningSwingTimer -= dt;
            if (this.miningSwingTimer <= 0) {
                player.startSwing(tool.toolKind || 'pickaxe');
                this.miningSwingTimer = 0.35;
            }
        }

        // Multiplicador por tipo de ferramenta:
        //   • Machado em orgânico  → +50% (especialização)
        //   • Picareta em orgânico → −85% (desincentivo, mas possível em emergência)
        //   • Picareta em mineral  → normal (base 1.0)
        let toolKindMod = 1.0;
        if (organic) {
            toolKindMod = (tool.toolKind === 'axe') ? 1.5 : 0.15;
        }

        const mineSpeedMult = window._statSystem ? window._statSystem.mineSpeed : 1;
        this.miningProgress += (tool.mineSpeed || 1) * toolKindMod * mineSpeedMult * dt * 5;

        // Som de mineração
        if (Math.random() < dt * 8 && window._audio) window._audio.playMine();

        if (this.miningProgress >= this.miningRequired) {
            const dropId = BLOCK_TO_ITEM[blockId];
            if (dropId) {
                const cx = bx * BLOCK_SIZE + BLOCK_SIZE * 0.5;
                const cy = by * BLOCK_SIZE + BLOCK_SIZE * 0.5;
                this.entities.spawnDrop(dropId, 1, cx, cy, { scatter: 30 });
            }
            if (blockId === BLOCK.TORCH) this.lighting.removeTorch(bx, by);
            this.chunkManager.setBlockAt(bx, by, BLOCK.AIR);
            this.miningTarget = null;
            this.miningProgress = 0;
            this.blocksMined++;
            events.emit('block:break', { bx, by, blockId });
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
        events.emit('block:place', { bx, by, blockId, isLight: selectedItem.type === ITEM_TYPE.LIGHT });

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
        player.startSwing('sword');
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
                    events.emit('enemy:damage', { enemy: e, amount: item.damage, x: ecx, y: ecy, source: 'melee' });
                }
            }
        }
        if (hitAny) events.emit('combat:hit', { x: pcx, y: pcy });
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
                        this.webSlowTimer = 3;
                        if (this.hud) this.hud.showMessage('Preso em teia! Movimento lento.', 2, '#aaaaaa');
                        events.emit('player:webbed', { duration: 3 });
                    } else {
                        const finalDmg = window._statSystem
                            ? window._statSystem.applyDefense(10)
                            : Math.max(1, 10);
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
                const finalDmg = window._statSystem
                    ? window._statSystem.applyDefense(e.damage)
                    : Math.max(1, e.damage);
                player.takeDamage(finalDmg);
                this.hud.shake(0.2);
                const dx = player.x - e.x;
                player.vx = Math.sign(dx) * 250;
                player.vy = -200;
                events.emit('player:damage', {
                    amount: finalDmg, source: 'contact',
                    x: player.x + player.w * 0.5, y: player.y + player.h * 0.3,
                });
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

        // Block highlight (cursor) — cor muda conforme ferramenta correta/errada
        if (!this.inventory.isOpen) {
            const mouseWorld = camera.screenToWorld(
                window._input ? window._input.mouseScreenX : 0,
                window._input ? window._input.mouseScreenY : 0);
            const hbx = Math.floor(mouseWorld.wx / BLOCK_SIZE);
            const hby = Math.floor(mouseWorld.wy / BLOCK_SIZE);
            const { sx, sy } = camera.worldToScreen(hbx * BLOCK_SIZE, hby * BLOCK_SIZE);

            if (this.wrongTool) {
                // Cursor vermelho com X → ferramenta errada
                ctx.strokeStyle = 'rgba(255,80,80,0.85)';
                ctx.lineWidth = 2;
                ctx.strokeRect(sx, sy, BLOCK_SIZE, BLOCK_SIZE);
                // X vermelho no bloco
                ctx.fillStyle = 'rgba(255,60,60,0.55)';
                ctx.fillRect(sx, sy, BLOCK_SIZE, BLOCK_SIZE);
                ctx.strokeStyle = '#ff4444';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(sx + 3, sy + 3); ctx.lineTo(sx + BLOCK_SIZE - 3, sy + BLOCK_SIZE - 3);
                ctx.moveTo(sx + BLOCK_SIZE - 3, sy + 3); ctx.lineTo(sx + 3, sy + BLOCK_SIZE - 3);
                ctx.stroke();
            } else {
                ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                ctx.lineWidth = 1;
                ctx.strokeRect(sx, sy, BLOCK_SIZE, BLOCK_SIZE);
            }
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
