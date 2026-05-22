/**
 * NPC System — Guide, Engineer, Scrap Merchant with context-aware dialogue + combat AI.
 * NPCs walk around the village, fight nearby enemies, and open rich lore conversations.
 */

const NPC_TYPE = Object.freeze({ GUIDE: 0, ENGINEER: 1, SCRAP_MERCHANT: 2 });
const NPC_STATE = Object.freeze({ IDLE: 0, COMBAT: 1, WANDER: 2 });

// ---------------------------------------------------------------------------
// Base NPC
// ---------------------------------------------------------------------------
class BaseNPC {
    constructor(x, y, type, chunkManager, lighting) {
        this.x = x; this.y = y;
        this.w = 14; this.h = 30;
        this.vx = 0; this.vy = 0;
        this.onGround = false;
        this.facing = 1;

        this.type = type;
        this.hp = 200; this.maxHp = 200;
        this.invulnTimer = 0;
        this.alive = true;
        this.flashTimer = 0;

        this.state = NPC_STATE.IDLE;
        this.stateTimer = 0;
        this.targetEnemy = null;
        this.attackCooldown = 0;
        this.wanderDir = 1;
        this.wanderTimer = 0;

        this.chunkManager = chunkManager;
        this.lighting = lighting;

        // AI params
        this.visionRange = 300;
        this.attackRange = 40;
        this.attackDamage = 25;
        this.moveSpeed = 80;
        this.jumpForce = -450;

        // Dialogue
        this.dialogueTree = null;
        this.portraitColor = '#aaa';
        this.name = 'NPC';
        this.interactRange = 50;
    }

    update(dt, player, enemies) {
        if (!this.alive) return;
        this.invulnTimer = Math.max(0, this.invulnTimer - dt);
        this.flashTimer = Math.max(0, this.flashTimer - dt);
        this.attackCooldown = Math.max(0, this.attackCooldown - dt);
        this.stateTimer += dt;
        this.wanderTimer -= dt;

        // Find threat
        const threat = this._findClosestEnemy(enemies);
        if (threat && this._distTo(threat) < this.visionRange) {
            this.state = NPC_STATE.COMBAT;
            this.targetEnemy = threat;
        } else if (!threat) {
            this.state = NPC_STATE.WANDER;
            this.targetEnemy = null;
        }

        switch (this.state) {
            case NPC_STATE.COMBAT: this._doCombat(dt); break;
            case NPC_STATE.WANDER: this._doWander(dt); break;
            default: this.vx *= 0.9; break;
        }

        this._applyPhysics(dt);
    }

    _doCombat(dt) {
        if (!this.targetEnemy || this.targetEnemy.isDead()) {
            this.state = NPC_STATE.IDLE;
            return;
        }
        const e = this.targetEnemy;
        const dx = (e.x + e.w * 0.5) - (this.x + this.w * 0.5);
        this.facing = Math.sign(dx) || 1;
        if (Math.abs(dx) > this.attackRange) {
            this.vx = this.facing * this.moveSpeed;
            this._tryJumpIfBlocked();
        } else {
            this.vx = 0;
            if (this.attackCooldown <= 0) {
                e.takeDamage(this.attackDamage, this.facing, -0.3, 200);
                this.attackCooldown = 0.6;
                if (window._audio) window._audio.playHit();
                if (window._particles) {
                    window._particles.emitHitSparks(e.x + e.w * 0.5, e.y + e.h * 0.3);
                }
            }
        }
    }

    _doWander(dt) {
        if (this.wanderTimer <= 0) {
            this.wanderDir = Math.random() > 0.5 ? 1 : -1;
            this.wanderTimer = 2 + Math.random() * 3;
        }
        this.facing = this.wanderDir;
        this.vx = this.wanderDir * this.moveSpeed * 0.5;
        this._tryJumpIfBlocked();
    }

    _applyPhysics(dt) {
        this.vy += 1200 * dt; if (this.vy > 700) this.vy = 700;
        this.onGround = false;
        this.y += this.vy * dt; this._resolveY();
        this.x += this.vx * dt; this._resolveX();
        this.vx *= 0.92;
    }

    _isSolid(bx, by) {
        const id = this.chunkManager.getBlockAt(bx, by);
        return id !== BLOCK.AIR && id !== BLOCK.TORCH && id !== BLOCK.COBWEB;
    }

    _resolveY() {
        const x0 = Math.floor(this.x / BLOCK_SIZE);
        const x1 = Math.floor((this.x + this.w - 1) / BLOCK_SIZE);
        const y1 = Math.floor((this.y + this.h - 1) / BLOCK_SIZE);
        for (let bx = x0; bx <= x1; bx++) {
            if (this._isSolid(bx, y1)) {
                this.y = y1 * BLOCK_SIZE - this.h;
                this.vy = 0;
                this.onGround = true;
                return;
            }
        }
    }

    _resolveX() {
        const y0 = Math.floor(this.y / BLOCK_SIZE);
        const y1 = Math.floor((this.y + this.h - 1) / BLOCK_SIZE);
        const cx = this.vx > 0 ? Math.floor((this.x + this.w) / BLOCK_SIZE) : Math.floor((this.x - 1) / BLOCK_SIZE);
        for (let by = y0; by <= y1; by++) {
            if (this._isSolid(cx, by)) {
                if (this.vx > 0) this.x = cx * BLOCK_SIZE - this.w;
                else this.x = (cx + 1) * BLOCK_SIZE;
                this.vx = 0;
                return;
            }
        }
    }

    _tryJumpIfBlocked() {
        if (!this.onGround) return;
        const fx = this.facing > 0 ? Math.floor((this.x + this.w + 2) / BLOCK_SIZE) : Math.floor((this.x - 2) / BLOCK_SIZE);
        const fy = Math.floor((this.y + this.h - 1) / BLOCK_SIZE);
        if (this._isSolid(fx, fy) || this._isSolid(fx, fy - 1)) this.vy = this.jumpForce;
    }

    takeDamage(amount) {
        if (this.invulnTimer > 0) return;
        this.hp -= amount;
        this.invulnTimer = 0.5;
        this.flashTimer = 0.15;
        if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    }

    _findClosestEnemy(enemies) {
        let closest = null, minDist = Infinity;
        for (const e of enemies) {
            if (e.isDead()) continue;
            const d = this._distTo(e);
            if (d < minDist) { minDist = d; closest = e; }
        }
        return closest;
    }

    _distTo(e) {
        const dx = (e.x + e.w * 0.5) - (this.x + this.w * 0.5);
        const dy = (e.y + e.h * 0.5) - (this.y + this.h * 0.5);
        return Math.sqrt(dx * dx + dy * dy);
    }

    canInteract(player) {
        const dx = Math.abs(player.x - this.x);
        const dy = Math.abs(player.y - this.y);
        return dx < this.interactRange && dy < this.interactRange;
    }

    draw(ctx, camera, player) {
        if (!this.alive) return;
        const { sx, sy } = camera.worldToScreen(this.x, this.y);
        const rx = sx | 0, ry = sy | 0;
        if (this.invulnTimer > 0 && Math.floor(this.invulnTimer * 12) % 2 === 0) return;

        // Outline
        ctx.fillStyle = '#000';
        ctx.fillRect(rx - 1, ry - 1, this.w + 2, this.h + 2);

        // Head
        ctx.fillStyle = this.flashTimer > 0 ? '#ff6666' : '#e8c07a';
        ctx.fillRect(rx, ry, this.w, 8);

        // Body
        ctx.fillStyle = this.flashTimer > 0 ? '#ff4444' : this.portraitColor;
        ctx.fillRect(rx, ry + 8, this.w, 12);

        // Legs
        ctx.fillStyle = '#3a3a5a';
        ctx.fillRect(rx, ry + 20, 6, 10);
        ctx.fillRect(rx + this.w - 6, ry + 20, 6, 10);

        // Eyes
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(rx + (this.facing > 0 ? 9 : 2), ry + 4, 3, 3);

        // HP bar
        if (this.hp < this.maxHp) {
            ctx.fillStyle = '#300';
            ctx.fillRect(rx - 3, ry - 14, this.w + 6, 3);
            ctx.fillStyle = '#4c4';
            ctx.fillRect(rx - 3, ry - 14, (this.w + 6) * (this.hp / this.maxHp), 3);
        }

        // Name tag
        ctx.fillStyle = '#ccc';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(this.name, rx + this.w * 0.5, ry - 18);

        // Interaction prompt
        if (player && this.canInteract(player)) {
            const pulse = 0.7 + 0.3 * Math.sin(performance.now() * 0.005);
            ctx.fillStyle = `rgba(255, 220, 80, ${pulse})`;
            ctx.font = 'bold 11px monospace';
            ctx.fillText('[F] Falar', rx + this.w * 0.5, ry - 30);
        }

        ctx.textAlign = 'left';
    }
}

// ---------------------------------------------------------------------------
// Guide — Native elder, spawns from start
// ---------------------------------------------------------------------------
class GuideNPC extends BaseNPC {
    constructor(x, y, chunkManager, lighting) {
        super(x, y, NPC_TYPE.GUIDE, chunkManager, lighting);
        this.name = 'O Guia';
        this.portraitColor = '#4a8a4a';
        this.dialogueTree = DIALOGUE_TREES.guide;
    }
}

// ---------------------------------------------------------------------------
// Engineer — Spawns after Boss 1 (Sentinel Probe)
// ---------------------------------------------------------------------------
class EngineerNPC extends BaseNPC {
    constructor(x, y, chunkManager, lighting) {
        super(x, y, NPC_TYPE.ENGINEER, chunkManager, lighting);
        this.name = 'A Engenheira';
        this.portraitColor = '#5a7a9a';
        this.dialogueTree = DIALOGUE_TREES.engineer;
    }
}

// ---------------------------------------------------------------------------
// Scrap Merchant — Spawns when player has 50+ coins
// ---------------------------------------------------------------------------
class ScrapMerchantNPC extends BaseNPC {
    constructor(x, y, chunkManager, lighting) {
        super(x, y, NPC_TYPE.SCRAP_MERCHANT, chunkManager, lighting);
        this.name = 'Comerciante de Sucata';
        this.portraitColor = '#aa8833';
        this.dialogueTree = DIALOGUE_TREES.scrap_merchant;
    }
}

// ---------------------------------------------------------------------------
// NPC Manager
// ---------------------------------------------------------------------------
class NPCManager {
    constructor(chunkManager, lighting) {
        this.npcs = [];
        this.chunkManager = chunkManager;
        this.lighting = lighting;
        this.engineerSpawned = false;
        this.merchantSpawned = false;
    }

    spawnGuide(playerX, playerY) {
        const guide = new GuideNPC(playerX + 80, playerY, this.chunkManager, this.lighting);
        this.npcs.push(guide);
    }

    checkSpawnConditions(gameState, playerX, playerY) {
        // Engineer spawns after Boss 1 defeated
        if (!this.engineerSpawned && gameState.bossesDefeated && gameState.bossesDefeated.includes('probe')) {
            const eng = new EngineerNPC(playerX - 80, playerY, this.chunkManager, this.lighting);
            this.npcs.push(eng);
            this.engineerSpawned = true;
            if (gameState.hud) gameState.hud.showMessage('A Engenheira chegou à vila!', 4, '#44aaff');
        }

        // Merchant spawns when player has 50+ coins
        if (!this.merchantSpawned && gameState.inventory && gameState.inventory.countItem('coin') >= 50) {
            const merch = new ScrapMerchantNPC(playerX + 120, playerY, this.chunkManager, this.lighting);
            this.npcs.push(merch);
            this.merchantSpawned = true;
            if (gameState.hud) gameState.hud.showMessage('Um comerciante de sucata apareceu!', 4, '#ffaa44');
        }
    }

    update(dt, player, enemies, gameState) {
        this.checkSpawnConditions(gameState, player.x, player.y);
        for (const npc of this.npcs) {
            npc.update(dt, player, enemies);
            // Enemy damage to NPCs
            for (const e of enemies) {
                if (e.isDead()) continue;
                if (npc.x < e.x + e.w && npc.x + npc.w > e.x && npc.y < e.y + e.h && npc.y + npc.h > e.y) {
                    npc.takeDamage(e.damage * 0.5);
                }
            }
        }
    }

    draw(ctx, camera, player) {
        for (const npc of this.npcs) npc.draw(ctx, camera, player);
    }

    tryInteract(player, input, dialogueSystem, gameState) {
        if (!input.isKeyJustPressed('KeyF')) return;
        for (const npc of this.npcs) {
            if (npc.alive && npc.canInteract(player) && npc.dialogueTree) {
                // Context-aware entry node (priority: light_artifact > golem > probe > greeting)
                let entryNode = 'greeting';
                const hasLight = gameState.inventory && gameState.inventory.hasItem('light_artifact');
                const defeated = gameState.bossesDefeated || [];
                if (hasLight && npc.dialogueTree.nodes.has_light_artifact) {
                    entryNode = 'has_light_artifact';
                } else if (defeated.includes('golem') && npc.dialogueTree.nodes.after_golem) {
                    entryNode = 'after_golem';
                } else if (defeated.includes('probe') && npc.dialogueTree.nodes.after_probe) {
                    entryNode = 'after_probe';
                }
                // Override tree root temporarily
                const originalRoot = npc.dialogueTree.root;
                npc.dialogueTree.root = entryNode;
                dialogueSystem.start(npc, gameState, () => {
                    npc.dialogueTree.root = originalRoot;
                });
                return true;
            }
        }
        return false;
    }

    getNPCs() { return this.npcs; }
}
