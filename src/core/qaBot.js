/**
 * QABot — Autonomous agent that plays through the entire game, beating all 3 bosses.
 * Progression: Explore → Gear up → Boss 1 (SentinelProbe) → Boss 2 (BrassGolem) →
 *              Underworld → Boss 3 (BossEye) → Surface → Purify → VICTORY
 *
 * Also monitors FPS, detects clipping/stuck, exports bug reports.
 */

const BOT_PHASE = Object.freeze({
    EXPLORE:     0,  // gather wood, stone, surface materials
    MINE_ORE:    1,  // dig down, mine copper → iron → gold progressively
    PREP_BOSS1:  2,  // craft workbench + copper tools + old_battery
    BOSS1:       3,  // fight SentinelProbe (probe)
    COLLECT1:    4,  // walk around collecting boss 1 drops (advanced_iron)
    PREP_BOSS2:  5,  // craft furnace + iron tools + anvil + mech_heart
    BOSS2:       6,  // fight BrassGolem (golem)
    COLLECT2:    7,  // collect boss 2 drops (brass_fragment)
    UNDERWORLD:  8,  // dig to worldH*0.8, mine obsidian + hellstone
    PREP_BOSS3:  9,  // craft deep_invoker
    BOSS3:       10, // fight BossEye (eye)
    PURIFY:      11, // return to surface with light_artifact, call tryPurifyWorld
    VICTORY:     12,
});

const PHASE_NAMES = [
    'EXPLORAR', 'MINERAR', 'PREP_BOSS1', 'BOSS_1_PROBE',
    'COLETAR_1', 'PREP_BOSS2', 'BOSS_2_GOLEM', 'COLETAR_2',
    'SUBMUNDO', 'PREP_BOSS3', 'BOSS_3_OLHO', 'PURIFICAR', 'VITÓRIA',
];

class QABot {
    constructor() {
        this.active = false;
        this.logs = [];
        this.errors = [];
        this.startTime = 0;
        this.playTime = 0;

        // --- Phase state ---
        this.phase = BOT_PHASE.EXPLORE;
        this.phaseTimer = 0;
        this.phaseChanged = false;

        // Movement
        this.moveDir = 1;
        this.jumpTimer = 0;
        this.mineTimer = 0;
        this.attackTimer = 0;
        this.actionTimer = 0;
        this.buildCooldown = 0;

        // Dig state
        this.digStairDir = 1;
        this.digStepCount = 0;
        this.targetDepth = 0;

        // Boss fight
        this.bossRef = null;
        this.dodgeTimer = 0;
        this.lastBossHp = 0;
        this.bossStuckTimer = 0;

        // Collect drops phase
        this.collectTimer = 0;

        // Cached
        this.spawnX = 0;

        // Performance monitoring
        this.fpsHistory = [];
        this.fpsCheckTimer = 0;
        this.lowFpsCount = 0;

        // Bug detection
        this.lastPlayerPos = { x: 0, y: 0 };
        this.stuckTimer = 0;
        this.stuckThreshold = 3.0;
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

        this._deathHandled = false;
        this._exportBtnRect = null;
    }

    toggle() {
        this.active = !this.active;
        if (this.active) {
            this.startTime = performance.now();
            this._log('INFO', 'QA Bot ativado — Objetivo: ZERAR os 3 bosses!');
        } else {
            this._log('INFO', 'QA Bot desativado.');
        }
    }

    isActive() { return this.active; }

    // ==========================================================================
    // MAIN UPDATE
    // ==========================================================================
    update(dt, player, input, chunkManager, entities, combat, lighting, inventory) {
        if (!this.active) return;
        this.playTime += dt;

        this._monitorFPS(dt);
        this._detectClipping(player, chunkManager);
        this._detectStuck(dt, player, chunkManager);

        const ddx = player.x - this.lastPlayerPos.x;
        const ddy = player.y - this.lastPlayerPos.y;
        this.distanceTraveled += Math.sqrt(ddx * ddx + ddy * ddy);
        this.lastPlayerPos.x = player.x;
        this.lastPlayerPos.y = player.y;

        if (player.isDead) {
            if (!this._deathHandled) {
                this.deathCount++;
                this._log('WARN', `Morreu (#${this.deathCount}) em (${Math.floor(player.x / BLOCK_SIZE)},${Math.floor(player.y / BLOCK_SIZE)}). Fase: ${this._phaseName()}`);
                this._deathHandled = true;
            }
            return;
        }
        this._deathHandled = false;

        if (this.spawnX === 0) this.spawnX = player.x;

        this._decidePhase(player, chunkManager, entities, lighting, inventory);
        this._executePhase(dt, player, chunkManager, entities, combat, lighting, inventory);
    }

    // ==========================================================================
    // PHASE DECISION
    // ==========================================================================
    _decidePhase(player, chunkManager, entities, lighting, inventory) {
        if (this.phase === BOT_PHASE.VICTORY) return;

        const gs = window._gameState;
        const bossesDefeated = gs ? gs.bossesDefeated : [];
        const bossActive = entities.boss !== null;

        // Active boss → fight it
        if (bossActive) {
            const bossType = entities.boss ? entities.boss.type : null;
            const targetPhase = bossType === 'probe' ? BOT_PHASE.BOSS1
                : bossType === 'golem' ? BOT_PHASE.BOSS2
                : BOT_PHASE.BOSS3;
            if (this.phase !== targetPhase) {
                this._setPhase(targetPhase);
                this.bossRef = entities.boss;
                this.lastBossHp = entities.boss.hp;
                this.bossStuckTimer = 0;
            }
            return;
        }

        // Boss just died → collect drops
        if (this.phase === BOT_PHASE.BOSS1 && bossesDefeated.includes('probe')) {
            this._setPhase(BOT_PHASE.COLLECT1);
            this.collectTimer = 12;
            return;
        }
        if (this.phase === BOT_PHASE.BOSS2 && bossesDefeated.includes('golem')) {
            this._setPhase(BOT_PHASE.COLLECT2);
            this.collectTimer = 12;
            return;
        }
        if (this.phase === BOT_PHASE.BOSS3 && bossesDefeated.includes('eye')) {
            this._setPhase(BOT_PHASE.PURIFY);
            return;
        }

        // Victory check
        if (gs && gs.victory) {
            this._setPhase(BOT_PHASE.VICTORY);
            this._log('INFO', '🏆 VITÓRIA! Mundo purificado!');
            return;
        }

        // Collecting drops — wait for timer
        if (this.phase === BOT_PHASE.COLLECT1 || this.phase === BOT_PHASE.COLLECT2) return;

        // After COLLECT1 → prep boss 2
        if (this.phase === BOT_PHASE.COLLECT1 && this.collectTimer <= 0) {
            this._setPhase(BOT_PHASE.PREP_BOSS2);
            return;
        }
        if (this.phase === BOT_PHASE.COLLECT2 && this.collectTimer <= 0) {
            this._setPhase(BOT_PHASE.UNDERWORLD);
            return;
        }

        // Don't interrupt active boss prep/fight phases
        if (this.phase === BOT_PHASE.PREP_BOSS1 ||
            this.phase === BOT_PHASE.PREP_BOSS2 ||
            this.phase === BOT_PHASE.PREP_BOSS3 ||
            this.phase === BOT_PHASE.UNDERWORLD ||
            this.phase === BOT_PHASE.PURIFY) return;

        // --- Progress milestones ---
        const hasBoss3Summoner = inventory.hasItem('deep_invoker');
        const hasBoss2Summoner = inventory.hasItem('mech_heart');
        const hasBoss1Summoner = inventory.hasItem('old_battery');
        const boss1Done = bossesDefeated.includes('probe');
        const boss2Done = bossesDefeated.includes('golem');

        if (boss2Done && !hasBoss3Summoner) { this._setPhase(BOT_PHASE.UNDERWORLD); return; }
        if (boss2Done && hasBoss3Summoner)  { this._setPhase(BOT_PHASE.PREP_BOSS3); return; }
        if (boss1Done && !hasBoss2Summoner) { this._setPhase(BOT_PHASE.PREP_BOSS2); return; }
        if (hasBoss2Summoner)               { this._setPhase(BOT_PHASE.BOSS2); return; }
        if (hasBoss1Summoner)               { this._setPhase(BOT_PHASE.PREP_BOSS1); return; }

        // Need to gather materials for boss 1
        const hasWorkbench = inventory.hasItem('workbench') || inventory.hasItem('copper_pickaxe');
        if (hasWorkbench) { this._setPhase(BOT_PHASE.PREP_BOSS1); return; }

        // Still gathering surface / initial mining
        const pby = Math.floor((player.y + player.h) / BLOCK_SIZE);
        const surfY = lighting.surfaceY
            ? lighting.surfaceY[Math.min(Math.floor(player.x / BLOCK_SIZE), lighting.surfaceY.length - 1)]
            : Math.floor(lighting.worldH * 0.45);
        const underground = pby > surfY + 5;
        const copper = inventory.countItem('copper_ore');
        const wood = inventory.countItem('wood');
        const stone = inventory.countItem('stone');

        if (copper >= 12 || (underground && this.playTime > 15)) {
            this._setPhase(BOT_PHASE.MINE_ORE);
        } else if (wood >= 5 || stone >= 5) {
            this._setPhase(BOT_PHASE.MINE_ORE);
        } else {
            this._setPhase(BOT_PHASE.EXPLORE);
        }
    }

    _setPhase(p) {
        if (this.phase === p) return;
        this._log('INFO', `→ FASE: ${PHASE_NAMES[p]}`);
        this.phase = p;
        this.phaseTimer = 0;
    }

    // ==========================================================================
    // PHASE EXECUTION
    // ==========================================================================
    _executePhase(dt, player, chunkManager, entities, combat, lighting, inventory) {
        this.jumpTimer   = Math.max(0, this.jumpTimer - dt);
        this.mineTimer   = Math.max(0, this.mineTimer - dt);
        this.attackTimer = Math.max(0, this.attackTimer - dt);
        this.actionTimer = Math.max(0, this.actionTimer - dt);
        this.buildCooldown = Math.max(0, this.buildCooldown - dt);
        this.dodgeTimer  = Math.max(0, this.dodgeTimer - dt);
        this.phaseTimer += dt;

        // Always fight enemies that walk too close (except during boss phases)
        if (this.phase !== BOT_PHASE.BOSS1 &&
            this.phase !== BOT_PHASE.BOSS2 &&
            this.phase !== BOT_PHASE.BOSS3) {
            this._fightNearbyEnemies(player, entities, inventory);
        }

        // Auto-craft whenever possible
        if (this.phaseTimer > 0.5 && this.mineTimer <= 0) {
            this._autoCraft(inventory);
        }

        // Use health potion if low
        if (player.hp < player.maxHp * 0.35 && inventory.hasItem('health_potion') && !player.isDead) {
            inventory.removeItem('health_potion', 1);
            player.hp = Math.min(player.maxHp, player.hp + 50);
            if (window._audio) window._audio.playSelect();
        }

        switch (this.phase) {
            case BOT_PHASE.EXPLORE:    this._phaseExplore(dt, player, chunkManager, inventory, lighting); break;
            case BOT_PHASE.MINE_ORE:   this._phaseMineOre(dt, player, chunkManager, inventory, lighting); break;
            case BOT_PHASE.PREP_BOSS1: this._phasePrepBoss1(dt, player, chunkManager, inventory, lighting); break;
            case BOT_PHASE.BOSS1:      this._phaseFightBoss(dt, player, entities, inventory, 'probe'); break;
            case BOT_PHASE.COLLECT1:   this._phaseCollectDrops(dt, player, chunkManager, inventory, lighting); break;
            case BOT_PHASE.PREP_BOSS2: this._phasePrepBoss2(dt, player, chunkManager, inventory, lighting); break;
            case BOT_PHASE.BOSS2:      this._phaseFightBoss(dt, player, entities, inventory, 'golem'); break;
            case BOT_PHASE.COLLECT2:   this._phaseCollectDrops(dt, player, chunkManager, inventory, lighting); break;
            case BOT_PHASE.UNDERWORLD: this._phaseUnderworld(dt, player, chunkManager, inventory, lighting); break;
            case BOT_PHASE.PREP_BOSS3: this._phasePrepBoss3(dt, player, chunkManager, inventory, lighting); break;
            case BOT_PHASE.BOSS3:      this._phaseFightBoss(dt, player, entities, inventory, 'eye'); break;
            case BOT_PHASE.PURIFY:     this._phasePurify(dt, player, chunkManager, inventory, lighting); break;
            case BOT_PHASE.VICTORY:    this._clearKeys(player); break;
        }
    }

    // --------------------------------------------------------------------------
    // EXPLORE — gather surface materials (wood, stone, dirt)
    // --------------------------------------------------------------------------
    _phaseExplore(dt, player, chunkManager, inventory, lighting) {
        this._selectBestTool('pickaxe', inventory);
        if (this.actionTimer <= 0) {
            this.actionTimer = 3 + Math.random() * 4;
            this.moveDir = Math.random() > 0.5 ? 1 : -1;
        }
        this._moveHorizontal(player, this.moveDir);
        const pbx = Math.floor((player.x + player.w * 0.5) / BLOCK_SIZE);
        const pby = Math.floor((player.y + player.h) / BLOCK_SIZE);
        this._jumpIfBlocked(player, chunkManager, pbx + this.moveDir, pby);
        if (this.mineTimer <= 0) {
            for (let yo = -1; yo <= 0; yo++) {
                const bid = chunkManager.getBlockAt(pbx + this.moveDir, pby + yo);
                if (bid && bid !== BLOCK.AIR && bid !== BLOCK.BEDROCK && bid !== BLOCK.TORCH) {
                    this._mineBlock(chunkManager, pbx + this.moveDir, pby + yo, bid, inventory);
                    break;
                }
            }
        }
        this._placeTorchIfNeeded(player, chunkManager, inventory, lighting);
    }

    // --------------------------------------------------------------------------
    // MINE_ORE — dig down in a zigzag staircase, collecting copper/iron/gold
    // --------------------------------------------------------------------------
    _phaseMineOre(dt, player, chunkManager, inventory, lighting) {
        this._selectBestTool('pickaxe', inventory);

        const pbx = Math.floor((player.x + player.w * 0.5) / BLOCK_SIZE);
        const pby = Math.floor((player.y + player.h) / BLOCK_SIZE);

        // Determine how deep we need to go based on what we still need
        const needGold  = inventory.countItem('gold_ore') < 18 && !inventory.hasItem('gold_pickaxe');
        const needIron  = inventory.countItem('iron_ore') < 15 && !inventory.hasItem('iron_pickaxe');
        const needCopper = inventory.countItem('copper_ore') < 12 && !inventory.hasItem('copper_pickaxe');

        const surfY = lighting.surfaceY
            ? lighting.surfaceY[Math.min(pbx, lighting.surfaceY.length - 1)]
            : Math.floor(lighting.worldH * 0.45);

        let stopDepth;
        if (needCopper) stopDepth = surfY + 30;
        else if (needIron) stopDepth = surfY + 60;
        else if (needGold) stopDepth = surfY + 100;
        else stopDepth = surfY + 30; // have enough, stay shallow

        this._moveHorizontal(player, this.digStairDir);

        if (this.mineTimer <= 0) {
            this.digStepCount++;
            const fx = pbx + this.digStairDir;
            for (let yo = -1; yo <= 0; yo++) {
                const bid = chunkManager.getBlockAt(fx, pby + yo);
                if (bid && bid !== BLOCK.AIR && bid !== BLOCK.BEDROCK) {
                    this._mineBlock(chunkManager, fx, pby + yo, bid, inventory);
                }
            }
            if (this.digStepCount % 3 === 0) {
                for (let yo = 1; yo <= 2; yo++) {
                    const bid = chunkManager.getBlockAt(pbx, pby + yo);
                    if (bid && bid !== BLOCK.AIR && bid !== BLOCK.BEDROCK) {
                        this._mineBlock(chunkManager, pbx, pby + yo, bid, inventory);
                    }
                }
            }
            if (this.digStepCount % 14 === 0) this.digStairDir *= -1;
            if (this.digStepCount % 10 === 0 && inventory.countItem('torch') > 0) {
                if (chunkManager.getBlockAt(pbx, pby - 1) === BLOCK.AIR) {
                    this._placeBlock(chunkManager, pbx, pby - 1, BLOCK.TORCH, inventory, 'torch', lighting);
                }
            }
        }

        if (pby >= stopDepth) {
            // Reached target depth — go horizontal to find ores
            if (this.actionTimer <= 0) {
                this.actionTimer = 5;
                this.digStairDir = Math.random() > 0.5 ? 1 : -1;
            }
        }

        this._jumpIfBlocked(player, chunkManager, pbx + this.digStairDir, pby);
    }

    // --------------------------------------------------------------------------
    // PREP_BOSS1 — craft copper tools, old_battery; then dig to boss 1 depth
    // --------------------------------------------------------------------------
    _phasePrepBoss1(dt, player, chunkManager, inventory, lighting) {
        const hasBattery = inventory.hasItem('old_battery');
        if (!hasBattery) {
            // Try crafting chain: planks → workbench → copper_pickaxe → old_battery
            this._tryCraft('plank', inventory);
            this._tryCraft('workbench', inventory);
            this._tryCraft('torch', inventory);
            this._tryCraft('copper_pickaxe', inventory);
            this._tryCraft('copper_sword', inventory);
            // wire is needed for old_battery; farm enemies if needed
            if (inventory.countItem('wire') < 3) {
                this._farmUntilWire(dt, player, chunkManager, inventory, lighting);
                return;
            }
            if (!this._tryCraft('old_battery', inventory)) {
                // Still gathering copper/coal
                this._phaseMineOre(dt, player, chunkManager, inventory, lighting);
                return;
            }
        }

        // Have battery — go to required depth (worldH * 0.3)
        const targetDepth = Math.floor(lighting.worldH * 0.3);
        const pby = Math.floor((player.y + player.h) / BLOCK_SIZE);
        if (pby < targetDepth) {
            this._digToDepth(dt, player, chunkManager, inventory, lighting, targetDepth);
        } else {
            // Summon boss 1
            this._selectItemInHotbar(inventory, 'old_battery');
            if (window._gameState) {
                const ok = window._gameState.trySummonBoss(player, 'old_battery');
                if (ok) this._log('INFO', '⚡ Boss 1 (SentinelProbe) invocado!');
                else this._digToDepth(dt, player, chunkManager, inventory, lighting, targetDepth + 5);
            }
        }
    }

    // --------------------------------------------------------------------------
    // PREP_BOSS2 — craft furnace, iron tools, anvil, mech_heart
    // --------------------------------------------------------------------------
    _phasePrepBoss2(dt, player, chunkManager, inventory, lighting) {
        if (inventory.hasItem('mech_heart')) {
            // Dig to boss 2 depth
            const targetDepth = Math.floor(lighting.worldH * 0.5);
            const pby = Math.floor((player.y + player.h) / BLOCK_SIZE);
            if (pby < targetDepth) {
                this._digToDepth(dt, player, chunkManager, inventory, lighting, targetDepth);
            } else {
                this._selectItemInHotbar(inventory, 'mech_heart');
                if (window._gameState) {
                    const ok = window._gameState.trySummonBoss(player, 'mech_heart');
                    if (ok) this._log('INFO', '⚙ Boss 2 (BrassGolem) invocado!');
                    else this._digToDepth(dt, player, chunkManager, inventory, lighting, targetDepth + 5);
                }
            }
            return;
        }

        // Craft chain for boss 2
        this._tryCraft('plank', inventory);
        this._tryCraft('workbench', inventory);
        this._tryCraft('furnace', inventory);
        this._tryCraft('iron_pickaxe', inventory);
        this._tryCraft('iron_sword', inventory);
        this._tryCraft('anvil', inventory);
        this._tryCraft('gold_pickaxe', inventory);
        this._tryCraft('mech_heart', inventory);

        // Check what we still need
        const hasIronPick = inventory.hasItem('iron_pickaxe');
        const hasAnvil    = inventory.hasItem('anvil');
        const advIron     = inventory.countItem('advanced_iron');

        if (advIron < 3) {
            // Farm scrap_sentinels or wait (they drop advanced_iron)
            const midDepth = Math.floor(lighting.worldH * 0.4);
            this._digToDepth(dt, player, chunkManager, inventory, lighting, midDepth);
            return;
        }

        // Mine more iron/gold if needed
        this._phaseMineOre(dt, player, chunkManager, inventory, lighting);
    }

    // --------------------------------------------------------------------------
    // UNDERWORLD — dig to worldH*0.78, mine obsidian + hellstone
    // --------------------------------------------------------------------------
    _phaseUnderworld(dt, player, chunkManager, inventory, lighting) {
        const targetDepth = Math.floor(lighting.worldH * 0.78);
        const pby = Math.floor((player.y + player.h) / BLOCK_SIZE);

        this._selectBestTool('pickaxe', inventory);

        if (pby < targetDepth) {
            this._digToDepth(dt, player, chunkManager, inventory, lighting, targetDepth);
        } else {
            // Mine obsidian + hellstone
            const obsidian  = inventory.countItem('obsidian');
            const hellstone = inventory.countItem('hellstone');
            const crystals  = inventory.countItem('crystal_fragment');
            const brass     = inventory.countItem('brass_fragment');

            if (obsidian >= 20 && hellstone >= 10 && crystals >= 3 && brass >= 5) {
                this._setPhase(BOT_PHASE.PREP_BOSS3);
                return;
            }

            // Dig horizontally to find underworld ores
            this._moveHorizontal(player, this.digStairDir);
            if (this.mineTimer <= 0) {
                this.digStepCount++;
                const fx = Math.floor((player.x + player.w * 0.5) / BLOCK_SIZE) + this.digStairDir;
                for (let yo = -1; yo <= 0; yo++) {
                    const bid = chunkManager.getBlockAt(fx, pby + yo);
                    if (bid && bid !== BLOCK.AIR && bid !== BLOCK.BEDROCK) {
                        this._mineBlock(chunkManager, fx, pby + yo, bid, inventory);
                    }
                }
                if (this.digStepCount % 12 === 0) this.digStairDir *= -1;
            }
            const pbx = Math.floor((player.x + player.w * 0.5) / BLOCK_SIZE);
            this._jumpIfBlocked(player, chunkManager, pbx + this.digStairDir, pby);
        }
    }

    // --------------------------------------------------------------------------
    // PREP_BOSS3 — craft deep_invoker; summon at underworld depth
    // --------------------------------------------------------------------------
    _phasePrepBoss3(dt, player, chunkManager, inventory, lighting) {
        this._tryCraft('deep_invoker', inventory);

        if (!inventory.hasItem('deep_invoker')) {
            this._phaseUnderworld(dt, player, chunkManager, inventory, lighting);
            return;
        }

        const targetDepth = Math.floor(lighting.worldH * 0.8);
        const pby = Math.floor((player.y + player.h) / BLOCK_SIZE);
        if (pby < targetDepth) {
            this._digToDepth(dt, player, chunkManager, inventory, lighting, targetDepth);
        } else {
            this._selectItemInHotbar(inventory, 'deep_invoker');
            if (window._gameState) {
                const ok = window._gameState.trySummonBoss(player, 'deep_invoker');
                if (ok) this._log('INFO', '👁 Boss 3 (BossEye) invocado!');
                else this._digToDepth(dt, player, chunkManager, inventory, lighting, targetDepth + 5);
            }
        }
    }

    // --------------------------------------------------------------------------
    // COLLECT DROPS — walk around for a few seconds collecting physical drops
    // --------------------------------------------------------------------------
    _phaseCollectDrops(dt, player, chunkManager, inventory, lighting) {
        this.collectTimer -= dt;
        if (this.actionTimer <= 0) {
            this.actionTimer = 1.2 + Math.random() * 1.5;
            this.moveDir *= -1;
        }
        this._moveHorizontal(player, this.moveDir);
        const pbx = Math.floor((player.x + player.w * 0.5) / BLOCK_SIZE);
        const pby = Math.floor((player.y + player.h) / BLOCK_SIZE);
        this._jumpIfBlocked(player, chunkManager, pbx + this.moveDir, pby);

        if (this.collectTimer <= 0) {
            const gs = window._gameState;
            const bossesDefeated = gs ? gs.bossesDefeated : [];
            if (this.phase === BOT_PHASE.COLLECT1) {
                this._setPhase(BOT_PHASE.PREP_BOSS2);
            } else if (this.phase === BOT_PHASE.COLLECT2) {
                this._setPhase(BOT_PHASE.UNDERWORLD);
            }
        }
    }

    // --------------------------------------------------------------------------
    // PURIFY — return to surface then call tryPurifyWorld
    // --------------------------------------------------------------------------
    _phasePurify(dt, player, chunkManager, inventory, lighting) {
        if (!inventory.hasItem('light_artifact')) {
            // artifact might still be on the ground; walk around collecting
            this._moveHorizontal(player, this.moveDir);
            if (this.actionTimer <= 0) {
                this.actionTimer = 2;
                this.moveDir *= -1;
            }
            return;
        }

        const pbx = Math.floor(player.x / BLOCK_SIZE);
        const pby = Math.floor((player.y + player.h * 0.5) / BLOCK_SIZE);
        const surfY = lighting.surfaceY
            ? lighting.surfaceY[Math.min(pbx, lighting.surfaceY.length - 1)]
            : Math.floor(lighting.worldH * 0.45);

        if (pby > surfY + 8) {
            // Need to go UP — mine upward
            this._selectBestTool('pickaxe', inventory);
            if (this.mineTimer <= 0) {
                const bid = chunkManager.getBlockAt(pbx, pby - 2);
                if (bid && bid !== BLOCK.AIR && bid !== BLOCK.BEDROCK) {
                    this._mineBlock(chunkManager, pbx, pby - 2, bid, inventory);
                }
                const bid2 = chunkManager.getBlockAt(pbx, pby - 1);
                if (bid2 && bid2 !== BLOCK.AIR && bid2 !== BLOCK.BEDROCK) {
                    this._mineBlock(chunkManager, pbx, pby - 1, bid2, inventory);
                }
            }
            // Move toward spawn which is on surface
            this._moveHorizontal(player, Math.sign(this.spawnX - player.x) || 1);
            const frontBx = pbx + (Math.sign(this.spawnX - player.x) || 1);
            this._jumpIfBlocked(player, chunkManager, frontBx, pby);
            if (player.onGround && pby < surfY + 30) {
                player.vy = -600;
                this.jumpsPerformed++;
            }
        } else {
            // On surface — purify
            if (window._gameState) {
                const ok = window._gameState.tryPurifyWorld(player);
                if (ok) {
                    this._setPhase(BOT_PHASE.VICTORY);
                    this._log('INFO', '✨ Mundo purificado! JOGO ZERADO!');
                    if (window._audio) window._audio.playVictory();
                }
            }
            this._clearKeys(player);
        }
    }

    // --------------------------------------------------------------------------
    // FIGHT BOSS — approach + attack + dodge
    // --------------------------------------------------------------------------
    _phaseFightBoss(dt, player, entities, inventory, expectedType) {
        this._selectBestTool('sword', inventory);

        const boss = entities.boss;
        if (!boss || boss.isDead()) return;

        if (boss.hp === this.lastBossHp) {
            this.bossStuckTimer += dt;
            if (this.bossStuckTimer > 8) {
                this._logError('BOSS_DAMAGE_STUCK',
                    `Dano ao boss ${expectedType} parou por ${this.bossStuckTimer.toFixed(0)}s`,
                    'src/combat/combat.js', 'Verificar hitbox / range do ataque do bot');
                this.bossStuckTimer = 0;
            }
        } else {
            this.lastBossHp = boss.hp;
            this.bossStuckTimer = 0;
        }

        const pcx = player.x + player.w * 0.5;
        const pcy = player.y + player.h * 0.5;
        const bcx = boss.x + boss.w * 0.5;
        const bcy = boss.y + boss.h * 0.5;
        const dx = bcx - pcx;
        const dist = Math.sqrt(dx * dx + (bcy - pcy) ** 2);

        // Dodge dash
        if (boss.isDashing && this.dodgeTimer <= 0) {
            this._moveHorizontal(player, Math.sign(dx) > 0 ? -1 : 1);
            if (player.onGround) { player.vy = -580; this.jumpsPerformed++; }
            this.dodgeTimer = 0.9;
            return;
        }

        // Approach
        if (dist > 60) {
            this._moveHorizontal(player, Math.sign(dx));
        } else {
            this._clearKeys(player);
        }

        // Attack
        if (this.attackTimer <= 0 && dist < 90) {
            const knockDir = Math.sign(dx) || 1;
            boss.takeDamage(30, knockDir, -0.3, 250);
            this.attackTimer = 0.30;
            player.startSwing();
            player.facing = knockDir;
            if (window._audio) { window._audio.playSwoosh(); window._audio.playHit(); }
            if (window._particles) window._particles.emitHitSparks(bcx, bcy);
        }

        // Kill minions
        for (const e of entities.getEnemies()) {
            if (e === boss || e.isDead()) continue;
            const ex = e.x + e.w * 0.5;
            const ey = e.y + e.h * 0.5;
            const ed = Math.sqrt((ex - pcx) ** 2 + (ey - pcy) ** 2);
            if (ed < 70 && this.attackTimer <= 0) {
                e.takeDamage(30, Math.sign(ex - pcx), -0.3, 350);
                this.attackTimer = 0.30;
                if (e.isDead()) this.enemiesKilled++;
                player.startSwing();
                if (window._audio) window._audio.playHit();
                break;
            }
        }
    }

    // ==========================================================================
    // HELPERS — MOVEMENT & COMBAT
    // ==========================================================================
    _fightNearbyEnemies(player, entities, inventory) {
        if (this.attackTimer > 0) return;
        const pcx = player.x + player.w * 0.5;
        const pcy = player.y + player.h * 0.5;
        for (const e of entities.getEnemies()) {
            if (e.isDead()) continue;
            const ecx = e.x + e.w * 0.5;
            const ecy = e.y + e.h * 0.5;
            const dist = Math.sqrt((ecx - pcx) ** 2 + (ecy - pcy) ** 2);
            if (dist < 65) {
                this._selectBestTool('sword', inventory);
                const knockDir = Math.sign(ecx - pcx) || 1;
                e.takeDamage(28, knockDir, -0.3, 320);
                this.attackTimer = 0.32;
                player.startSwing();
                player.facing = knockDir;
                if (e.isDead()) this.enemiesKilled++;
                if (window._audio) { window._audio.playSwoosh(); window._audio.playHit(); }
                if (window._particles) window._particles.emitHitSparks(ecx, ecy);
                break;
            }
        }
    }

    _farmUntilWire(dt, player, chunkManager, inventory, lighting) {
        // Mine underground to find cyber_infiltrators which drop wire
        const surfY = lighting.surfaceY
            ? lighting.surfaceY[Math.min(Math.floor(player.x / BLOCK_SIZE), lighting.surfaceY.length - 1)]
            : Math.floor(lighting.worldH * 0.45);
        const targetDepth = surfY + 40;
        this._digToDepth(dt, player, chunkManager, inventory, lighting, targetDepth);

        // After 90 seconds of trying, give wire directly (avoid game-breaking deadlock)
        if (this.phaseTimer > 90 && inventory.countItem('wire') < 3) {
            inventory.addItem('wire', 3);
            this._log('WARN', 'Wire não encontrado após 90s. Adicionado diretamente (bug potencial em drop rate).');
            this._logError('WIRE_DROP_RARE',
                'Bot não conseguiu wire natural em 90s de farm de Cyber Infiltrators',
                'src/items/itemRegistry.js',
                'Aumentar chance de drop de wire do cyber_infiltrator (atualmente 40%)');
        }
    }

    _digToDepth(dt, player, chunkManager, inventory, lighting, targetBlockY) {
        this._selectBestTool('pickaxe', inventory);
        const pbx = Math.floor((player.x + player.w * 0.5) / BLOCK_SIZE);
        const pby = Math.floor((player.y + player.h) / BLOCK_SIZE);

        if (pby >= targetBlockY) return; // already deep enough

        this._moveHorizontal(player, this.digStairDir);

        if (this.mineTimer <= 0) {
            this.digStepCount++;
            const fx = pbx + this.digStairDir;
            for (let yo = -1; yo <= 0; yo++) {
                const bid = chunkManager.getBlockAt(fx, pby + yo);
                if (bid && bid !== BLOCK.AIR && bid !== BLOCK.BEDROCK) {
                    this._mineBlock(chunkManager, fx, pby + yo, bid, inventory);
                }
            }
            if (this.digStepCount % 3 === 0) {
                for (let yo = 1; yo <= 2; yo++) {
                    const bid = chunkManager.getBlockAt(pbx, pby + yo);
                    if (bid && bid !== BLOCK.AIR && bid !== BLOCK.BEDROCK) {
                        this._mineBlock(chunkManager, pbx, pby + yo, bid, inventory);
                    }
                }
            }
            if (this.digStepCount % 14 === 0) this.digStairDir *= -1;
            if (this.digStepCount % 10 === 0 && inventory.countItem('torch') > 0) {
                if (chunkManager.getBlockAt(pbx, pby - 1) === BLOCK.AIR) {
                    this._placeBlock(chunkManager, pbx, pby - 1, BLOCK.TORCH, inventory, 'torch', lighting);
                }
            }
        }

        this._jumpIfBlocked(player, chunkManager, pbx + this.digStairDir, pby);
    }

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
        const blocked =
            (chunkManager.getBlockAt(frontBx, footBy - 1) !== BLOCK.AIR &&
             chunkManager.getBlockAt(frontBx, footBy - 1) !== BLOCK.TORCH) ||
            (chunkManager.getBlockAt(frontBx, footBy) !== BLOCK.AIR &&
             chunkManager.getBlockAt(frontBx, footBy) !== BLOCK.TORCH);
        if (blocked) {
            player.jumpBufferEnd = performance.now() + 150;
            player.vy = -560;
            this.jumpTimer = 0.45;
            this.jumpsPerformed++;
        }
    }

    _placeTorchIfNeeded(player, chunkManager, inventory, lighting) {
        if (!lighting.isNight() || this.buildCooldown > 0 || inventory.countItem('torch') <= 0) return;
        const pbx = Math.floor((player.x + player.w * 0.5) / BLOCK_SIZE);
        const pby = Math.floor((player.y + player.h) / BLOCK_SIZE);
        if (chunkManager.getBlockAt(pbx, pby - 1) === BLOCK.AIR) {
            this._placeBlock(chunkManager, pbx, pby - 1, BLOCK.TORCH, inventory, 'torch', lighting);
            this.buildCooldown = 8;
        }
    }

    // ==========================================================================
    // TOOL SELECTION
    // ==========================================================================
    _selectBestTool(kind, inventory) {
        const priority = kind === 'pickaxe'
            ? ['gold_pickaxe', 'iron_pickaxe', 'copper_pickaxe', 'pickaxe']
            : ['plasma_sword', 'gold_sword', 'iron_sword', 'copper_sword', 'sword'];

        for (const id of priority) {
            for (let i = 0; i < 10; i++) {
                if (inventory.hotbar[i].itemId === id) {
                    inventory.selectedSlot = i;
                    return;
                }
            }
            // Also check main inventory and swap to hotbar empty slot
            for (let i = 0; i < inventory.inventory.length; i++) {
                if (inventory.inventory[i].itemId === id) {
                    // Find empty hotbar slot to put it in
                    for (let h = 9; h >= 2; h--) {
                        if (!inventory.hotbar[h].itemId) {
                            inventory.hotbar[h] = { ...inventory.inventory[i] };
                            inventory.inventory[i] = { itemId: null, quantity: 0 };
                            inventory.selectedSlot = h;
                            return;
                        }
                    }
                }
            }
        }
    }

    _selectItemInHotbar(inventory, itemId) {
        for (let i = 0; i < 10; i++) {
            if (inventory.hotbar[i].itemId === itemId) {
                inventory.selectedSlot = i;
                return true;
            }
        }
        // Move from main inventory to hotbar
        for (let i = 0; i < inventory.inventory.length; i++) {
            if (inventory.inventory[i].itemId === itemId) {
                for (let h = 9; h >= 0; h--) {
                    if (!inventory.hotbar[h].itemId) {
                        inventory.hotbar[h] = { ...inventory.inventory[i] };
                        inventory.inventory[i] = { itemId: null, quantity: 0 };
                        inventory.selectedSlot = h;
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // ==========================================================================
    // CRAFTING
    // ==========================================================================
    _tryCraft(itemId, inventory) {
        if (inventory.hasItem(itemId)) return true;
        const recipe = RECIPES[itemId];
        if (!recipe) return false;
        for (const [matId, count] of Object.entries(recipe.materials)) {
            if (inventory.countItem(matId) < count) return false;
        }
        for (const [matId, count] of Object.entries(recipe.materials)) {
            inventory.removeItem(matId, count);
        }
        const amount = recipe.yield || 1;
        inventory.addItem(itemId, amount);
        this._log('INFO', `🔨 Craftou: ${itemId}${amount > 1 ? ' x' + amount : ''}`);
        if (window._audio) window._audio.playSelect();
        return true;
    }

    _autoCraft(inventory) {
        // Craft torches and planks automatically when possible
        this._tryCraft('plank', inventory);
        this._tryCraft('torch', inventory);
        this._tryCraft('workbench', inventory);
    }

    _mineBlock(chunkManager, bx, by, blockId, inventory) {
        if (this.mineTimer > 0) return;
        const dropId = BLOCK_TO_ITEM[blockId];
        if (dropId) inventory.addItem(dropId, 1);
        const color = BLOCK_COLORS[blockId] || '#666';
        chunkManager.setBlockAt(bx, by, BLOCK.AIR);
        this.blocksMined++;
        this.mineTimer = 0.16;
        if (window._particles) window._particles.emitBlockBreak(bx * BLOCK_SIZE, by * BLOCK_SIZE, color);
        if (window._audio) window._audio.playBlockBreak();
    }

    _placeBlock(chunkManager, bx, by, blockId, inventory, itemId, lighting) {
        if (inventory.countItem(itemId) <= 0) return;
        if (chunkManager.getBlockAt(bx, by) !== BLOCK.AIR) return;
        chunkManager.setBlockAt(bx, by, blockId);
        inventory.removeItem(itemId, 1);
        this.blocksPlaced++;
        if (blockId === BLOCK.TORCH && lighting) {
            lighting.addTorch(bx, by);
            this.torchesPlaced++;
        }
        if (window._audio) window._audio.playPlace();
    }

    _phaseName() { return PHASE_NAMES[this.phase] || '?'; }

    // ==========================================================================
    // MONITORING
    // ==========================================================================
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
                    this._logError('LOW_FPS', 'FPS < 30 por 3s consecutivos',
                        'src/core/engine.js', 'Reduzir chunks visíveis ou otimizar renderização');
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
                if (id && id !== BLOCK.AIR && id !== BLOCK.TORCH) {
                    this.clippingBugs++;
                    this._logError('CLIPPING', `Jogador dentro de bloco ${id} em (${bx},${by})`,
                        'src/entities/player.js', 'Revisar _resolveX/_resolveY para push-out mais agressivo');
                    player.y = (by - 1) * BLOCK_SIZE - player.h;
                    player.vy = 0;
                    return;
                }
            }
        }
    }

    _detectStuck(dt, player, chunkManager) {
        const ddx = Math.abs(player.x - this.lastPlayerPos.x);
        const ddy = Math.abs(player.y - this.lastPlayerPos.y);
        if (ddx < 0.3 && ddy < 0.3 && !player.isDead) {
            this.stuckTimer += dt;
            if (this.stuckTimer > this.stuckThreshold) {
                this._logError('STUCK',
                    `Preso por ${this.stuckTimer.toFixed(1)}s em (${Math.floor(player.x)},${Math.floor(player.y)})`,
                    'src/entities/player.js', 'Melhorar pathfinding do bot');
                this.stuckTimer = 0;
                player.vy = -580;
                this.moveDir *= -1;
                this.digStairDir *= -1;
                const pbx = Math.floor(player.x / BLOCK_SIZE);
                const pby = Math.floor(player.y / BLOCK_SIZE);
                for (let ox = -1; ox <= 1; ox++) {
                    for (let oy = -1; oy <= 1; oy++) {
                        const bid = chunkManager.getBlockAt(pbx + ox, pby + oy);
                        if (bid && bid !== BLOCK.AIR && bid !== BLOCK.BEDROCK) {
                            chunkManager.setBlockAt(pbx + ox, pby + oy, BLOCK.AIR);
                            this.blocksMined++;
                        }
                    }
                }
            }
        } else {
            this.stuckTimer = 0;
        }
    }

    // ==========================================================================
    // LOGGING & REPORT
    // ==========================================================================
    _log(level, msg) {
        const entry = { time: this.playTime.toFixed(1), level, msg, timestamp: new Date().toISOString() };
        this.logs.push(entry);
        if (this.logs.length > 300) this.logs.shift();
        console.log(`[QABot ${level}] ${msg}`);
    }

    _logError(type, description, file, suggestion) {
        const entry = { type, description, file, suggestion, time: this.playTime.toFixed(1), timestamp: new Date().toISOString() };
        this.errors.push(entry);
        this._log('ERROR', `${type}: ${description}`);
    }

    exportReport() {
        const gs = window._gameState;
        const bossesDefeated = gs ? gs.bossesDefeated : [];
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
        r += `\nBosses Derrotados: ${bossesDefeated.length}/3`;
        if (bossesDefeated.includes('probe'))  r += ' [SentinelProbe ✅]';
        if (bossesDefeated.includes('golem'))  r += ' [BrassGolem ✅]';
        if (bossesDefeated.includes('eye'))    r += ' [BossEye ✅]';
        r += '\n';
        r += '\n─── ESTATÍSTICAS ───────────────────────────────────────────────\n';
        r += `Blocos Minerados: ${this.blocksMined}\n`;
        r += `Blocos Colocados: ${this.blocksPlaced}\n`;
        r += `Tochas Colocadas: ${this.torchesPlaced}\n`;
        r += `Inimigos Abatidos: ${this.enemiesKilled}\n`;
        r += `Pulos Realizados: ${this.jumpsPerformed}\n`;
        r += `Mortes: ${this.deathCount}\n`;
        r += `Bugs de Clipping: ${this.clippingBugs}\n`;
        r += `Quedas de FPS (<30): ${this.errors.filter(e => e.type === 'LOW_FPS').length}\n`;
        r += '\n';

        if (this.errors.length > 0) {
            r += '─── ERROS DETECTADOS ───────────────────────────────────────────\n';
            for (const err of this.errors) {
                r += `\n[ERRO] ${err.type} (${err.time}s)\n`;
                r += `  Descrição: ${err.description}\n`;
                r += `  Arquivo: ${err.file}\n`;
                r += `  Sugestão: ${err.suggestion}\n`;
            }
        } else {
            r += '─── NENHUM ERRO CRÍTICO DETECTADO ──────────────────────────────\n';
        }

        r += '\n─── LOG (últimas 100 entradas) ─────────────────────────────────\n';
        for (const log of this.logs.slice(-100)) {
            r += `[${log.time}s] [${log.level}] ${log.msg}\n`;
        }
        r += '\n═══════════════════════════════════════════════════════════════\n';
        r += 'Gerado automaticamente pelo QABot\n';
        r += '═══════════════════════════════════════════════════════════════\n';
        return r;
    }

    downloadReport() {
        const text = this.exportReport();
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'terravoxel_qa_report.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this._log('INFO', 'Relatório exportado.');
    }

    // ==========================================================================
    // HUD OVERLAY
    // ==========================================================================
    draw(ctx, canvasW, canvasH) {
        if (!this.active) return;

        const gs = window._gameState;
        const bossCount = gs ? gs.bossesDefeated.length : 0;
        const panelW = 270;
        const panelH = 100;
        const px = 10;
        const py = canvasH - panelH - 10;

        ctx.fillStyle = 'rgba(0,20,0,0.85)';
        ctx.fillRect(px, py, panelW, panelH);
        ctx.strokeStyle = '#33ff55';
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, panelW, panelH);

        let y = py + 14;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#44ff44';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`🤖 QA BOT — ${this._phaseName()}`, px + 8, y); y += 14;

        ctx.fillStyle = '#aaffaa';
        ctx.font = '10px monospace';
        ctx.fillText(`Tempo: ${Math.floor(this.playTime)}s | Mortes: ${this.deathCount} | Erros: ${this.errors.length}`, px + 8, y); y += 13;
        ctx.fillText(`Minou: ${this.blocksMined} | Kills: ${this.enemiesKilled} | Tochas: ${this.torchesPlaced}`, px + 8, y); y += 13;
        ctx.fillText(`Bosses: ${bossCount}/3 | Pulos: ${this.jumpsPerformed} | Clipping: ${this.clippingBugs}`, px + 8, y); y += 13;

        // Progress bar — based on phase out of total
        const progress = this.phase === BOT_PHASE.VICTORY ? 1 : this.phase / (BOT_PHASE.VICTORY);
        ctx.fillStyle = '#1a3a1a';
        ctx.fillRect(px + 8, y, panelW - 16, 8);
        ctx.fillStyle = this.phase === BOT_PHASE.VICTORY ? '#44ff44' : '#55cc33';
        ctx.fillRect(px + 8, y, (panelW - 16) * progress, 8);
        ctx.fillStyle = '#aaffaa';
        ctx.font = '8px monospace';
        ctx.fillText(this.phase === BOT_PHASE.VICTORY ? '✅ JOGO ZERADO!' : `Fase ${this.phase}/${BOT_PHASE.VICTORY}`, px + 8, y + 18);
    }

    drawExportButton(ctx, canvasW) {
        const btnW = 200;
        const btnH = 28;
        const x = canvasW - btnW - 12;
        const y = 70;

        ctx.fillStyle = 'rgba(40,20,0,0.88)';
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
