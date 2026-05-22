/**
 * LightingSystem — Day/Night cycle + torch light propagation.
 * Uses a per-chunk light map (Uint8Array) with values 0-15.
 * 15 = full brightness, 0 = total darkness.
 * Renders a darkness overlay on top of chunks.
 */

const MAX_LIGHT = 15;
const TORCH_LIGHT_RADIUS = 8; // blocks of light spread
const DAY_DURATION = 120; // seconds for a full day/night cycle

class LightingSystem {
    constructor(worldW, worldH, chunksX, chunksY) {
        this.worldW = worldW;
        this.worldH = worldH;
        this.chunksX = chunksX;
        this.chunksY = chunksY;

        // Time of day: 0.0 = noon, 0.5 = midnight, 1.0 = noon again
        this.timeOfDay = 0.0;
        this.daySpeed = 1.0 / DAY_DURATION;

        // Global light map (flat array, 1 byte per block)
        this.lightMap = new Uint8Array(worldW * worldH);

        // Track torch positions for fast recalculation
        this.torches = new Set(); // store as "x,y" strings

        // Surface Y cache (set by engine after world gen)
        this.surfaceY = null;

        // Darkness overlay canvas (reused per chunk render)
        this._overlayCanvas = document.createElement('canvas');
        this._overlayCanvas.width = CHUNK_PX;
        this._overlayCanvas.height = CHUNK_PX;
        this._overlayCtx = this._overlayCanvas.getContext('2d');
    }

    /**
     * Set surface heights (from generator) for sky light calculation.
     */
    setSurface(surfaceArray) {
        this.surfaceY = surfaceArray;
    }

    /**
     * Add a torch and recalculate local light.
     */
    addTorch(bx, by) {
        this.torches.add(`${bx},${by}`);
        this._propagateLight(bx, by, TORCH_LIGHT_RADIUS);
    }

    /**
     * Remove a torch (when broken).
     */
    removeTorch(bx, by) {
        this.torches.delete(`${bx},${by}`);
        this._recalcArea(bx, by, TORCH_LIGHT_RADIUS);
    }

    /**
     * Update day/night cycle.
     */
    update(dt) {
        this.timeOfDay += this.daySpeed * dt;
        if (this.timeOfDay >= 1.0) this.timeOfDay -= 1.0;
    }

    /**
     * Get sky brightness factor (0.0 = dark, 1.0 = bright).
     * Smooth sine curve: noon=1, midnight=0.
     */
    getSkyBrightness() {
        // timeOfDay 0=noon, 0.5=midnight
        return 0.5 + 0.5 * Math.cos(this.timeOfDay * Math.PI * 2);
    }

    /**
     * Get the sky gradient colors based on time of day.
     */
    getSkyColors() {
        const b = this.getSkyBrightness();
        if (b > 0.7) {
            // Day
            return { top: '#0d1b2a', mid: '#1b4f72', bot: '#5dade2' };
        } else if (b > 0.35) {
            // Dusk/Dawn
            return { top: '#1a0a2e', mid: '#6b2fa0', bot: '#e8734a' };
        } else {
            // Night
            return { top: '#050510', mid: '#0a0a20', bot: '#141430' };
        }
    }

    /**
     * Compute the light level for a given block coordinate.
     * Combines sky light (if above or near surface) + torch light.
     */
    getLightAt(bx, by) {
        if (bx < 0 || by < 0 || bx >= this.worldW || by >= this.worldH) return MAX_LIGHT;
        return this.lightMap[by * this.worldW + bx];
    }

    /**
     * Full light recalculation for visible area. Called periodically, not every frame.
     * Only recalcs around the camera view for performance.
     */
    recalcVisible(viewLeft, viewTop, viewRight, viewBottom) {
        const bxMin = Math.max(0, Math.floor(viewLeft / BLOCK_SIZE) - TORCH_LIGHT_RADIUS);
        const bxMax = Math.min(this.worldW - 1, Math.ceil(viewRight / BLOCK_SIZE) + TORCH_LIGHT_RADIUS);
        const byMin = Math.max(0, Math.floor(viewTop / BLOCK_SIZE) - TORCH_LIGHT_RADIUS);
        const byMax = Math.min(this.worldH - 1, Math.ceil(viewBottom / BLOCK_SIZE) + TORCH_LIGHT_RADIUS);

        const skyB = this.getSkyBrightness();
        const skyLight = Math.round(skyB * MAX_LIGHT);

        // Reset visible area
        for (let by = byMin; by <= byMax; by++) {
            for (let bx = bxMin; bx <= bxMax; bx++) {
                const idx = by * this.worldW + bx;
                const surfY = this.surfaceY ? this.surfaceY[bx] : 0;
                // Sky light: full if above surface, attenuates underground
                const depth = by - surfY;
                if (depth <= 0) {
                    this.lightMap[idx] = skyLight;
                } else {
                    // Underground: light decreases with depth
                    const underLight = Math.max(0, skyLight - depth * 2);
                    this.lightMap[idx] = underLight;
                }
            }
        }

        // Apply torch lights
        for (const key of this.torches) {
            const [tx, ty] = key.split(',').map(Number);
            if (tx >= bxMin - TORCH_LIGHT_RADIUS && tx <= bxMax + TORCH_LIGHT_RADIUS &&
                ty >= byMin - TORCH_LIGHT_RADIUS && ty <= byMax + TORCH_LIGHT_RADIUS) {
                this._propagateLight(tx, ty, TORCH_LIGHT_RADIUS);
            }
        }
    }

    /**
     * Propagate light from a point source (torch).
     */
    _propagateLight(cx, cy, radius) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const bx = cx + dx;
                const by = cy + dy;
                if (bx < 0 || by < 0 || bx >= this.worldW || by >= this.worldH) continue;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > radius) continue;
                const intensity = Math.round(MAX_LIGHT * (1.0 - dist / radius));
                const idx = by * this.worldW + bx;
                // Take the max of existing light and torch light
                if (intensity > this.lightMap[idx]) {
                    this.lightMap[idx] = intensity;
                }
            }
        }
    }

    /**
     * Recalculate an area (after torch removal).
     */
    _recalcArea(cx, cy, radius) {
        const skyB = this.getSkyBrightness();
        const skyLight = Math.round(skyB * MAX_LIGHT);
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const bx = cx + dx;
                const by = cy + dy;
                if (bx < 0 || by < 0 || bx >= this.worldW || by >= this.worldH) continue;
                const idx = by * this.worldW + bx;
                const surfY = this.surfaceY ? this.surfaceY[bx] : 0;
                const depth = by - surfY;
                this.lightMap[idx] = depth <= 0 ? skyLight : Math.max(0, skyLight - depth * 2);
            }
        }
        // Re-apply nearby torches
        for (const key of this.torches) {
            const [tx, ty] = key.split(',').map(Number);
            if (Math.abs(tx - cx) <= radius * 2 && Math.abs(ty - cy) <= radius * 2) {
                this._propagateLight(tx, ty, TORCH_LIGHT_RADIUS);
            }
        }
    }

    /**
     * Draw darkness overlay for a chunk.
     * @param {CanvasRenderingContext2D} mainCtx
     * @param {number} cx - chunk X index
     * @param {number} cy - chunk Y index
     * @param {Camera} camera
     */
    drawChunkOverlay(mainCtx, cx, cy, camera) {
        const ctx = this._overlayCtx;
        ctx.clearRect(0, 0, CHUNK_PX, CHUNK_PX);

        const baseX = cx * CHUNK_SIZE;
        const baseY = cy * CHUNK_SIZE;

        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
            for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                const bx = baseX + lx;
                const by = baseY + ly;
                const light = this.getLightAt(bx, by);
                if (light >= MAX_LIGHT) continue; // fully lit, no overlay

                const darkness = 1.0 - (light / MAX_LIGHT);
                ctx.fillStyle = `rgba(0,0,0,${darkness * 0.85})`;
                ctx.fillRect(lx * BLOCK_SIZE, ly * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
            }
        }

        const worldPx = cx * CHUNK_PX;
        const worldPy = cy * CHUNK_PX;
        const { sx, sy } = camera.worldToScreen(worldPx, worldPy);
        mainCtx.drawImage(this._overlayCanvas, Math.round(sx), Math.round(sy));
    }

    /**
     * Is it nighttime?
     */
    isNight() {
        return this.getSkyBrightness() < 0.35;
    }

    /**
     * Get time display string.
     */
    getTimeString() {
        const hours = Math.floor(this.timeOfDay * 24 + 12) % 24;
        const mins = Math.floor((this.timeOfDay * 24 * 60) % 60);
        return `${hours.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}`;
    }
}
