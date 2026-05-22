/**
 * WorldGenerator
 * --------------
 * Procedural world generation using layered Perlin-noise.
 *
 * Block type IDs (expand freely):
 *   0 = AIR
 *   1 = GRASS
 *   2 = DIRT
 *   3 = STONE
 *   4 = BEDROCK
 *   5 = SAND
 *   6 = COAL_ORE
 *   7 = IRON_ORE
 *   8 = GOLD_ORE
 *
 * Biome IDs:
 *   0 = PLAINS
 *   1 = DESERT
 *   2 = FOREST
 */

// ---------------------------------------------------------------------------
// Permutation-table Perlin noise (classic Ken Perlin implementation)
// ---------------------------------------------------------------------------
class PerlinNoise {
    constructor(seed = 42) {
        this.p = new Uint8Array(512);
        // Build a seeded permutation table
        const perm = [];
        for (let i = 0; i < 256; i++) perm[i] = i;
        // Simple LCG shuffle seeded by `seed`
        let s = seed & 0xffffffff;
        for (let i = 255; i > 0; i--) {
            s = (s * 1664525 + 1013904223) & 0xffffffff;
            const j = (s >>> 0) % (i + 1);
            [perm[i], perm[j]] = [perm[j], perm[i]];
        }
        for (let i = 0; i < 256; i++) this.p[i] = this.p[i + 256] = perm[i];
    }

    _fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    _lerp(a, b, t) { return a + t * (b - a); }
    _grad(hash, x, y) {
        const h = hash & 3;
        const u = h < 2 ? x : y;
        const v = h < 2 ? y : x;
        return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
    }

    /**
     * Returns a value in [-1, 1] for a given (x, y) coordinate.
     */
    noise(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        const u = this._fade(x);
        const v = this._fade(y);
        const a  = this.p[X]     + Y, aa = this.p[a], ab = this.p[a + 1];
        const b  = this.p[X + 1] + Y, ba = this.p[b], bb = this.p[b + 1];
        return this._lerp(
            this._lerp(this._grad(this.p[aa], x,   y  ), this._grad(this.p[ba], x-1, y  ), u),
            this._lerp(this._grad(this.p[ab], x,   y-1), this._grad(this.p[bb], x-1, y-1), u),
            v
        );
    }

    /**
     * Fractional Brownian Motion — stacks octaves for more detail.
     * @param {number} x
     * @param {number} y
     * @param {number} octaves  - layers of detail (4-6 for terrain)
     * @param {number} persistence - amplitude falloff per octave (0.5 typical)
     * @param {number} lacunarity  - frequency scale per octave (2.0 typical)
     * @returns {number} value in roughly [-1, 1]
     */
    fbm(x, y, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
        let value = 0, amplitude = 1, frequency = 1, maxValue = 0;
        for (let i = 0; i < octaves; i++) {
            value    += this.noise(x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }
        return value / maxValue; // normalize to [-1, 1]
    }
}

// ---------------------------------------------------------------------------
// Block & Biome constants (single source of truth — reference everywhere)
// ---------------------------------------------------------------------------
const BLOCK = Object.freeze({
    AIR:        0,
    GRASS:      1,
    DIRT:       2,
    STONE:      3,
    BEDROCK:    4,
    SAND:       5,
    COAL_ORE:   6,
    IRON_ORE:   7,
    GOLD_ORE:   8,
    TORCH:      9,
    COPPER_ORE: 10,
    OBSIDIAN:   11,
    ASH:        12,
    HELLSTONE:  13,
    COBWEB:     14,
    WOOD:       15,
    LEAVES:     16,
    PLANK:      17,
    WORKBENCH:      18,
    FURNACE:        19,
    ANVIL:          20,
    ALCHEMY_TABLE:  21,
});

const BIOME = Object.freeze({
    PLAINS: 0,
    DESERT: 1,
    FOREST: 2,
});

// Vertical layer enum (derived from depth, not stored in world)
const LAYER = Object.freeze({
    SURFACE:   0,   // above surface
    CAVERN:    1,   // below surface to 80% depth
    UNDERWORLD:2,   // bottom 20%
});

// Pre-computed colour palette for each block (RGBA hex string)
const BLOCK_COLORS = {
    [BLOCK.AIR]:        null,
    [BLOCK.GRASS]:      '#4a8f2a',
    [BLOCK.DIRT]:       '#7a5230',
    [BLOCK.STONE]:      '#6e6e6e',
    [BLOCK.BEDROCK]:    '#1e1e1e',
    [BLOCK.SAND]:       '#c8b560',
    [BLOCK.COAL_ORE]:   '#3a3a3a',
    [BLOCK.IRON_ORE]:   '#a07850',
    [BLOCK.GOLD_ORE]:   '#d4a800',
    [BLOCK.TORCH]:      '#ffaa22',
    [BLOCK.COPPER_ORE]: '#c47030',
    [BLOCK.OBSIDIAN]:   '#1a0a2e',
    [BLOCK.ASH]:        '#4a3a3a',
    [BLOCK.HELLSTONE]:  '#cc3300',
    [BLOCK.COBWEB]:     '#cccccc',
    [BLOCK.WOOD]:       '#6e4a22',
    [BLOCK.LEAVES]:     '#3a7a2a',
    [BLOCK.PLANK]:      '#a07840',
    [BLOCK.WORKBENCH]:     '#a06030',
    [BLOCK.FURNACE]:       '#444444',
    [BLOCK.ANVIL]:         '#222230',
    [BLOCK.ALCHEMY_TABLE]: '#4a2080',
};

// Utility: get vertical layer at a block-y given world height
function getLayerAt(by, worldH) {
    const underworldStart = Math.floor(worldH * 0.80);
    if (by >= underworldStart) return LAYER.UNDERWORLD;
    return LAYER.CAVERN; // surface detection is done via surfaceY per-column
}

// ---------------------------------------------------------------------------
// WorldGenerator
// ---------------------------------------------------------------------------
class WorldGenerator {
    /**
     * @param {number} worldW - world width  in blocks
     * @param {number} worldH - world height in blocks
     * @param {number} seed   - integer seed for deterministic generation
     */
    constructor(worldW, worldH, seed = 12345) {
        this.worldW = worldW;
        this.worldH = worldH;
        this.seed   = seed;

        // Multiple noise instances with different seeds for varied features
        this.terrainNoise = new PerlinNoise(seed);
        this.caveNoise    = new PerlinNoise(seed + 1337);
        this.biomeNoise   = new PerlinNoise(seed + 9999);
        this.oreNoise     = new PerlinNoise(seed + 2718);
    }

    /**
     * Generate and return the full world data as a flat Uint8Array.
     * Index = y * worldW + x  (row-major, top-to-bottom)
     *
     * This is called ONCE at startup. Each chunk then slices its
     * own region on demand via ChunkManager.
     *
     * @returns {Uint8Array}
     */
    generate() {
        const { worldW, worldH } = this;
        const blocks = new Uint8Array(worldW * worldH); // all zeroed = AIR

        // Surface height range (in blocks from top)
        const surfaceMin = Math.floor(worldH * 0.35);
        const surfaceMax = Math.floor(worldH * 0.55);
        const surfaceRange = surfaceMax - surfaceMin;

        // Pre-compute per-column data for speed
        const surfaceY = new Int32Array(worldW);
        this._surface = surfaceY;
        const biomeMap = new Uint8Array(worldW);

        for (let x = 0; x < worldW; x++) {
            // Biome — slow large-scale variation
            const b = this.biomeNoise.fbm(x * 0.003, 0, 3, 0.5, 2.0);
            biomeMap[x] = b < -0.2 ? BIOME.DESERT : b > 0.25 ? BIOME.FOREST : BIOME.PLAINS;

            // Terrain height — faster variation layered over biome
            const h = this.terrainNoise.fbm(x * 0.007, 0, 5, 0.55, 2.1);
            surfaceY[x] = surfaceMin + Math.round(((h + 1) * 0.5) * surfaceRange);
        }

        // Underworld boundary
        const underworldY = Math.floor(worldH * 0.80);

        // Fill blocks column by column
        for (let x = 0; x < worldW; x++) {
            const sy    = surfaceY[x];
            const biome = biomeMap[x];

            for (let y = 0; y < worldH; y++) {
                const idx   = y * worldW + x;
                const depth = y - sy;

                // --- Bedrock at the very bottom ---
                if (y >= worldH - 3) {
                    blocks[idx] = BLOCK.BEDROCK;
                    continue;
                }

                // --- Air above surface ---
                if (y < sy) {
                    blocks[idx] = BLOCK.AIR;
                    continue;
                }

                // --- UNDERWORLD (bottom 20%) ---
                if (y >= underworldY) {
                    const uw = this.caveNoise.fbm(x * 0.05, y * 0.05, 3, 0.5, 2.0);
                    // Larger caves in underworld
                    if (uw > 0.25) {
                        blocks[idx] = BLOCK.AIR;
                        continue;
                    }
                    // Underworld material mix
                    const oreV = this.oreNoise.noise(x * 0.08, y * 0.08);
                    if (oreV > 0.50)       blocks[idx] = BLOCK.HELLSTONE;
                    else if (oreV < -0.45) blocks[idx] = BLOCK.OBSIDIAN;
                    else                   blocks[idx] = BLOCK.ASH;
                    continue;
                }

                // --- Cave carving (Perlin threshold) ---
                const caveV = this.caveNoise.fbm(x * 0.04, y * 0.04, 3, 0.5, 2.0);

                if (depth > 4 && caveV > 0.32) {
                    // Occasional cobwebs inside caves
                    if (Math.random() < 0.008 && depth > 20) {
                        blocks[idx] = BLOCK.COBWEB;
                    } else {
                        blocks[idx] = BLOCK.AIR;
                    }
                    continue;
                }

                // --- Surface layer ---
                if (y === sy) {
                    blocks[idx] = (biome === BIOME.DESERT) ? BLOCK.SAND : BLOCK.GRASS;
                    continue;
                }

                // --- Subsurface layers ---
                if (depth <= 5) {
                    blocks[idx] = (biome === BIOME.DESERT) ? BLOCK.SAND : BLOCK.DIRT;
                    continue;
                }

                // --- Deep stone + ores ---
                blocks[idx] = BLOCK.STONE;

                const oreV = this.oreNoise.noise(x * 0.1, y * 0.1);

                // Copper: shallow cavern (depth 8-40)
                if (depth > 8 && depth <= 40 && oreV > 0.52) {
                    blocks[idx] = BLOCK.COPPER_ORE;
                }
                // Coal: mid cavern
                else if (depth > 15 && oreV > 0.58) {
                    blocks[idx] = BLOCK.COAL_ORE;
                }
                // Iron: mid-deep cavern (depth 30+)
                else if (depth > 30 && oreV < -0.55) {
                    blocks[idx] = BLOCK.IRON_ORE;
                }
                // Gold: deep cavern (depth 60+)
                if (depth > 60 && oreV > 0.63) {
                    blocks[idx] = BLOCK.GOLD_ORE;
                }
                // Obsidian pockets near underworld border
                if (y > underworldY - 20 && oreV < -0.62) {
                    blocks[idx] = BLOCK.OBSIDIAN;
                }
            }
        }

        // ---- Geração de árvores em biomas FOREST/PLAINS ----
        // PRNG simples baseado no seed para reprodutibilidade
        let rng = (this.seed ^ 0x9e3779b9) >>> 0;
        const rand = () => {
            rng = (rng * 1664525 + 1013904223) >>> 0;
            return (rng & 0xffffff) / 0x1000000;
        };

        for (let x = 2; x < worldW - 2; x++) {
            const biome = biomeMap[x];
            if (biome === BIOME.DESERT) continue;
            const sy = surfaceY[x];
            // Densidade: floresta ~12%, plains ~5%
            const density = (biome === BIOME.FOREST) ? 0.12 : 0.05;
            if (rand() > density) continue;

            // Topo do bloco de grama
            if (blocks[sy * worldW + x] !== BLOCK.GRASS) continue;
            // Não plantar muito perto de outra árvore
            let nearTree = false;
            for (let dx = -2; dx <= 2; dx++) {
                if (dx === 0) continue;
                const nb = blocks[(sy - 1) * worldW + (x + dx)];
                if (nb === BLOCK.WOOD || nb === BLOCK.LEAVES) { nearTree = true; break; }
            }
            if (nearTree) continue;

            // Tronco: 4-7 blocos de altura
            const trunkH = 4 + Math.floor(rand() * 4);
            for (let h = 1; h <= trunkH; h++) {
                const ty = sy - h;
                if (ty < 0) break;
                if (blocks[ty * worldW + x] === BLOCK.AIR) {
                    blocks[ty * worldW + x] = BLOCK.WOOD;
                }
            }
            // Copa: cruz de folhas no topo
            const topY = sy - trunkH - 1;
            if (topY >= 0) {
                const leafCoords = [
                    [0, 0], [-1, 0], [1, 0], [0, -1],
                    [-1, -1], [1, -1], [-2, 0], [2, 0],
                    [-1, 1], [1, 1], [0, 1],
                ];
                for (const [lx, ly] of leafCoords) {
                    const tx = x + lx;
                    const ty = topY + ly;
                    if (tx < 0 || tx >= worldW || ty < 0) continue;
                    if (blocks[ty * worldW + tx] === BLOCK.AIR) {
                        blocks[ty * worldW + tx] = BLOCK.LEAVES;
                    }
                }
            }
        }

        this._blocks  = blocks;
        this._surface = surfaceY;
        this._biomes  = biomeMap;
        this._underworldY = underworldY;
        return blocks;
    }

    /**
     * Return the pre-computed surface height at a given column.
     * Useful for spawning the player at the correct height.
     */
    getSurfaceY(x) {
        return this._surface ? this._surface[Math.max(0, Math.min(x, this.worldW - 1))] : 0;
    }

    /**
     * Sky colour for a given biome (used for canvas background clear).
     */
    static skyColor(biome) {
        switch (biome) {
            case BIOME.DESERT: return '#d4a850';
            case BIOME.FOREST: return '#2e6e9e';
            default:           return '#1a3a5c';
        }
    }
}
