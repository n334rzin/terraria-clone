/**
 * Camera
 * ------
 * Follows the player with smooth LERP interpolation.
 * Exposes worldToScreen() for any system that needs to convert
 * world coordinates to pixel positions on the canvas.
 */
class Camera {
    /**
     * @param {number} viewportW - canvas width in pixels
     * @param {number} viewportH - canvas height in pixels
     */
    constructor(viewportW, viewportH) {
        // Top-left corner of the camera in world-pixels
        this.x = 0;
        this.y = 0;

        this.viewportW = viewportW;
        this.viewportH = viewportH;

        // LERP speed: 0 = no movement, 1 = instant snap
        // 0.08 gives a comfortable, cinematic follow feel
        this.lerpSpeed = 0.08;

        // Optional: world bounds so the camera never shows void
        this.worldPixelW = 0;
        this.worldPixelH = 0;
    }

    /**
     * Set world size in pixels so the camera clamps to its edges.
     * Call this once after world generation.
     * @param {number} w - total world width in pixels
     * @param {number} h - total world height in pixels
     */
    setWorldBounds(w, h) {
        this.worldPixelW = w;
        this.worldPixelH = h;
    }

    /**
     * Update camera position each frame — smoothly chases the target.
     * @param {number} targetX - world-pixel X we want centered (usually player center)
     * @param {number} targetY - world-pixel Y we want centered (usually player center)
     * @param {number} dt      - delta time in seconds (not used in LERP math but
     *                           kept in signature for frame-rate-independent tuning)
     */
    update(targetX, targetY, dt) {
        // Desired top-left so that the target is centered on screen
        const desiredX = targetX - this.viewportW * 0.5;
        const desiredY = targetY - this.viewportH * 0.5;

        // LERP: current + (desired - current) * speed
        // The speed is adjusted by delta time to stay frame-rate independent
        const t = 1.0 - Math.pow(1.0 - this.lerpSpeed, dt * 60);
        this.x += (desiredX - this.x) * t;
        this.y += (desiredY - this.y) * t;

        // Clamp so we never show void outside the world
        if (this.worldPixelW > 0) {
            this.x = Math.max(0, Math.min(this.x, this.worldPixelW  - this.viewportW));
            this.y = Math.max(0, Math.min(this.y, this.worldPixelH - this.viewportH));
        }
    }

    /**
     * Resize the camera viewport (call on window resize).
     * @param {number} w
     * @param {number} h
     */
    resize(w, h) {
        this.viewportW = w;
        this.viewportH = h;
    }

    /**
     * Convert a world-space position to screen-space pixels.
     * @param {number} worldX
     * @param {number} worldY
     * @returns {{ sx: number, sy: number }}
     */
    worldToScreen(worldX, worldY) {
        return {
            sx: worldX - this.x,
            sy: worldY - this.y
        };
    }

    /**
     * Convert a screen-space position back to world-space.
     * Useful for mouse-picking (clicking on blocks).
     * @param {number} screenX
     * @param {number} screenY
     * @returns {{ wx: number, wy: number }}
     */
    screenToWorld(screenX, screenY) {
        return {
            wx: screenX + this.x,
            wy: screenY + this.y
        };
    }

    /**
     * Returns an AABB (in world-pixel space) representing the visible area.
     * Used by the ChunkManager for frustum culling.
     * @returns {{ left: number, top: number, right: number, bottom: number }}
     */
    getViewBounds() {
        return {
            left:   this.x,
            top:    this.y,
            right:  this.x + this.viewportW,
            bottom: this.y + this.viewportH
        };
    }
}
