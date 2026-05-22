/**
 * EntityManager — Spawns, updates, despawns, and renders all enemies.
 * Handles spawn rules based on time-of-day, depth, and distance from player.
 */

const MAX_ENEMIES      = 30;   // limite absoluto (sem bosses)
const MAX_SURFACE      = 8;    // limite por bioma — superfície
const MAX_CAVERN       = 12;   // limite por bioma — cavernas
const MAX_UNDERWORLD   = 10;   // limite por bioma — submundo
const SPAWN_INTERVAL_BASE = 2.5; // s mínimo entre tentativas
const SPAWN_INTERVAL_MAX  = 12;  // s máximo (quando próximo do cap)
const SPAWN_RANGE_MIN  = 400;
const SPAWN_RANGE_MAX  = 800;

class EntityManager {
    constructor(chunkManager, lighting) {
        this.enemies = [];
        this.chunkManager = chunkManager;
        this.lighting = lighting;
        this.spawnTimer = 0;
        this.totalKills = 0;
        this.boss = null;

        this.dropManager = new DropManager(chunkManager);

        // Group aggro: when any enemy takes damage, alert nearby same-type enemies
        events.on('enemy:damage', ({ enemy, x, y }) => {
            if (enemy && !enemy.isBoss) this._alertNearby(x, y, enemy.type, 300);
        });
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

        // ── Controle Populacional ─────────────────────────────────────────
        // Bosses não contam para o cap regular; o intervalo de spawn escala
        // dinamicamente: quanto mais inimigos, mais raro o próximo surgimento.
        const nonBossCount = this.enemies.filter(e => !e.isBoss).length;
        const loadFactor   = nonBossCount / MAX_ENEMIES;            // 0 → 1
        const spawnInterval = SPAWN_INTERVAL_BASE
            + loadFactor * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_BASE); // 2.5s → 12s

        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && !player.isDead) {
            if (this._canSpawnInBiome(py)) {
                this._trySpawn(px, py, player);
            }
            this.spawnTimer = spawnInterval;
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
        let biome;
        if (by >= underworldThreshold) {
            biome = 'underworld';
            if (Math.random() < 0.3) enemy = new ScrapSentinel(sx, sy);
            else                      enemy = new FireDemon(sx, sy);
        } else if (by >= cavernThreshold) {
            biome = 'cavern';
            const roll = Math.random();
            if      (roll < 0.4) enemy = new Bat(sx, sy);
            else if (roll < 0.7) enemy = new CyberInfiltrator(sx, sy);
            else                  enemy = new CrystalSpider(sx, sy);
        } else if (isNight) {
            biome = 'surface';
            enemy = new Zombie(sx, sy);
        } else {
            biome = 'surface';
            enemy = new Slime(sx, sy);
        }

        enemy._biome = biome; // marca bioma para controle populacional
        this.enemies.push(enemy);
    }

    /**
     * Verifica se o bioma atual ainda tem espaço para spawnar.
     * Conta apenas inimigos não-boss do mesmo bioma.
     */
    _canSpawnInBiome(playerWorldY) {
        const worldH = this.chunkManager.worldH;
        const by = Math.floor(playerWorldY / BLOCK_SIZE);
        const cavernY    = Math.floor(worldH * 0.5);
        const underworldY= Math.floor(worldH * 0.8);

        let biome, cap;
        if (by >= underworldY)     { biome = 'underworld'; cap = MAX_UNDERWORLD; }
        else if (by >= cavernY)    { biome = 'cavern';      cap = MAX_CAVERN;     }
        else                        { biome = 'surface';     cap = MAX_SURFACE;    }

        const biomeCount = this.enemies.filter(e => !e.isBoss && e._biome === biome).length;
        return biomeCount < cap;
    }

    /**
     * Alert nearby enemies of the same type that a fight is happening.
     * Called when an enemy takes damage; forces aggro on same-type units within radius.
     */
    _alertNearby(cx, cy, type, radius) {
        for (const e of this.enemies) {
            if (e.type !== type || e.isBoss) continue;
            const dx = (e.x + e.w * 0.5) - cx;
            const dy = (e.y + e.h * 0.5) - cy;
            if (dx * dx + dy * dy < radius * radius) {
                e.alerted = true;
                e.alertTimer = 5; // stay alerted for 5 seconds
            }
        }
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
