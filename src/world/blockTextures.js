/**
 * BlockTextures — Procedural pixel-art textures generated at startup.
 * Each block type gets a 16x16 offscreen canvas with noise, edges, details.
 * The ChunkManager uses these instead of flat fillRect colors.
 */

class BlockTextures {
    constructor() {
        this.textures = {};
        this._generate();
    }

    _generate() {
        this.textures[BLOCK.GRASS]      = this._makeGrass();
        this.textures[BLOCK.DIRT]       = this._makeDirt();
        this.textures[BLOCK.STONE]      = this._makeStone();
        this.textures[BLOCK.SAND]       = this._makeSand();
        this.textures[BLOCK.COAL_ORE]   = this._makeOre('#3a3a3a', '#1a1a1a', '#111');
        this.textures[BLOCK.COPPER_ORE] = this._makeOre('#6e6e6e', '#c47030', '#e08838');
        this.textures[BLOCK.IRON_ORE]   = this._makeOre('#6e6e6e', '#a07850', '#c09060');
        this.textures[BLOCK.GOLD_ORE]   = this._makeOre('#6e6e6e', '#d4a800', '#ffe040');
        this.textures[BLOCK.OBSIDIAN]   = this._makeObsidian();
        this.textures[BLOCK.ASH]        = this._makeAsh();
        this.textures[BLOCK.HELLSTONE]  = this._makeHellstone();
        this.textures[BLOCK.COBWEB]     = this._makeCobweb();
        this.textures[BLOCK.BEDROCK]    = this._makeBedrock();
        this.textures[BLOCK.TORCH]      = this._makeTorch();
        this.textures[BLOCK.WOOD]       = this._makeWood();
        this.textures[BLOCK.LEAVES]     = this._makeLeaves();
        this.textures[BLOCK.PLANK]      = this._makePlank();
        this.textures[BLOCK.WORKBENCH]  = this._makeWorkbench();
        this.textures[BLOCK.FURNACE]    = this._makeFurnace();
        this.textures[BLOCK.ANVIL]      = this._makeAnvil();
    }

    get(blockId) {
        return this.textures[blockId] || null;
    }

    _createCanvas() {
        const c = document.createElement('canvas');
        c.width = BLOCK_SIZE; c.height = BLOCK_SIZE;
        return c;
    }

    _noise(x, y, seed) {
        const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
        return n - Math.floor(n);
    }

    _makeGrass() {
        const c = this._createCanvas();
        const ctx = c.getContext('2d');
        // Dirt base
        ctx.fillStyle = '#6a4420';
        ctx.fillRect(0, 0, BLOCK_SIZE, BLOCK_SIZE);
        // Noise on dirt
        for (let y = 3; y < BLOCK_SIZE; y++) {
            for (let x = 0; x < BLOCK_SIZE; x++) {
                const n = this._noise(x, y, 1) * 30 - 15;
                const r = 0x6a + n, g = 0x44 + n * 0.5, b = 0x20 + n * 0.3;
                ctx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        // Green top (grass layer)
        ctx.fillStyle = '#4a8f2a';
        ctx.fillRect(0, 0, BLOCK_SIZE, 3);
        // Irregular grass blades on top
        for (let x = 0; x < BLOCK_SIZE; x++) {
            const h = 2 + Math.floor(this._noise(x, 0, 42) * 3);
            const shade = 60 + Math.floor(this._noise(x, 1, 7) * 40);
            ctx.fillStyle = `rgb(${30 + shade * 0.3 | 0},${shade + 70 | 0},${20 + shade * 0.2 | 0})`;
            ctx.fillRect(x, 0, 1, h);
        }
        // Dark bottom edge
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(0, BLOCK_SIZE - 1, BLOCK_SIZE, 1);
        return c;
    }

    _makeDirt() {
        const c = this._createCanvas();
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#7a5230';
        ctx.fillRect(0, 0, BLOCK_SIZE, BLOCK_SIZE);
        for (let y = 0; y < BLOCK_SIZE; y++) {
            for (let x = 0; x < BLOCK_SIZE; x++) {
                const n = this._noise(x, y, 3) * 40 - 20;
                const r = 0x7a + n, g = 0x52 + n * 0.6, b = 0x30 + n * 0.4;
                ctx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        // Occasional pebbles
        for (let i = 0; i < 3; i++) {
            const px = Math.floor(this._noise(i, 0, 99) * 14) + 1;
            const py = Math.floor(this._noise(0, i, 77) * 14) + 1;
            ctx.fillStyle = 'rgba(90,70,50,0.7)';
            ctx.fillRect(px, py, 2, 2);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(0, BLOCK_SIZE - 1, BLOCK_SIZE, 1);
        ctx.fillRect(BLOCK_SIZE - 1, 0, 1, BLOCK_SIZE);
        return c;
    }

    _makeStone() {
        const c = this._createCanvas();
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#6e6e6e';
        ctx.fillRect(0, 0, BLOCK_SIZE, BLOCK_SIZE);
        for (let y = 0; y < BLOCK_SIZE; y++) {
            for (let x = 0; x < BLOCK_SIZE; x++) {
                const n = this._noise(x, y, 5) * 30 - 15;
                const v = 0x6e + n;
                ctx.fillStyle = `rgb(${v|0},${v|0},${v|0})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        // Cracks / grooves
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(3, 5); ctx.lineTo(8, 7); ctx.lineTo(13, 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(1, 12); ctx.lineTo(6, 11); ctx.lineTo(10, 13);
        ctx.stroke();
        // Dark edges
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(0, BLOCK_SIZE - 1, BLOCK_SIZE, 1);
        ctx.fillRect(BLOCK_SIZE - 1, 0, 1, BLOCK_SIZE);
        // Light top edge
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(0, 0, BLOCK_SIZE, 1);
        return c;
    }

    _makeSand() {
        const c = this._createCanvas();
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#c8b560';
        ctx.fillRect(0, 0, BLOCK_SIZE, BLOCK_SIZE);
        for (let y = 0; y < BLOCK_SIZE; y++) {
            for (let x = 0; x < BLOCK_SIZE; x++) {
                const n = this._noise(x, y, 8) * 25 - 12;
                ctx.fillStyle = `rgb(${0xc8+n|0},${0xb5+n*0.8|0},${0x60+n*0.5|0})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        return c;
    }

    _makeOre(baseColor, oreColor, glintColor) {
        const c = this._createCanvas();
        const ctx = c.getContext('2d');
        // Stone base
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, BLOCK_SIZE, BLOCK_SIZE);
        for (let y = 0; y < BLOCK_SIZE; y++) {
            for (let x = 0; x < BLOCK_SIZE; x++) {
                const n = this._noise(x, y, 11) * 20 - 10;
                const r = parseInt(baseColor.slice(1,3),16) + n;
                const g = parseInt(baseColor.slice(3,5),16) + n;
                const b = parseInt(baseColor.slice(5,7),16) + n;
                ctx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        // Ore veins (irregular blobs)
        ctx.fillStyle = oreColor;
        const spots = [[3,4],[5,5],[4,6],[8,9],[9,10],[10,9],[12,3],[13,4],[11,12],[12,13]];
        spots.forEach(([sx,sy]) => ctx.fillRect(sx, sy, 2, 2));
        // Glints
        ctx.fillStyle = glintColor;
        ctx.fillRect(4, 4, 1, 1);
        ctx.fillRect(9, 9, 1, 1);
        ctx.fillRect(12, 3, 1, 1);
        // Edges
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(0, BLOCK_SIZE - 1, BLOCK_SIZE, 1);
        ctx.fillRect(BLOCK_SIZE - 1, 0, 1, BLOCK_SIZE);
        return c;
    }

    _makeObsidian() {
        const c = this._createCanvas();
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#1a0a2e';
        ctx.fillRect(0, 0, BLOCK_SIZE, BLOCK_SIZE);
        for (let y = 0; y < BLOCK_SIZE; y++) {
            for (let x = 0; x < BLOCK_SIZE; x++) {
                const n = this._noise(x, y, 20) * 15;
                ctx.fillStyle = `rgb(${26+n|0},${10+n*0.3|0},${46+n|0})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        // Purple sheen highlights
        ctx.fillStyle = 'rgba(120,40,180,0.3)';
        ctx.fillRect(2, 3, 3, 1); ctx.fillRect(10, 8, 4, 1); ctx.fillRect(5, 13, 2, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(0, BLOCK_SIZE-1, BLOCK_SIZE, 1);
        ctx.fillRect(BLOCK_SIZE-1, 0, 1, BLOCK_SIZE);
        return c;
    }

    _makeAsh() {
        const c = this._createCanvas();
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#4a3a3a';
        ctx.fillRect(0, 0, BLOCK_SIZE, BLOCK_SIZE);
        for (let y = 0; y < BLOCK_SIZE; y++) {
            for (let x = 0; x < BLOCK_SIZE; x++) {
                const n = this._noise(x, y, 22) * 20 - 10;
                ctx.fillStyle = `rgb(${74+n|0},${58+n|0},${58+n|0})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        // Ember specks
        ctx.fillStyle = '#aa4400';
        for (let i = 0; i < 4; i++) {
            const sx = (this._noise(i, 0, 30) * BLOCK_SIZE) | 0;
            const sy = (this._noise(0, i, 31) * BLOCK_SIZE) | 0;
            ctx.fillRect(sx, sy, 1, 1);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(0, BLOCK_SIZE-1, BLOCK_SIZE, 1);
        return c;
    }

    _makeHellstone() {
        const c = this._createCanvas();
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#881a00';
        ctx.fillRect(0, 0, BLOCK_SIZE, BLOCK_SIZE);
        for (let y = 0; y < BLOCK_SIZE; y++) {
            for (let x = 0; x < BLOCK_SIZE; x++) {
                const n = this._noise(x, y, 25) * 30 - 15;
                ctx.fillStyle = `rgb(${136+n|0},${26+n*0.4|0},${n*0.2|0})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        // Lava cracks
        ctx.fillStyle = '#ff6600';
        ctx.fillRect(2, 5, 4, 1); ctx.fillRect(9, 10, 5, 1); ctx.fillRect(4, 13, 3, 1);
        ctx.fillStyle = '#ffaa00';
        ctx.fillRect(3, 5, 2, 1); ctx.fillRect(10, 10, 2, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(0, BLOCK_SIZE-1, BLOCK_SIZE, 1);
        ctx.fillRect(BLOCK_SIZE-1, 0, 1, BLOCK_SIZE);
        return c;
    }

    _makeCobweb() {
        const c = this._createCanvas();
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, BLOCK_SIZE, BLOCK_SIZE);
        ctx.strokeStyle = 'rgba(200,200,200,0.6)';
        ctx.lineWidth = 1;
        // Cross strands
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(BLOCK_SIZE, BLOCK_SIZE);
        ctx.moveTo(BLOCK_SIZE, 0); ctx.lineTo(0, BLOCK_SIZE);
        ctx.moveTo(8, 0); ctx.lineTo(8, BLOCK_SIZE);
        ctx.moveTo(0, 8); ctx.lineTo(BLOCK_SIZE, 8);
        ctx.stroke();
        // Central blob
        ctx.fillStyle = 'rgba(220,220,220,0.5)';
        ctx.fillRect(6, 6, 4, 4);
        return c;
    }

    _makeBedrock() {
        const c = this._createCanvas();
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, 0, BLOCK_SIZE, BLOCK_SIZE);
        for (let y = 0; y < BLOCK_SIZE; y++) {
            for (let x = 0; x < BLOCK_SIZE; x++) {
                const n = this._noise(x, y, 13) * 20;
                ctx.fillStyle = `rgb(${30+n|0},${30+n|0},${30+n|0})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        return c;
    }

    _makeTorch() {
        const c = this._createCanvas();
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, BLOCK_SIZE, BLOCK_SIZE);
        // Stick
        ctx.fillStyle = '#8B6914';
        ctx.fillRect(7, 4, 2, 12);
        // Flame
        ctx.fillStyle = '#ff6600';
        ctx.fillRect(6, 1, 4, 4);
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(7, 2, 2, 2);
        ctx.fillStyle = '#fff8e0';
        ctx.fillRect(7, 2, 1, 1);
        return c;
    }

    _makeWood() {
        const c = this._createCanvas();
        const ctx = c.getContext('2d');
        // Base trunk
        ctx.fillStyle = '#6e4a22';
        ctx.fillRect(0, 0, BLOCK_SIZE, BLOCK_SIZE);
        // Vertical grain lines
        for (let y = 0; y < BLOCK_SIZE; y++) {
            for (let x = 0; x < BLOCK_SIZE; x++) {
                const n = this._noise(x, y * 3, 41);
                if (n > 0.7) ctx.fillStyle = '#8b5a2a';
                else if (n < 0.3) ctx.fillStyle = '#553818';
                else continue;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        // Side bark dark edges
        ctx.fillStyle = '#3e2a14';
        ctx.fillRect(0, 0, 1, BLOCK_SIZE);
        ctx.fillRect(BLOCK_SIZE - 1, 0, 1, BLOCK_SIZE);
        return c;
    }

    _makeLeaves() {
        const c = this._createCanvas();
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#3a7a2a';
        ctx.fillRect(0, 0, BLOCK_SIZE, BLOCK_SIZE);
        for (let y = 0; y < BLOCK_SIZE; y++) {
            for (let x = 0; x < BLOCK_SIZE; x++) {
                const n = this._noise(x, y, 51);
                if (n > 0.65) ctx.fillStyle = '#4d9a3a';
                else if (n > 0.45) ctx.fillStyle = '#2c5a1d';
                else if (n < 0.15) ctx.fillStyle = '#1e3e14';
                else continue;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        return c;
    }

    _makePlank() {
        const c = this._createCanvas();
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#a07840';
        ctx.fillRect(0, 0, BLOCK_SIZE, BLOCK_SIZE);
        // Horizontal plank stripes
        ctx.fillStyle = '#7a5a30';
        for (let y = 4; y < BLOCK_SIZE; y += 5) {
            ctx.fillRect(0, y, BLOCK_SIZE, 1);
        }
        // Grain
        for (let y = 0; y < BLOCK_SIZE; y++) {
            for (let x = 0; x < BLOCK_SIZE; x++) {
                const n = this._noise(x, y, 61);
                if (n > 0.75) {
                    ctx.fillStyle = 'rgba(160,120,70,0.6)';
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        }
        return c;
    }

    _makeWorkbench() {
        const c = this._createCanvas();
        const ctx = c.getContext('2d');
        // Top surface (wood plank)
        ctx.fillStyle = '#a07840';
        ctx.fillRect(0, 0, BLOCK_SIZE, BLOCK_SIZE);
        // Top stripe (lighter)
        ctx.fillStyle = '#c89a55';
        ctx.fillRect(0, 0, BLOCK_SIZE, 4);
        // Tools on top: hammer + saw silhouette
        ctx.fillStyle = '#3a2a1a';
        ctx.fillRect(2, 1, 4, 1);   // saw blade
        ctx.fillRect(9, 1, 1, 3);   // hammer head
        ctx.fillStyle = '#8b6420';
        ctx.fillRect(10, 2, 4, 1);  // hammer handle
        // Legs
        ctx.fillStyle = '#6a4a22';
        ctx.fillRect(1, 5, 2, BLOCK_SIZE - 5);
        ctx.fillRect(BLOCK_SIZE - 3, 5, 2, BLOCK_SIZE - 5);
        // Cross brace
        ctx.fillStyle = '#7a5a30';
        ctx.fillRect(2, 11, BLOCK_SIZE - 4, 1);
        return c;
    }

    _makeFurnace() {
        const c = this._createCanvas();
        const ctx = c.getContext('2d');
        // Stone block frame
        ctx.fillStyle = '#555';
        ctx.fillRect(0, 0, BLOCK_SIZE, BLOCK_SIZE);
        for (let y = 0; y < BLOCK_SIZE; y++) {
            for (let x = 0; x < BLOCK_SIZE; x++) {
                const n = this._noise(x, y, 7);
                if (n > 0.6) ctx.fillStyle = '#3a3a3a';
                else if (n < 0.3) ctx.fillStyle = '#6a6a6a';
                else continue;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        // Furnace mouth (dark hole)
        ctx.fillStyle = '#1a0a00';
        ctx.fillRect(4, 6, 8, 6);
        // Inner glow
        ctx.fillStyle = '#ff5500';
        ctx.fillRect(5, 8, 6, 3);
        ctx.fillStyle = '#ffaa00';
        ctx.fillRect(6, 9, 4, 2);
        ctx.fillStyle = '#ffff80';
        ctx.fillRect(7, 9, 2, 1);
        // Top exhaust
        ctx.fillStyle = '#222';
        ctx.fillRect(6, 1, 4, 1);
        return c;
    }

    _makeAnvil() {
        const c = this._createCanvas();
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, BLOCK_SIZE, BLOCK_SIZE);
        // Base
        ctx.fillStyle = '#3a3a4a';
        ctx.fillRect(2, BLOCK_SIZE - 4, BLOCK_SIZE - 4, 4);
        // Body
        ctx.fillStyle = '#22222e';
        ctx.fillRect(4, 8, BLOCK_SIZE - 8, 5);
        // Top (with horn)
        ctx.fillStyle = '#444458';
        ctx.fillRect(1, 4, BLOCK_SIZE - 1, 4);
        // Horn (left point)
        ctx.fillStyle = '#444458';
        ctx.fillRect(0, 5, 1, 2);
        // Top highlight
        ctx.fillStyle = '#5a5a70';
        ctx.fillRect(2, 4, BLOCK_SIZE - 4, 1);
        return c;
    }
}
