/**
 * ChunkManager
 * ------------
 * Divides the world into CHUNK_SIZE × CHUNK_SIZE block regions.
 *
 * Key responsibilities:
 *  1. Partition the flat world array into Chunk objects.
 *  2. Track which chunks are "active" (near the camera).
 *  3. Pre-render each chunk onto an offscreen canvas once ("bake"),
 *     and re-bake only when a block inside that chunk changes.
 *  4. Draw only visible chunks (frustum culling).
 *
 * Performance characteristics:
 *  - A 2000×1000 world = 200,000 blocks total.
 *  - With 16×16 chunks that is 7,812 chunks.
 *  - At any time only ~(viewport / CHUNK_PX)² chunks are drawn, typically < 50.
 */

const CHUNK_SIZE = 16;   // blocks per side
const BLOCK_SIZE = 16;   // pixels per block
const CHUNK_PX   = CHUNK_SIZE * BLOCK_SIZE; // 256 px per chunk side

// ---------------------------------------------------------------------------
// Chunk — a 16×16 region of the world
// ---------------------------------------------------------------------------
class Chunk {
    /**
     * @param {number} cx - chunk column index
     * @param {number} cy - chunk row index
     */
    constructor(cx, cy) {
        this.cx = cx;
        this.cy = cy;

        // Pixel origin of this chunk in world-space
        this.worldPixelX = cx * CHUNK_PX;
        this.worldPixelY = cy * CHUNK_PX;

        // Flat Uint8Array of CHUNK_SIZE² block IDs
        this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);

        // Offscreen canvas (pre-rendered image of this chunk)
        this.canvas  = document.createElement('canvas');
        this.canvas.width  = CHUNK_PX;
        this.canvas.height = CHUNK_PX;
        this.ctx     = this.canvas.getContext('2d');

        // Dirty flag — true means we need to re-bake before next draw
        this.dirty = true;

        // Whether this chunk has any non-air blocks (skip empty chunks fast)
        this.isEmpty = false;
    }

    /**
     * Read a block inside this chunk.
     * @param {number} localX - 0..CHUNK_SIZE-1
     * @param {number} localY - 0..CHUNK_SIZE-1
     */
    getBlock(localX, localY) {
        return this.blocks[localY * CHUNK_SIZE + localX];
    }

    /**
     * Write a block and mark the chunk dirty.
     */
    setBlock(localX, localY, id) {
        this.blocks[localY * CHUNK_SIZE + localX] = id;
        this.dirty  = true;
        this.isEmpty = false;
    }

    /**
     * (Re-)render the chunk onto its offscreen canvas.
     * Called automatically before drawing if dirty === true.
     */
    bake(blockTextures) {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, CHUNK_PX, CHUNK_PX);

        let hasContent = false;

        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
            for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                const id = this.blocks[ly * CHUNK_SIZE + lx];
                if (id === BLOCK.AIR) continue;

                hasContent = true;
                const px = lx * BLOCK_SIZE;
                const py = ly * BLOCK_SIZE;

                // Use procedural texture if available, else fallback to flat color
                const tex = blockTextures ? blockTextures.get(id) : null;
                if (tex) {
                    ctx.drawImage(tex, px, py);
                } else {
                    const color = BLOCK_COLORS[id];
                    if (!color) continue;
                    ctx.fillStyle = color;
                    ctx.fillRect(px, py, BLOCK_SIZE, BLOCK_SIZE);
                }
            }
        }

        this.isEmpty = !hasContent;
        this.dirty   = false;
    }

    /**
     * Draw this chunk to the main canvas.
     * @param {CanvasRenderingContext2D} ctx - main canvas context
     * @param {Camera} camera
     */
    draw(ctx, camera, blockTextures) {
        if (this.isEmpty) return;
        if (this.dirty) this.bake(blockTextures);

        const { sx, sy } = camera.worldToScreen(this.worldPixelX, this.worldPixelY);
        ctx.drawImage(this.canvas, Math.round(sx), Math.round(sy));
    }
}

// ---------------------------------------------------------------------------
// ChunkManager
// ---------------------------------------------------------------------------
class ChunkManager {
    /**
     * @param {Uint8Array} worldBlocks - flat world array from WorldGenerator
     * @param {number}     worldW      - world width  in blocks
     * @param {number}     worldH      - world height in blocks
     */
    constructor(worldBlocks, worldW, worldH) {
        this.worldW = worldW;
        this.worldH = worldH;

        this.chunksX = Math.ceil(worldW / CHUNK_SIZE);
        this.chunksY = Math.ceil(worldH / CHUNK_SIZE);

        // Flat array of all Chunk objects (indexed [cy * chunksX + cx])
        this.chunks = new Array(this.chunksX * this.chunksY);

        this._buildChunks(worldBlocks);
    }

    /**
     * Partition the world data into chunk objects.
     * @param {Uint8Array} worldBlocks
     */
    _buildChunks(worldBlocks) {
        for (let cy = 0; cy < this.chunksY; cy++) {
            for (let cx = 0; cx < this.chunksX; cx++) {
                const chunk = new Chunk(cx, cy);
                // Copy block data from the world array into the chunk
                for (let ly = 0; ly < CHUNK_SIZE; ly++) {
                    const worldY = cy * CHUNK_SIZE + ly;
                    if (worldY >= this.worldH) break;
                    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                        const worldX = cx * CHUNK_SIZE + lx;
                        if (worldX >= this.worldW) break;
                        chunk.blocks[ly * CHUNK_SIZE + lx] =
                            worldBlocks[worldY * this.worldW + worldX];
                    }
                }
                // Mark non-empty chunks so bake() is called
                chunk.dirty = true;
                this.chunks[cy * this.chunksX + cx] = chunk;
            }
        }
    }

    /**
     * Get a chunk by its grid coordinates. Returns null if out of bounds.
     * @param {number} cx
     * @param {number} cy
     */
    getChunk(cx, cy) {
        if (cx < 0 || cy < 0 || cx >= this.chunksX || cy >= this.chunksY) return null;
        return this.chunks[cy * this.chunksX + cx];
    }

    /**
     * Get the block ID at world-space block coordinates.
     * Used by physics for collision detection.
     * @param {number} bx - world block X
     * @param {number} by - world block Y
     * @returns {number} block ID (0 = AIR if out of bounds)
     */
    getBlockAt(bx, by) {
        if (bx < 0 || by < 0 || bx >= this.worldW || by >= this.worldH) return BLOCK.AIR;
        const cx = Math.floor(bx / CHUNK_SIZE);
        const cy = Math.floor(by / CHUNK_SIZE);
        const chunk = this.getChunk(cx, cy);
        if (!chunk) return BLOCK.AIR;
        return chunk.getBlock(bx - cx * CHUNK_SIZE, by - cy * CHUNK_SIZE);
    }

    /**
     * Set a block in the world (e.g., player mining/placing).
     * Marks the owning chunk dirty so it gets re-baked next frame.
     * @param {number} bx
     * @param {number} by
     * @param {number} id
     */
    setBlockAt(bx, by, id) {
        if (bx < 0 || by < 0 || bx >= this.worldW || by >= this.worldH) return;
        const cx = Math.floor(bx / CHUNK_SIZE);
        const cy = Math.floor(by / CHUNK_SIZE);
        const chunk = this.getChunk(cx, cy);
        if (!chunk) return;
        chunk.setBlock(bx - cx * CHUNK_SIZE, by - cy * CHUNK_SIZE, id);
    }

    /**
     * Draw all visible chunks to the main canvas (FRUSTUM CULLING).
     * Only chunks whose world-pixel AABB intersects the camera viewport
     * are drawn — everything else is skipped entirely.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Camera} camera
     */
    draw(ctx, camera, blockTextures) {
        const view = camera.getViewBounds();

        // Convert camera view bounds to chunk index range
        // Add 1 chunk of padding to avoid pop-in at edges
        const cxMin = Math.max(0, Math.floor(view.left   / CHUNK_PX) - 1);
        const cxMax = Math.min(this.chunksX - 1, Math.ceil(view.right  / CHUNK_PX) + 1);
        const cyMin = Math.max(0, Math.floor(view.top    / CHUNK_PX) - 1);
        const cyMax = Math.min(this.chunksY - 1, Math.ceil(view.bottom / CHUNK_PX) + 1);

        for (let cy = cyMin; cy <= cyMax; cy++) {
            for (let cx = cxMin; cx <= cxMax; cx++) {
                const chunk = this.chunks[cy * this.chunksX + cx];
                if (chunk) chunk.draw(ctx, camera, blockTextures);
            }
        }

        // Return visible chunk count for debug HUD
        return { count: (cxMax - cxMin + 1) * (cyMax - cyMin + 1), cxMin, cxMax, cyMin, cyMax };
    }

    /**
     * Returns the number of active (near-camera) chunks for debug display.
     */
    getActiveChunkCount(camera) {
        const view = camera.getViewBounds();
        const cxMin = Math.max(0, Math.floor(view.left   / CHUNK_PX) - 1);
        const cxMax = Math.min(this.chunksX - 1, Math.ceil(view.right  / CHUNK_PX) + 1);
        const cyMin = Math.max(0, Math.floor(view.top    / CHUNK_PX) - 1);
        const cyMax = Math.min(this.chunksY - 1, Math.ceil(view.bottom / CHUNK_PX) + 1);
        return (cxMax - cxMin + 1) * (cyMax - cyMin + 1);
    }
}
