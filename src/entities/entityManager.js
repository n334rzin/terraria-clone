/**
 * EntityManager — Spawns, updates, despawns, and renders all enemies.
 *
 * Population control:
 *   • Global cap: MAX_ENEMIES non-boss enemies total.
 *   • Per-biome caps: MAX_SURFACE / MAX_CAVERN / MAX_UNDERWORLD.
 *   • Spawn interval scales from SPAWN_INTERVAL_BASE (empty) to SPAWN_INTERVAL_MAX (near cap).
 *   • Bosses are tracked separately and never count toward any cap.
 *
 * Biome depth thresholds (fraction of worldH):
 *   Surface    : by < CAVERN_FRAC
 *   Cavern     : CAVERN_FRAC ≤ by < UNDERWORLD_FRAC
 *   Underworld : by ≥ UNDERWORLD_FRAC
 *
 * To add a new biome enemy:
 *   1. Create the class in enemies.js and assign this.type = ENEMY_TYPE.YOUR_TYPE.
 *   2. Add a drop table in itemRegistry.js → DROP_TABLES.
 *   3. Update getDropTable() in itemRegistry.js.
 *   4. Add a spawn case in _trySpawn() below under the correct biome branch.
 */

// ── Population caps ───────────────────────────────────────────────────────────
const MAX_ENEMIES    = 30;  // absolute cap (non-boss)
const MAX_SURFACE    = 8;   // per-biome cap — surface
const MAX_CAVERN     = 12;  // per-biome cap — cavern
const MAX_UNDERWORLD = 10;  // per-biome cap — underworld

// ── Spawn timing ──────────────────────────────────────────────────────────────
// Interval scales linearly from BASE (empty world) to MAX (near pop cap).
const SPAWN_INTERVAL_BASE = 2.5;  // seconds between attempts when world is empty
const SPAWN_INTERVAL_MAX  = 12;   // seconds between attempts when near MAX_ENEMIES

// ── Spawn radius ──────────────────────────────────────────────────────────────
const SPAWN_RANGE_MIN = 400; // px — minimum distance from player to spawn point
const SPAWN_RANGE_MAX = 800; // px — maximum distance from player to spawn point

// ── Biome depth thresholds (fraction of worldH block rows) ───────────────────
const CAVERN_FRAC     = 0.5;  // below this fraction → cavern
const UNDERWORLD_FRAC = 0.8;  // below this fraction → underworld


class EntityManager {
    /**
     * @param {ChunkManager}   chunkManager
     * @param {LightingSystem} lighting
     */
    constructor(chunkManager, lighting) {
        this.enemies      = [];
        this.chunkManager = chunkManager;
        this.lighting     = lighting;
        this.spawnTimer   = 0;
        this.totalKills   = 0;
        this.boss         = null; // reference to the currently active boss (null if none)

        this.dropManager  = new DropManager(chunkManager);

        // Per-biome counters — maintained incrementally to avoid filter() each frame.
        // Incremented in _trySpawn, decremented when an enemy is removed.
        this._biomeCounts = { surface: 0, cavern: 0, underworld: 0 };

        // Group aggro: when any non-boss enemy takes damage, all same-type
        // enemies within 300 px become alerted.
        events.on('enemy:damage', ({ enemy, x, y }) => {
            if (enemy && !enemy.isBoss) this._alertNearby(x, y, enemy.type, 300);
        });
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Spawn a boss by type string at world-pixel position (x, y).
     * Returns the boss instance, or null if the type is unrecognised.
     *
     * Valid types: 'probe' | 'golem' | 'eye'
     *
     * @param {string} bossType
     * @param {number} x  world-pixel X (boss is offset to centre above this point)
     * @param {number} y  world-pixel Y
     * @returns {Enemy|null}
     */
    spawnBoss(bossType, x, y) {
        let boss;
        if      (bossType === 'probe') { boss = new SentinelProbe(x - 24, y - 16);  boss.type = 'probe'; }
        else if (bossType === 'golem') { boss = new BrassGolem   (x - 20, y - 25);  boss.type = 'golem'; }
        else if (bossType === 'eye'  ) { boss = new BossEye      (x - 32, y - 32);  boss.type = 'eye';   }
        else {
            console.warn(`[EntityManager] Unknown boss type: "${bossType}"`);
            return null;
        }

        // Bosses can trigger minion spawns via this callback (e.g. BossEye spawning Slimes)
        boss.spawnCallback = (sx, sy) => {
            const slime = new Slime(sx, sy);
            this.enemies.push(slime);
            // Minions are surface-biome for population accounting purposes
            slime._biome = 'surface';
            this._biomeCounts.surface++;
        };

        this.boss = boss;
        this.enemies.push(boss);
        return boss;
    }

    /**
     * Per-frame update: spawning, AI, despawning, drop management.
     * @param {number}          dt
     * @param {Player}          player
     * @param {InventorySystem} inventory  — passed to DropManager for pickup detection
     */
    update(dt, player, inventory) {
        const px = player.x + player.w * 0.5;
        const py = player.y + player.h * 0.5;

        // ── Spawn timing ──────────────────────────────────────────────────────
        // Count non-boss enemies without filter() — use the cached total from _biomeCounts.
        const nonBossCount  = this._biomeCounts.surface + this._biomeCounts.cavern + this._biomeCounts.underworld;
        const loadFactor    = nonBossCount / MAX_ENEMIES;           // 0 → 1
        const spawnInterval = SPAWN_INTERVAL_BASE + loadFactor * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_BASE);

        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && !player.isDead) {
            if (this._canSpawnInBiome(py)) this._trySpawn(px, py);
            this.spawnTimer = spawnInterval;
        }

        // ── Enemy update + despawn + death ────────────────────────────────────
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            e.update(dt, px, py, this.chunkManager);

            // Despawn when too far from the player (squared distance, no sqrt)
            const edx    = e.x - px;
            const edy    = e.y - py;
            const dSq    = edx * edx + edy * edy;
            const limSq  = e._despawnDistSq ?? (e.despawnDist * e.despawnDist); // cache on first use
            e._despawnDistSq = limSq;
            if (dSq > limSq) {
                this._removeEnemy(i, e);
                continue;
            }

            // Remove dead enemies and spawn their drops
            if (e.isDead()) {
                this.totalKills++;
                if (e === this.boss) this.boss = null;

                const table = getDropTable(e);
                if (table) {
                    const ecx = e.x + e.w * 0.5;
                    const ecy = e.y + e.h * 0.5;
                    this.dropManager.spawnFromTable(table, ecx, ecy);
                }

                events.emit('enemy:killed', { enemy: e });
                this._removeEnemy(i, e);
            }
        }

        // ── Drop physics + magnet + pickup ────────────────────────────────────
        if (inventory) this.dropManager.update(dt, player, inventory);
    }

    /**
     * Draw all enemies in view (frustum-culled) then their drops on top.
     */
    draw(ctx, camera) {
        const view = camera.getViewBounds();
        for (const e of this.enemies) {
            if (e.x + e.w < view.left - 50 || e.x > view.right + 50) continue;
            if (e.y + e.h < view.top  - 50 || e.y > view.bottom + 50) continue;
            e.draw(ctx, camera);
        }
        this.dropManager.draw(ctx, camera);
    }

    /**
     * Returns the live enemy array.
     * Used by CombatSystem and engine for hit detection.
     */
    getEnemies() { return this.enemies; }

    /**
     * Spawns a physical item drop at a world position.
     * Thin wrapper used by CombatSystem when a block is broken.
     */
    spawnDrop(itemId, quantity, x, y, opts) {
        return this.dropManager.spawn(itemId, quantity, x, y, opts);
    }

    // ── Private: spawning ─────────────────────────────────────────────────────

    /**
     * Attempts to spawn one enemy at a random position within spawn range.
     * Picks the enemy type based on biome depth and time of day.
     * Aborts if the spawn tile is not AIR or is out of bounds.
     */
    _trySpawn(px, py) {
        const angle = Math.random() * Math.PI * 2;
        const dist  = SPAWN_RANGE_MIN + Math.random() * (SPAWN_RANGE_MAX - SPAWN_RANGE_MIN);
        const sx    = px + Math.cos(angle) * dist;
        const sy    = py + Math.sin(angle) * dist;

        const bx = Math.floor(sx / BLOCK_SIZE);
        const by = Math.floor(sy / BLOCK_SIZE);
        if (bx < 0 || bx >= this.chunkManager.worldW) return;
        if (by < 0 || by >= this.chunkManager.worldH) return;
        if (this.chunkManager.getBlockAt(bx, by) !== BLOCK.AIR) return;

        const worldH          = this.chunkManager.worldH;
        const cavernThreshold = Math.floor(worldH * CAVERN_FRAC);
        const underworldThr   = Math.floor(worldH * UNDERWORLD_FRAC);
        const isNight         = this.lighting.isNight();

        let enemy, biome;

        if (by >= underworldThr) {
            biome  = 'underworld';
            enemy  = Math.random() < 0.3 ? new ScrapSentinel(sx, sy) : new FireDemon(sx, sy);
        } else if (by >= cavernThreshold) {
            biome       = 'cavern';
            const roll  = Math.random();
            if      (roll < 0.4) enemy = new Bat(sx, sy);
            else if (roll < 0.7) enemy = new CyberInfiltrator(sx, sy);
            else                 enemy = new CrystalSpider(sx, sy);
        } else if (isNight) {
            biome = 'surface';
            enemy = new Zombie(sx, sy);
        } else {
            biome = 'surface';
            enemy = new Slime(sx, sy);
        }

        enemy._biome = biome;
        this.enemies.push(enemy);
        this._biomeCounts[biome]++;
    }

    /**
     * Returns true if the player's current biome still has room for another enemy.
     * Uses O(1) cached counters — no iteration needed.
     * @param {number} playerWorldY  world-pixel Y of the player centre
     */
    _canSpawnInBiome(playerWorldY) {
        const worldH = this.chunkManager.worldH;
        const by     = Math.floor(playerWorldY / BLOCK_SIZE);

        let biome, cap;
        if      (by >= Math.floor(worldH * UNDERWORLD_FRAC)) { biome = 'underworld'; cap = MAX_UNDERWORLD; }
        else if (by >= Math.floor(worldH * CAVERN_FRAC))     { biome = 'cavern';     cap = MAX_CAVERN;     }
        else                                                   { biome = 'surface';    cap = MAX_SURFACE;    }

        return this._biomeCounts[biome] < cap;
    }

    // ── Private: internal helpers ─────────────────────────────────────────────

    /**
     * Removes enemy at array index i and updates the biome counter.
     * Always use this instead of bare splice() to keep _biomeCounts accurate.
     * @param {number} i
     * @param {Enemy}  e
     */
    _removeEnemy(i, e) {
        if (e._biome && !e.isBoss) {
            this._biomeCounts[e._biome] = Math.max(0, (this._biomeCounts[e._biome] || 0) - 1);
        }
        this.enemies.splice(i, 1);
    }

    /**
     * Forces aggro on nearby same-type non-boss enemies when one takes damage.
     * Uses squared-distance to avoid sqrt.
     * @param {number} cx     world-pixel X of the hit enemy
     * @param {number} cy     world-pixel Y
     * @param {number} type   ENEMY_TYPE value
     * @param {number} radius alert radius in pixels
     */
    _alertNearby(cx, cy, type, radius) {
        const rSq = radius * radius;
        for (const e of this.enemies) {
            if (e.type !== type || e.isBoss) continue;
            const dx = (e.x + e.w * 0.5) - cx;
            const dy = (e.y + e.h * 0.5) - cy;
            if (dx * dx + dy * dy < rSq) {
                e.alerted    = true;
                e.alertTimer = 5; // seconds
            }
        }
    }
}
