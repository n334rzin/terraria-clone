/**
 * QABot — Goal-oriented AI agent that plays the game like a real player.
 * Objective: beat the game (mine → gather crystals → summon boss → defeat boss).
 * Also monitors performance, detects bugs, exports reports.
 *
 * PHASES:
 *  0 EXPLORE      — Walk surface, mine surface blocks, gather basic materials
 *  1 DIG_DOWN     — Create staircase mine toward underground (ore + bats = crystals)
 *  2 FARM_CRYSTALS— Roam underground hunting bats for crystal fragments
 *  3 BUILD_SHELTER— When night + exposed, build walls/roof + place torch
 *  4 SUMMON_BOSS  — Go deep underground, use Eye Summoner
 *  5 FIGHT_BOSS   — Stay near boss, dodge dashes, spam sword attacks
 *  6 VICTORY      — Game won, stop
 */

const BOT_PHASE = Object.freeze({
    EXPLORE: 0, DIG_DOWN: 1, FARM_CRYSTALS: 2,
    BUILD_SHELTER: 3, SUMMON_BOSS: 4, FIGHT_BOSS: 5, VICTORY: 6,
});

class QABot {
    constructor() {
        this.active = false;
        this.logs = [];
        this.errors = [];
        this.startTime = 0;
        this.playTime = 0;

        // --- Goal-oriented AI state ---
        this.phase = BOT_PHASE.EXPLORE;
        this.phaseTimer = 0;

        // Movement
        this.moveDir = 1;
        this.jumpTimer = 0;
        this.mineTimer = 0;
        this.attackTimer = 0;
        this.actionTimer = 0;
        this.buildCooldown = 0;

        // Dig state
        this.digTargetY = 0;      // target depth in block coords
        this.digStairDir = 1;     // staircase direction
        this.digStepCount = 0;

        // Shelter
        this.shelterBuilt = false;
        this.lastShelterDay = -1;

        // Boss fight
        this.bossRef = null;
        this.dodgeTimer = 0;

        // Cached positions
        this.spawnX = 0;

        // Performance monitoring
        this.fpsHistory = [];
        this.fpsCheckTimer = 0;
        this.lowFpsCount = 0;

        // Bug detection
        this.lastPlayerPos = { x: 0, y: 0 };
        this.stuckTimer = 0;
        this.stuckThreshold = 2.5;
        this.clippingChecks = 0;
        this.clippingBugs = 0;

        // Stats
        this.blocksMined = 0;
        this.blocksPlaced = 0;
        this.enemiesKilled = 0;
        this.distanceTraveled = 0;
        this.jumpsPerformed = 0;
        this.deathCount = 0;
        this.torchesPlaced = 0;
        this.housesBuilt = 0;

        this._deathHandled = false;
    }

    toggle() {
        this.active = !this.active;
        if (this.active) {
            this.startTime = performance.now();
            this._log('INFO', 'QA Bot ativado — Objetivo: ZERAR O JOGO.');
            this._log('INFO', 'Fase inicial: EXPLORAR superfície.');
        } else {
            this._log('INFO', 'QA Bot desativado.');
        }
    }

    isActive() { return this.active; }

    // =======================================================================
    // MAIN UPDATE
    // =======================================================================
    update(dt, player, input, chunkManager, entities, combat, lighting, inventory) {
        if (!this.active) return;
        this.playTime += dt;

        // Monitoring
        this._monitorFPS(dt);
        this._detectClipping(player, chunkManager);
        this._detectStuck(dt, player);

        // Distance
        const dx = player.x - this.lastPlayerPos.x;
        const dy = player.y - this.lastPlayerPos.y;
        this.distanceTraveled += Math.sqrt(dx * dx + dy * dy);
        this.lastPlayerPos.x = player.x;
        this.lastPlayerPos.y = player.y;

        // Death handling
        if (player.isDead) {
            if (!this._deathHandled) {
                this.deathCount++;
                this._log('WARN', `Morreu (#${this.deathCount}) em (${Math.floor(player.x / BLOCK_SIZE)},${Math.floor(player.y / BLOCK_SIZE)}). Fase: ${this._phaseName()}`);
                this._deathHandled = true;
            }
            return;
        }
        this._deathHandled = false;

        // Cache spawn position first frame
        if (this.spawnX === 0) this.spawnX = player.x;

        // Phase decision
        this._decidePhase(player, chunkManager, entities, lighting, inventory);

        // Execute current phase
        this._executePhase(dt, player, chunkManager, entities, combat, lighting, inventory);
    }

    // =======================================================================
    // PHASE DECISION — what should the bot focus on right now?
    // =======================================================================
    _decidePhase(player, chunkManager, entities, lighting, inventory) {
        // Victory check
        if (this.phase === BOT_PHASE.VICTORY) return;

        const crystals = inventory.countItem('crystal_fragment');
        const hasSummoner = inventory.hasItem('deep_invoker');
        const bossActive = entities.boss !== null;
        const isNight = lighting.isNight();
        const pby = Math.floor((player.y + player.h) / BLOCK_SIZE);
        const surfY = lighting.surfaceY
            ? lighting.surfaceY[Math.min(Math.floor(player.x / BLOCK_SIZE), lighting.worldW - 1)]
            : Math.floor(lighting.worldH * 0.45);
        const isUnderground = pby > surfY + 5;
        const isDeep = pby > Math.floor(lighting.worldH * 0.5);
        const exposed = this._isExposed(player, chunkManager);

        // Boss is alive → fight it
        if (bossActive) {
            if (this.phase !== BOT_PHASE.FIGHT_BOSS) {
                this.phase = BOT_PHASE.FIGHT_BOSS;
                this.bossRef = entities.boss;
                this._log('INFO', '⚔ FASE: FIGHT_BOSS — Combatendo o chefe!');
            }
            return;
        }

        // Boss was defeated
        if (this.bossRef && !bossActive && this.phase === BOT_PHASE.FIGHT_BOSS) {
            this.phase = BOT_PHASE.VICTORY;
            this._log('INFO', '🏆 FASE: VICTORY — Jogo zerado!');
            return;
        }

        // Have summoner → go deep and use it
        if (hasSummoner && !bossActive) {
            if (isDeep) {
                this.phase = BOT_PHASE.SUMMON_BOSS;
                this._log('INFO', '👁 FASE: SUMMON_BOSS — Usando Olho Invocador!');
            } else {
                this.phase = BOT_PHASE.DIG_DOWN;
            }
            return;
        }

        // Night + exposed on surface → build shelter
        if (isNight && !isUnderground && exposed && !this.shelterBuilt) {
            const currentDay = Math.floor(this.playTime / 120);
            if (currentDay !== this.lastShelterDay) {
                this.phase = BOT_PHASE.BUILD_SHELTER;
                return;
            }
        }

        // Need crystals (< 5 and no summoner) → mine underground
        if (crystals < 5 && !hasSummoner) {
            if (isUnderground) {
                this.phase = BOT_PHASE.FARM_CRYSTALS;
            } else {
                // Explore surface first to gather blocks, then dig
                if (this.playTime < 30 && this.blocksMined < 20) {
                    this.phase = BOT_PHASE.EXPLORE;
                } else {
                    this.phase = BOT_PHASE.DIG_DOWN;
                }
            }
            return;
        }

        this.phase = BOT_PHASE.EXPLORE;
    }

    // =======================================================================
    // PHASE EXECUTION
    // =======================================================================
    _executePhase(dt, player, chunkManager, entities, combat, lighting, inventory) {
        // Timers
        this.jumpTimer = Math.max(0, this.jumpTimer - dt);
        this.mineTimer = Math.max(0, this.mineTimer - dt);
        this.attackTimer = Math.max(0, this.attackTimer - dt);
        this.actionTimer = Math.max(0, this.actionTimer - dt);
        this.buildCooldown = Math.max(0, this.buildCooldown - dt);
        this.dodgeTimer = Math.max(0, this.dodgeTimer - dt);
        this.phaseTimer += dt;

        // Always fight nearby enemies (any phase except boss fight which has its own)
        if (this.phase !== BOT_PHASE.FIGHT_BOSS && this.phase !== BOT_PHASE.BUILD_SHELTER) {
            this._fightNearbyEnemies(dt, player, entities, inventory);
        }

        switch (this.phase) {
            case BOT_PHASE.EXPLORE:       this._phaseExplore(dt, player, chunkManager, inventory, lighting); break;
            case BOT_PHASE.DIG_DOWN:      this._phaseDigDown(dt, player, chunkManager, inventory, lighting); break;
            case BOT_PHASE.FARM_CRYSTALS: this._phaseFarmCrystals(dt, player, chunkManager, entities, inventory, lighting); break;
            case BOT_PHASE.BUILD_SHELTER: this._phaseBuildShelter(dt, player, chunkManager, inventory, lighting); break;
            case BOT_PHASE.SUMMON_BOSS:   this._phaseSummonBoss(dt, player, inventory); break;
            case BOT_PHASE.FIGHT_BOSS:    this._phaseFightBoss(dt, player, entities, inventory); break;
            case BOT_PHASE.VICTORY:       this._clearKeys(player); break;
        }
    }

    // -----------------------------------------------------------------------
    // PHASE 0 — EXPLORE: walk surface, mine blocks in front, gather materials
    // -----------------------------------------------------------------------
    _phaseExplore(dt, player, chunkManager, inventory, lighting) {
        this._selectPickaxe(inventory);
        this._moveHorizontal(player, this.moveDir);

        // Change direction at intervals
        if (this.actionTimer <= 0) {
            this.actionTimer = 3 + Math.random() * 4;
            this.moveDir = Math.random() > 0.5 ? 1 : -1;
        }

        const pbx = Math.floor((player.x + player.w * 0.5) / BLOCK_SIZE);
        const pby = Math.floor((player.y + player.h) / BLOCK_SIZE);
        const frontBx = pbx + this.moveDir;

        // Jump over obstacles
        this._jumpIfBlocked(player, chunkManager, frontBx, pby);

        // Mine blocks in path
        if (this.mineTimer <= 0) {
            for (let yo = -1; yo <= 0; yo++) {
                const bid = chunkManager.getBlockAt(frontBx, pby + yo);
                if (bid !== BLOCK.AIR && bid !== BLOCK.BEDROCK && bid !== BLOCK.TORCH) {
                    this._mineBlock(chunkManager, frontBx, pby + yo, bid, inventory);
                    break;
                }
            }
        }

        // Place torches when getting dark and have them
        if (lighting.isNight() && this.buildCooldown <= 0 && inventory.countItem('torch') > 0) {
            const torchBx = pbx;
            const torchBy = pby - 1;
            if (chunkManager.getBlockAt(torchBx, torchBy) === BLOCK.AIR) {
                this._placeBlock(chunkManager, torchBx, torchBy, BLOCK.TORCH, inventory, 'torch', lighting);
                this.buildCooldown = 8;
            }
        }
    }

    // -----------------------------------------------------------------------
    // PHASE 1 — DIG DOWN: staircase mine toward underground
    // -----------------------------------------------------------------------
    _phaseDigDown(dt, player, chunkManager, inventory, lighting) {
        this._selectPickaxe(inventory);

        const pbx = Math.floor((player.x + player.w * 0.5) / BLOCK_SIZE);
        const pby = Math.floor((player.y + player.h) / BLOCK_SIZE);
        const targetDepth = Math.floor(lighting.worldH * 0.55);

        // Target reached?
        if (pby >= targetDepth) {
            this._log('INFO', '⛏ Profundidade alvo atingida! Mudando para FARM_CRYSTALS.');
            this.phase = BOT_PHASE.FARM_CRYSTALS;
            this.phaseTimer = 0;
            return;
        }

        // Staircase mining: move dir, mine 1 forward + 1 below alternating
        this._moveHorizontal(player, this.digStairDir);

        if (this.mineTimer <= 0) {
            this.digStepCount++;

            // Mine 2 blocks ahead at head/foot level (tunnel 2 high)
            const fx = pbx + this.digStairDir;
            for (let yo = -1; yo <= 0; yo++) {
                const bid = chunkManager.getBlockAt(fx, pby + yo);
                if (bid !== BLOCK.AIR && bid !== BLOCK.BEDROCK) {
                    this._mineBlock(chunkManager, fx, pby + yo, bid, inventory);
                }
            }

            // Every 3 steps, also mine block below to go deeper
            if (this.digStepCount % 3 === 0) {
                const bid = chunkManager.getBlockAt(pbx, pby + 1);
                if (bid !== BLOCK.AIR && bid !== BLOCK.BEDROCK) {
                    this._mineBlock(chunkManager, pbx, pby + 1, bid, inventory);
                }
                // Also mine 1 more below for player to fall into
                const bid2 = chunkManager.getBlockAt(pbx, pby + 2);
                if (bid2 !== BLOCK.AIR && bid2 !== BLOCK.BEDROCK) {
                    this._mineBlock(chunkManager, pbx, pby + 2, bid2, inventory);
                }
            }

            // Reverse staircase direction every ~15 steps for zigzag
            if (this.digStepCount % 15 === 0) {
                this.digStairDir *= -1;
            }

            // Place torch every ~12 steps
            if (this.digStepCount % 12 === 0 && inventory.countItem('torch') > 0) {
                const ty = pby - 1;
                if (chunkManager.getBlockAt(pbx, ty) === BLOCK.AIR) {
                    this._placeBlock(chunkManager, pbx, ty, BLOCK.TORCH, inventory, 'torch', lighting);
                }
            }
        }

        this._jumpIfBlocked(player, chunkManager, pbx + this.digStairDir, pby);
    }

    // -----------------------------------------------------------------------
    // PHASE 2 — FARM CRYSTALS: roam underground killing bats
    // -----------------------------------------------------------------------
    _phaseFarmCrystals(dt, player, chunkManager, entities, inventory, lighting) {
        const pbx = Math.floor((player.x + player.w * 0.5) / BLOCK_SIZE);
        const pby = Math.floor((player.y + player.h) / BLOCK_SIZE);

        // Find nearest bat to chase
        const pcx = player.x + player.w * 0.5;
        const pcy = player.y + player.h * 0.5;
        let nearestBat = null;
        let nearestDist = Infinity;

        for (const e of entities.getEnemies()) {
            if (e.isDead() || e.type !== ENEMY_TYPE.BAT) continue;
            const edx = (e.x + e.w * 0.5) - pcx;
            const edy = (e.y + e.h * 0.5) - pcy;
            const d = Math.sqrt(edx * edx + edy * edy);
            if (d < nearestDist) { nearestDist = d; nearestBat = e; }
        }

        if (nearestBat && nearestDist < 400) {
            // Chase bat
            const bx = nearestBat.x + nearestBat.w * 0.5;
            const dir = Math.sign(bx - pcx) || 1;
            this._moveHorizontal(player, dir);
            this._jumpIfBlocked(player, chunkManager, pbx + dir, pby);
        } else {
            // Roam underground
            if (this.actionTimer <= 0) {
                this.actionTimer = 2 + Math.random() * 3;
                this.moveDir = Math.random() > 0.5 ? 1 : -1;
            }
            this._moveHorizontal(player, this.moveDir);
            this._jumpIfBlocked(player, chunkManager, pbx + this.moveDir, pby);

            // Mine obstacles in path
            if (this.mineTimer <= 0) {
                this._selectPickaxe(inventory);
                const fx = pbx + this.moveDir;
                for (let yo = -1; yo <= 0; yo++) {
                    const bid = chunkManager.getBlockAt(fx, pby + yo);
                    if (bid !== BLOCK.AIR && bid !== BLOCK.BEDROCK && bid !== BLOCK.TORCH) {
                        this._mineBlock(chunkManager, fx, pby + yo, bid, inventory);
                        break;
                    }
                }
            }
        }

        // Place torches periodically
        if (this.buildCooldown <= 0 && inventory.countItem('torch') > 0) {
            if (chunkManager.getBlockAt(pbx, pby - 2) === BLOCK.AIR) {
                this._placeBlock(chunkManager, pbx, pby - 2, BLOCK.TORCH, inventory, 'torch', lighting);
                this.buildCooldown = 10;
            }
        }
    }

    // -----------------------------------------------------------------------
    // PHASE 3 — BUILD SHELTER: wall + roof + torch
    // -----------------------------------------------------------------------
    _phaseBuildShelter(dt, player, chunkManager, inventory, lighting) {
        this._clearKeys(player);

        const pbx = Math.floor((player.x + player.w * 0.5) / BLOCK_SIZE);
        const pby = Math.floor((player.y + player.h) / BLOCK_SIZE);
        const stoneCount = inventory.countItem('stone');
        const dirtCount = inventory.countItem('dirt');
        const blockItem = stoneCount >= 8 ? 'stone' : (dirtCount >= 8 ? 'dirt' : null);

        if (!blockItem) {
            this._log('INFO', '🏠 Sem blocos para abrigo, voltando a explorar.');
            this.shelterBuilt = true;
            this.phase = BOT_PHASE.EXPLORE;
            return;
        }

        const blockId = blockItem === 'stone' ? BLOCK.STONE : BLOCK.DIRT;

        // Build a 5-wide, 4-tall house around the player
        const positions = [
            // Left wall
            [pbx - 3, pby - 1], [pbx - 3, pby - 2], [pbx - 3, pby - 3], [pbx - 3, pby - 4],
            // Right wall
            [pbx + 3, pby - 1], [pbx + 3, pby - 2], [pbx + 3, pby - 3], [pbx + 3, pby - 4],
            // Roof
            [pbx - 2, pby - 4], [pbx - 1, pby - 4], [pbx, pby - 4], [pbx + 1, pby - 4], [pbx + 2, pby - 4],
        ];

        let placed = 0;
        for (const [bx, by] of positions) {
            if (inventory.countItem(blockItem) <= 0) break;
            if (chunkManager.getBlockAt(bx, by) === BLOCK.AIR) {
                this._placeBlock(chunkManager, bx, by, blockId, inventory, blockItem, lighting);
                placed++;
            }
        }

        // Place torch inside
        if (inventory.countItem('torch') > 0 && chunkManager.getBlockAt(pbx, pby - 2) === BLOCK.AIR) {
            this._placeBlock(chunkManager, pbx, pby - 2, BLOCK.TORCH, inventory, 'torch', lighting);
        }

        this.shelterBuilt = true;
        this.lastShelterDay = Math.floor(this.playTime / 120);
        this.housesBuilt++;
        this._log('INFO', `🏠 Abrigo construído! (${placed} blocos colocados) Casa #${this.housesBuilt}`);
        this.phase = BOT_PHASE.EXPLORE;
    }

    // -----------------------------------------------------------------------
    // PHASE 4 — SUMMON BOSS: use Eye Summoner deep underground
    // -----------------------------------------------------------------------
    _phaseSummonBoss(dt, player, inventory) {
        // Trigger summoner use via gameState
        if (window._gameState) {
            const result = window._gameState.trySummonBoss(player, 'deep_invoker');
            if (result) {
                this._log('INFO', '👁 Boss invocado! Iniciando combate final.');
                this.phase = BOT_PHASE.FIGHT_BOSS;
            } else {
                // Not deep enough — keep digging
                this.phase = BOT_PHASE.DIG_DOWN;
            }
        }
    }

    // -----------------------------------------------------------------------
    // PHASE 5 — FIGHT BOSS: aggressive melee with dodging
    // -----------------------------------------------------------------------
    _phaseFightBoss(dt, player, entities, inventory) {
        this._selectSword(inventory);

        const boss = entities.boss;
        if (!boss || boss.isDead()) {
            this.phase = BOT_PHASE.VICTORY;
            this._log('INFO', '🏆 BOSS DERROTADO! Jogo zerado pelo bot!');
            if (window._audio) window._audio.playVictory();
            return;
        }

        const pcx = player.x + player.w * 0.5;
        const pcy = player.y + player.h * 0.5;
        const bcx = boss.x + boss.w * 0.5;
        const bcy = boss.y + boss.h * 0.5;
        const dx = bcx - pcx;
        const dy = bcy - pcy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Dodge if boss is dashing at us
        if (boss.isDashing && this.dodgeTimer <= 0) {
            const dodgeDir = Math.sign(dx) > 0 ? -1 : 1;
            this._moveHorizontal(player, dodgeDir);
            if (player.onGround) {
                player.vy = -550;
                this.jumpsPerformed++;
            }
            this.dodgeTimer = 0.8;
            return;
        }

        // Approach boss
        if (dist > 55) {
            this._moveHorizontal(player, Math.sign(dx));
        } else {
            this._clearKeys(player);
        }

        // Attack
        if (this.attackTimer <= 0 && dist < 80) {
            const knockDir = Math.sign(dx) || 1;
            boss.takeDamage(25, knockDir, -0.3, 200);
            this.attackTimer = 0.35;
            player.startSwing();
            if (window._audio) { window._audio.playSwoosh(); window._audio.playHit(); }
            if (window._particles) window._particles.emitHitSparks(bcx, bcy);
        }

        // Also kill nearby minion slimes
        for (const e of entities.getEnemies()) {
            if (e === boss || e.isDead()) continue;
            const ex = e.x + e.w * 0.5;
            const ey = e.y + e.h * 0.5;
            const ed = Math.sqrt((ex - pcx) ** 2 + (ey - pcy) ** 2);
            if (ed < 60 && this.attackTimer <= 0) {
                e.takeDamage(25, Math.sign(ex - pcx), -0.3, 300);
                this.attackTimer = 0.35;
                this.enemiesKilled += e.isDead() ? 1 : 0;
                player.startSwing();
                if (window._audio) window._audio.playHit();
                break;
            }
        }
    }

    // =======================================================================
    // COMBAT — fight any enemy near the player (used in all phases except boss)
    // =======================================================================
    _fightNearbyEnemies(dt, player, entities, inventory) {
        if (this.attackTimer > 0) return;

        const pcx = player.x + player.w * 0.5;
        const pcy = player.y + player.h * 0.5;

        for (const e of entities.getEnemies()) {
            if (e.isDead()) continue;
            const ecx = e.x + e.w * 0.5;
            const ecy = e.y + e.h * 0.5;
            const dist = Math.sqrt((ecx - pcx) ** 2 + (ecy - pcy) ** 2);

            if (dist < 60) {
                this._selectSword(inventory);
                const knockDir = Math.sign(ecx - pcx) || 1;
                e.takeDamage(25, knockDir, -0.3, 300);
                this.attackTimer = 0.35;
                player.startSwing();
                player.facing = knockDir;
                if (e.isDead()) this.enemiesKilled++;
                if (window._audio) { window._audio.playSwoosh(); window._audio.playHit(); }
                if (window._particles) window._particles.emitHitSparks(ecx, ecy);
                break;
            }
        }
    }

    // =======================================================================
    // UTILITY HELPERS
    // =======================================================================
    _moveHorizontal(player, dir) {
        player._keys['KeyA'] = dir < 0;
        player._keys['KeyD'] = dir > 0;
        player._keys['ArrowLeft'] = false;
        player._keys['ArrowRight'] = false;
        player.facing = dir;
    }

    _clearKeys(player) {
        player._keys['KeyA'] = false;
        player._keys['KeyD'] = false;
        player._keys['ArrowLeft'] = false;
        player._keys['ArrowRight'] = false;
    }

    _jumpIfBlocked(player, chunkManager, frontBx, footBy) {
        if (!player.onGround || this.jumpTimer > 0) return;
        const blocked = chunkManager.getBlockAt(frontBx, footBy - 1) !== BLOCK.AIR &&
                        chunkManager.getBlockAt(frontBx, footBy - 1) !== BLOCK.TORCH;
        if (blocked) {
            player.jumpBufferEnd = performance.now() + 120;
            this.jumpTimer = 0.4;
            this.jumpsPerformed++;
        }
    }

    _selectPickaxe(inventory) {
        for (let i = 0; i < 10; i++) {
            if (inventory.hotbar[i].itemId === 'pickaxe') { inventory.selectedSlot = i; return; }
        }
    }

    _selectSword(inventory) {
        for (let i = 0; i < 10; i++) {
            if (inventory.hotbar[i].itemId === 'sword') { inventory.selectedSlot = i; return; }
        }
    }

    _mineBlock(chunkManager, bx, by, blockId, inventory) {
        if (this.mineTimer > 0) return;
        const dropId = BLOCK_TO_ITEM[blockId];
        if (dropId) inventory.addItem(dropId, 1);
        const color = BLOCK_COLORS[blockId] || '#666';
        chunkManager.setBlockAt(bx, by, BLOCK.AIR);
        this.blocksMined++;
        this.mineTimer = 0.18;
        if (window._particles) window._particles.emitBlockBreak(bx * BLOCK_SIZE, by * BLOCK_SIZE, color);
        if (window._audio) window._audio.playBlockBreak();
    }

    _placeBlock(chunkManager, bx, by, blockId, inventory, itemId, lighting) {
        if (inventory.countItem(itemId) <= 0) return;
        if (chunkManager.getBlockAt(bx, by) !== BLOCK.AIR) return;
        chunkManager.setBlockAt(bx, by, blockId);
        inventory.removeItem(itemId, 1);
        this.blocksPlaced++;
        if (blockId === BLOCK.TORCH) {
            if (lighting) lighting.addTorch(bx, by);
            this.torchesPlaced++;
        }
        if (window._audio) window._audio.playPlace();
    }

    _isExposed(player, chunkManager) {
        const bx = Math.floor((player.x + player.w * 0.5) / BLOCK_SIZE);
        const by = Math.floor(player.y / BLOCK_SIZE);
        for (let y = by - 1; y >= by - 5; y--) {
            if (y < 0) break;
            const id = chunkManager.getBlockAt(bx, y);
            if (id !== BLOCK.AIR && id !== BLOCK.TORCH) return false;
        }
        return true;
    }

    _phaseName() {
        const names = ['EXPLORE', 'DIG_DOWN', 'FARM_CRYSTALS', 'BUILD_SHELTER', 'SUMMON_BOSS', 'FIGHT_BOSS', 'VICTORY'];
        return names[this.phase] || '?';
    }

    // =======================================================================
    // MONITORING
    // =======================================================================
    _monitorFPS(dt) {
        this.fpsCheckTimer += dt;
        if (this.fpsCheckTimer >= 1.0) {
            this.fpsCheckTimer = 0;
            const currentFps = dt > 0 ? Math.round(1 / dt) : 60;
            this.fpsHistory.push(currentFps);
            if (this.fpsHistory.length > 60) this.fpsHistory.shift();
            if (currentFps < 30) {
                this.lowFpsCount++;
                if (this.lowFpsCount >= 3) {
                    this._logError('LOW_FPS', 'FPS abaixo de 30 por 3+ segundos consecutivos',
                        'src/core/engine.js', 'Otimizar loop de renderização ou reduzir chunks visíveis');
                    this.lowFpsCount = 0;
                }
            } else {
                this.lowFpsCount = 0;
            }
        }
    }

    _detectClipping(player, chunkManager) {
        this.clippingChecks++;
        if (this.clippingChecks % 30 !== 0) return;
        const bx0 = Math.floor(player.x / BLOCK_SIZE);
        const by0 = Math.floor(player.y / BLOCK_SIZE);
        const bx1 = Math.floor((player.x + player.w - 1) / BLOCK_SIZE);
        const by1 = Math.floor((player.y + player.h - 1) / BLOCK_SIZE);
        for (let bx = bx0; bx <= bx1; bx++) {
            for (let by = by0; by <= by1; by++) {
                const id = chunkManager.getBlockAt(bx, by);
                if (id !== BLOCK.AIR && id !== BLOCK.TORCH) {
                    this.clippingBugs++;
                    this._logError('CLIPPING', `Jogador dentro de bloco (${id}) em (${bx},${by})`,
                        'src/entities/player.js', 'Revisar _resolveX/_resolveY para push-out mais agressivo');
                    player.y = (by - 1) * BLOCK_SIZE - player.h;
                    player.vy = 0;
                    break;
                }
            }
        }
    }

    _detectStuck(dt, player) {
        const ddx = Math.abs(player.x - this.lastPlayerPos.x);
        const ddy = Math.abs(player.y - this.lastPlayerPos.y);
        if (ddx < 0.3 && ddy < 0.3 && !player.isDead) {
            this.stuckTimer += dt;
            if (this.stuckTimer > this.stuckThreshold) {
                this._logError('STUCK', `Preso por ${this.stuckTimer.toFixed(1)}s em (${Math.floor(player.x)},${Math.floor(player.y)})`,
                    'src/entities/player.js', 'Melhorar pathfinding do bot');
                this.stuckTimer = 0;
                // Emergency unstick
                player.vy = -550;
                this.moveDir *= -1;
                this.digStairDir *= -1;
                // Mine surrounding blocks
                const pbx = Math.floor(player.x / BLOCK_SIZE);
                const pby = Math.floor(player.y / BLOCK_SIZE);
                for (let ox = -1; ox <= 1; ox++) {
                    for (let oy = -1; oy <= 1; oy++) {
                        const bid = player.chunkManager.getBlockAt(pbx + ox, pby + oy);
                        if (bid !== BLOCK.AIR && bid !== BLOCK.BEDROCK) {
                            player.chunkManager.setBlockAt(pbx + ox, pby + oy, BLOCK.AIR);
                            this.blocksMined++;
                        }
                    }
                }
            }
        } else {
            this.stuckTimer = 0;
        }
    }

    // =======================================================================
    // LOGGING & REPORT
    // =======================================================================
    _log(level, msg) {
        const entry = { time: this.playTime.toFixed(1), level, msg, timestamp: new Date().toISOString() };
        this.logs.push(entry);
        if (this.logs.length > 200) this.logs.shift();
        console.log(`[QABot ${level}] ${msg}`);
    }

    _logError(type, description, file, suggestion) {
        const entry = { type, description, file, suggestion, time: this.playTime.toFixed(1), timestamp: new Date().toISOString() };
        this.errors.push(entry);
        this._log('ERROR', `${type}: ${description}`);
    }

    exportReport() {
        const avgFps = this.fpsHistory.length > 0
            ? (this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length).toFixed(1) : 'N/A';

        let r = '';
        r += '═══════════════════════════════════════════════════════════════\n';
        r += '            TERRAVOXEL — RELATÓRIO DE QA AUTOMATIZADO\n';
        r += '═══════════════════════════════════════════════════════════════\n';
        r += `Data: ${new Date().toLocaleString('pt-BR')}\n`;
        r += `Tempo de Teste: ${this.playTime.toFixed(0)}s\n`;
        r += `FPS Médio: ${avgFps}\n`;
        r += `Fase Final: ${this._phaseName()}\n`;
        r += `Resultado: ${this.phase === BOT_PHASE.VICTORY ? 'JOGO ZERADO ✅' : 'EM PROGRESSO...'}\n`;
        r += '\n─── ESTATÍSTICAS ───────────────────────────────────────────────\n';
        r += `Blocos Minerados: ${this.blocksMined}\n`;
        r += `Blocos Colocados: ${this.blocksPlaced}\n`;
        r += `Tochas Colocadas: ${this.torchesPlaced}\n`;
        r += `Casas Construídas: ${this.housesBuilt}\n`;
        r += `Inimigos Abatidos: ${this.enemiesKilled}\n`;
        r += `Pulos Realizados: ${this.jumpsPerformed}\n`;
        r += `Mortes: ${this.deathCount}\n`;
        r += `Bugs de Clipping: ${this.clippingBugs}\n`;
        r += `Quedas de FPS (<30): ${this.errors.filter(e => e.type === 'LOW_FPS').length}\n`;
        r += '\n';

        if (this.errors.length > 0) {
            r += '─── ERROS DETECTADOS ───────────────────────────────────────────\n';
            for (const err of this.errors) {
                r += `\n[ERRO DETECTADO] ${err.type}\n`;
                r += `  Tempo: ${err.time}s\n`;
                r += `  Descrição: ${err.description}\n`;
                r += `  [ARQUIVO PROVÁVEL] ${err.file}\n`;
                r += `  [MELHORIA SUGERIDA] ${err.suggestion}\n`;
            }
        } else {
            r += '─── NENHUM ERRO CRÍTICO DETECTADO ──────────────────────────────\n';
            r += 'O jogo operou dentro dos parâmetros esperados.\n';
        }

        r += '\n─── LOG COMPLETO ───────────────────────────────────────────────\n';
        for (const log of this.logs.slice(-80)) {
            r += `[${log.time}s] [${log.level}] ${log.msg}\n`;
        }
        r += '\n═══════════════════════════════════════════════════════════════\n';
        r += 'Gerado automaticamente pelo QABot — Windsurf Integration\n';
        r += '═══════════════════════════════════════════════════════════════\n';
        return r;
    }

    downloadReport() {
        const text = this.exportReport();
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'windsurf_bug_report.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this._log('INFO', 'Relatório exportado: windsurf_bug_report.txt');
    }

    // =======================================================================
    // HUD OVERLAY
    // =======================================================================
    draw(ctx, canvasW, canvasH) {
        if (!this.active) return;

        const panelW = 260;
        const panelH = 92;
        ctx.fillStyle = 'rgba(0,30,0,0.8)';
        ctx.fillRect(10, canvasH - panelH - 10, panelW, panelH);
        ctx.strokeStyle = '#44ff44';
        ctx.lineWidth = 1;
        ctx.strokeRect(10, canvasH - panelH - 10, panelW, panelH);

        let y = canvasH - panelH + 2;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#44ff44';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`🤖 QA BOT — ${this._phaseName()}`, 18, y); y += 14;

        ctx.fillStyle = '#aaffaa';
        ctx.font = '10px monospace';
        ctx.fillText(`Tempo: ${Math.floor(this.playTime)}s | Mortes: ${this.deathCount} | Erros: ${this.errors.length}`, 18, y); y += 13;
        ctx.fillText(`Minerou: ${this.blocksMined} | Colocou: ${this.blocksPlaced} | Kills: ${this.enemiesKilled}`, 18, y); y += 13;
        ctx.fillText(`Tochas: ${this.torchesPlaced} | Casas: ${this.housesBuilt} | Pulos: ${this.jumpsPerformed}`, 18, y); y += 13;

        // Progress bar toward victory
        const progress = this.phase === BOT_PHASE.VICTORY ? 1 :
            Math.min(1, (this.phase / 6) + (this.phaseTimer > 0 ? 0.02 : 0));
        ctx.fillStyle = '#224422';
        ctx.fillRect(18, y, panelW - 24, 8);
        ctx.fillStyle = this.phase === BOT_PHASE.VICTORY ? '#44ff44' : '#88cc44';
        ctx.fillRect(18, y, (panelW - 24) * progress, 8);
        ctx.fillStyle = '#aaffaa';
        ctx.font = '8px monospace';
        ctx.fillText(this.phase === BOT_PHASE.VICTORY ? 'JOGO ZERADO!' : 'Progresso...', 18, y + 18);
    }

    drawExportButton(ctx, canvasW) {
        const btnW = 200;
        const btnH = 28;
        const x = canvasW - btnW - 12;
        const y = 70;

        ctx.fillStyle = 'rgba(40,20,0,0.8)';
        ctx.fillRect(x, y, btnW, btnH);
        ctx.strokeStyle = '#ff8844';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, btnW, btnH);

        ctx.fillStyle = '#ffaa66';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('📋 Exportar Relatório', x + btnW * 0.5, y + 18);
        ctx.textAlign = 'left';
        this._exportBtnRect = { x, y, w: btnW, h: btnH };
    }

    checkExportClick(mouseX, mouseY) {
        if (!this._exportBtnRect) return false;
        const b = this._exportBtnRect;
        return mouseX >= b.x && mouseX <= b.x + b.w && mouseY >= b.y && mouseY <= b.y + b.h;
    }
}
