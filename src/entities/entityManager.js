/**
 * EntityManager — Spawns, updates, despawns, and renders all enemies.
 * Handles spawn rules based on time-of-day, depth, and distance from player.
 */

const MAX_ENEMIES = 30;
const SPAWN_INTERVAL = 2.5; // seconds between spawn attempts
const SPAWN_RANGE_MIN = 400; // min distance from player to spawn
const SPAWN_RANGE_MAX = 800; // max distance

class EntityManager {
    constructor(chunkManager, lighting) {
        this.enemies = [];
        this.chunkManager = chunkManager;
        this.lighting = lighting;
        this.spawnTimer = 0;
        this.totalKills = 0;
        this.boss = null;

        // Drop manager (entidades físicas de itens caídos)
        this.dropManager = new DropManager(chunkManager);
    }

    /**
     * Spawn a boss by type at a given position.
     * @param {string} bossType - 'probe', 'golem', or 'eye'
     */
    spawnBoss(bossType, x, y) {
        let boss;
        if (bossType === 'probe') {
            boss = new SentinelProbe(x - 24, y - 16);
            boss.type = 'probe';
        } else if (bossType === 'golem') {
            boss = new BrassGolem(x - 20, y - 25);
            boss.type = 'golem';
        } else if (bossType === 'eye') {
            boss = new BossEye(x - 32, y - 32);
            boss.type = 'eye';
        } else {
            boss = new BossEye(x - 32, y - 32);
            boss.type = 'eye';
        }

        boss.spawnCallback = (sx, sy) => {
            const slime = new Slime(sx, sy);
            this.enemies.push(slime);
        };
        this.boss = boss;
        this.enemies.push(boss);
        return boss;
    }

    /**
     * Update all enemies and handle spawning.
     * @param {Object} inventory - referência do inventário do jogador (para pickup automático)
     */
    update(dt, player, inventory) {
        const px = player.x + player.w * 0.5;
        const py = player.y + player.h * 0.5;

        // Spawn logic
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && this.enemies.length < MAX_ENEMIES && !player.isDead) {
            this._trySpawn(px, py, player);
            this.spawnTimer = SPAWN_INTERVAL;
        }

        // Update + despawn enemies
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            e.update(dt, px, py, this.chunkManager);

            // Despawn if too far
            const edx = e.x - px;
            const edy = e.y - py;
            const edist = Math.sqrt(edx * edx + edy * edy);
            if (edist > e.despawnDist) {
                this.enemies.splice(i, 1);
                continue;
            }

            // Remove dead → spawn drops da tabela
            if (e.isDead()) {
                this.totalKills++;
                if (e === this.boss) this.boss = null;
                // Spawn drops físicos no centro do inimigo
                const ecx = e.x + e.w * 0.5;
                const ecy = e.y + e.h * 0.5;
                const table = getDropTable(e);
                if (table) {
                    this.dropManager.spawnFromTable(table, ecx, ecy);
                }
                this.enemies.splice(i, 1);
            }
        }

        // Update drops (física + magnetismo + pickup)
        if (inventory) this.dropManager.update(dt, player, inventory);
    }

    /**
     * Try to spawn an enemy near the player based on conditions.
     * Spawns different enemies based on biome (Surface, Cavern, Underworld).
     */
    _trySpawn(px, py, player) {
        // Random angle and distance
        const angle = Math.random() * Math.PI * 2;
        const dist = SPAWN_RANGE_MIN + Math.random() * (SPAWN_RANGE_MAX - SPAWN_RANGE_MIN);
        const sx = px + Math.cos(angle) * dist;
        const sy = py + Math.sin(angle) * dist;

        // Check bounds
        const bx = Math.floor(sx / BLOCK_SIZE);
        const by = Math.floor(sy / BLOCK_SIZE);
        if (bx < 0 || bx >= this.chunkManager.worldW || by < 0 || by >= this.chunkManager.worldH) return;

        // Need air to spawn
        if (this.chunkManager.getBlockAt(bx, by) !== BLOCK.AIR) return;

        // Determine biome based on depth
        const worldH = this.chunkManager.worldH;
        const surfaceY = this.lighting.surfaceY ? this.lighting.surfaceY[Math.min(bx, this.lighting.worldW - 1)] : 300;
        const cavernThreshold = Math.floor(worldH * 0.5);
        const underworldThreshold = Math.floor(worldH * 0.8);
        const isNight = this.lighting.isNight();

        let enemy;
        if (by >= underworldThreshold) {
            // Underworld: Fire Demon, Scrap Sentinel
            if (Math.random() < 0.3) {
                enemy = new ScrapSentinel(sx, sy);
            } else {
                enemy = new FireDemon(sx, sy);
            }
        } else if (by >= cavernThreshold) {
            // Cavern: Bat, Cyber Infiltrator, Crystal Spider
            const roll = Math.random();
            if (roll < 0.4) {
                enemy = new Bat(sx, sy);
            } else if (roll < 0.7) {
                enemy = new CyberInfiltrator(sx, sy);
            } else {
                enemy = new CrystalSpider(sx, sy);
            }
        } else if (isNight) {
            // Surface at night: Zombie with neon eyes
            enemy = new Zombie(sx, sy);
        } else {
            // Surface during day: Slime
            enemy = new Slime(sx, sy);
        }

        this.enemies.push(enemy);
    }

    /**
     * Draw all enemies + drops in view.
     */
    draw(ctx, camera) {
        const view = camera.getViewBounds();
        for (const e of this.enemies) {
            // Frustum cull enemies
            if (e.x + e.w < view.left - 50 || e.x > view.right + 50) continue;
            if (e.y + e.h < view.top - 50 || e.y > view.bottom + 50) continue;
            e.draw(ctx, camera);
        }
        // Drops desenhados depois para ficar na frente
        this.dropManager.draw(ctx, camera);
    }

    /**
     * Get all enemies for collision checks.
     */
    getEnemies() {
        return this.enemies;
    }

    /**
     * Helper: spawn um drop avulso (usado por combat.js para drops de blocos).
     */
    spawnDrop(itemId, quantity, x, y, opts) {
        return this.dropManager.spawn(itemId, quantity, x, y, opts);
    }
}
