/**
 * GameState — Progression, boss tracking, NPC spawning, victory condition, tiered progression.
 * Sandbox gameplay with organic boss order and lore discovery.
 */

class GameState {
    constructor(hud, entityManager, inventory, lighting) {
        this.hud = hud;
        this.entities = entityManager;
        this.inventory = inventory;
        this.lighting = lighting;

        this.playTime = 0;
        this.gameOver = false;
        this.victory = false;
        this.purified = false;

        // Boss tracking
        this.bossesDefeated = []; // 'probe', 'golem', 'eye'
        this.activeBoss = null;

        this.deathTimer = 0;
        this.introShown = false;

        // Crafting auto-check timers
        this.craftCheckTimer = 0;
    }

    showIntro() {
        if (this.introShown) return;
        this.introShown = true;
        this.hud.showMessage('O mundo foi devastado pelo Cataclismo de Silício.', 6, '#ff88ff');
        setTimeout(() => {
            this.hud.showMessage('Explore, mine, evolua suas ferramentas.', 5, '#aa88ff');
        }, 3000);
        setTimeout(() => {
            this.hud.showMessage('Derrote os chefões e purifique o Núcleo.', 5, '#aa88ff');
        }, 5000);
    }

    update(dt, player) {
        if (this.victory || this.purified) return;
        this.playTime += dt;
        this.craftCheckTimer += dt;

        // Death check
        if (player.isDead && !this.gameOver) {
            this.hud.deathScreen = true;
            this.deathTimer = 3;
            this.gameOver = true;
        }
        if (this.gameOver) {
            this.deathTimer -= dt;
            if (this.deathTimer <= 0) this._respawnPlayer(player);
            return;
        }

        // Auto-craft check every 2 seconds
        if (this.craftCheckTimer >= 2) {
            this.craftCheckTimer = 0;
            this._tryAutoCraft();
        }

        // Boss HP update
        if (this.activeBoss && !this.activeBoss.isDead()) {
            this.hud.setBoss(this.activeBoss.bossName, this.activeBoss.hp, this.activeBoss.maxHp);
        } else if (this.activeBoss && this.activeBoss.isDead()) {
            this._onBossDefeated(this.activeBoss);
            this.activeBoss = null;
            this.hud.showBossBar = false;
        }
    }

    _tryAutoCraft() {
        // Auto-craft only hand recipes (station === null) when player already
        // has none of the result. This is a convenience for torches/planks.
        for (const [itemId, recipe] of Object.entries(RECIPES)) {
            if (recipe.station !== null) continue; // needs workstation — skip
            if (this.inventory.hasItem(itemId)) continue;
            let canCraft = true;
            for (const [matId, count] of Object.entries(recipe.materials)) {
                if (this.inventory.countItem(matId) < count) {
                    canCraft = false;
                    break;
                }
            }
            if (canCraft) {
                for (const [matId, count] of Object.entries(recipe.materials)) {
                    this.inventory.removeItem(matId, count);
                }
                const amount = recipe.yield || 1;
                this.inventory.addItem(itemId, amount);
                const def = getItemDef(itemId);
                const msg = amount > 1 ? `${def.name} x${amount} criado!` : `${def.name} criado!`;
                this.hud.showMessage(msg, 3, '#44ff44');
                if (window._audio) window._audio.playSelect();
                return;
            }
        }
    }

    // Boss summoning methods
    trySummonBoss(player, summonItemId) {
        if (this.activeBoss) {
            this.hud.showMessage('Um chefe já está ativo!', 3, '#ff8888');
            return false;
        }

        const pby = Math.floor((player.y + player.h * 0.5) / BLOCK_SIZE);
        const worldH = this.lighting.worldH;

        let bossType = null;
        let requiredDepth = 0;

        if (summonItemId === 'old_battery') {
            bossType = 'probe';
            requiredDepth = Math.floor(worldH * 0.3); // cavern
        } else if (summonItemId === 'mech_heart') {
            bossType = 'golem';
            requiredDepth = Math.floor(worldH * 0.5); // deep cavern/gold zone
        } else if (summonItemId === 'deep_invoker') {
            bossType = 'eye';
            requiredDepth = Math.floor(worldH * 0.8); // underworld
        }

        if (!bossType) return false;

        if (pby < requiredDepth) {
            this.hud.showMessage('Deve ser usado mais profundo!', 3, '#ff8888');
            return false;
        }

        this.inventory.removeItem(summonItemId, 1);

        // Spawn boss
        const boss = this.entities.spawnBoss(bossType, player.x, player.y - 150);
        this.activeBoss = boss;
        this.hud.showMessage(`${boss.bossName} despertou!`, 4, '#ff0000');
        this.hud.setBoss(boss.bossName, boss.hp, boss.maxHp);
        this.hud.showBossBar = true;
        events.emit('boss:spawn', { boss, type: bossType });
        return true;
    }

    _onBossDefeated(boss) {
        this.bossesDefeated.push(boss.type);
        this.hud.showMessage(`${boss.bossName} foi derrotado!`, 5, '#44ff44');
        events.emit('boss:death', { boss, type: boss.type });

        // Drops são spawnados pelo EntityManager via DROP_TABLES.
        // Mensagem extra de hint para o jogador:
        if (boss.type === 'probe') {
            this.hud.showMessage('Drops espalhados! Colete-os.', 4, '#ffaa44');
        } else if (boss.type === 'golem') {
            this.hud.showMessage('Drops espalhados! Colete-os.', 4, '#ffaa44');
        } else if (boss.type === 'eye') {
            this.hud.showMessage('Artefato de Luz dropou! Leve à superfície para purificar!', 6, '#ffffff');
        }

        if (window._audio) window._audio.playVictory();
    }

    /**
     * Hook chamado quando um inimigo morre.
     * Drops já são spawnados pelo EntityManager — aqui só notificamos itens raros.
     */
    onEnemyKilled(enemy) {
        // Notificar drop de cristal (visual feedback)
        if (enemy.dropsCrystal) {
            // O drop já foi spawnado fisicamente; só log opcional
        }
    }

    // Victory condition
    tryPurifyWorld(player) {
        if (!this.inventory.hasItem('light_artifact')) {
            this.hud.showMessage('Você precisa do Artefato de Luz!', 3, '#ff8888');
            return false;
        }

        const pbx = Math.floor(player.x / BLOCK_SIZE);
        const pby = Math.floor((player.y + player.h * 0.5) / BLOCK_SIZE);
        const surfaceY = this.lighting.surfaceY
            ? this.lighting.surfaceY[Math.max(0, Math.min(this.lighting.worldW - 1, pbx))]
            : 100;

        if (pby > surfaceY + 10) {
            this.hud.showMessage('Vá até a superfície para purificar!', 3, '#ff8888');
            return false;
        }

        this.inventory.removeItem('light_artifact', 1);
        this.purified = true;
        this.victory = true;
        this.hud.victoryScreen = true;
        this.hud.victoryStats = {
            time: this.getPlayTimeString(),
            bossesDefeated: this.bossesDefeated.length,
            coins: this.inventory.countItem('coin'),
        };
        events.emit('game:victory', {
            time: this.getPlayTimeString(),
            bossesDefeated: this.bossesDefeated.length,
        });
        return true;
    }

    /**
     * Handle a dialogue option action. Called from DialogueSystem.onOptionSelected.
     * @param {string} action - e.g. 'buy_potion', 'purify', 'upgrade_pickaxe'
     * @param {Object} player - player reference
     */
    handleDialogueAction(action, player) {
        switch (action) {
            case 'purify':
                this.tryPurifyWorld(player);
                break;
            case 'buy_potion':
                if (this.inventory.countItem('coin') >= 20) {
                    this.inventory.removeItem('coin', 20);
                    this.inventory.addItem('health_potion', 1);
                    this.hud.showMessage('Poção de Vida comprada!', 2, '#44ff44');
                }
                break;
            case 'buy_plasma_sword':
                if (this.inventory.countItem('coin') >= 100 && !this.inventory.hasItem('plasma_sword')) {
                    this.inventory.removeItem('coin', 100);
                    this.inventory.addItem('plasma_sword', 1);
                    this.hud.showMessage('Espada de Plasma comprada!', 3, '#44ddff');
                }
                break;
            case 'buy_wire':
                if (this.inventory.countItem('coin') >= 5) {
                    this.inventory.removeItem('coin', 5);
                    this.inventory.addItem('wire', 5);
                    this.hud.showMessage('Fios comprados!', 2, '#44ff44');
                }
                break;
            case 'buy_trap':
                if (this.inventory.countItem('coin') >= 15) {
                    this.inventory.removeItem('coin', 15);
                    this.inventory.addItem('trap', 1);
                    this.hud.showMessage('Armadilha comprada!', 2, '#44ff44');
                }
                break;
            case 'upgrade_pickaxe':
                if (this.inventory.countItem('coin') >= 50) {
                    this.inventory.removeItem('coin', 50);
                    this.inventory.addItem('iron_pickaxe', 1);
                    this.hud.showMessage('Picareta de Ferro adquirida!', 3, '#44ff44');
                }
                break;
        }
    }

    _respawnPlayer(player) {
        const spawnX = Math.floor(this.lighting.worldW * 0.5);
        const spawnY = this.lighting.surfaceY ? this.lighting.surfaceY[spawnX] - 3 : 100;
        player.x = spawnX * BLOCK_SIZE;
        player.y = spawnY * BLOCK_SIZE;
        player.vx = 0;
        player.vy = 0;
        player.hp = player.maxHp;
        player.isDead = false;
        player.invulnTimer = 2;
        this.hud.deathScreen = false;
        this.gameOver = false;
    }

    getPlayTimeString() {
        const mins = Math.floor(this.playTime / 60);
        const secs = Math.floor(this.playTime % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}
