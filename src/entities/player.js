/**
 * Player
 * ------
 * Physics-driven entity with:
 *  - Gravity & terminal velocity
 *  - Horizontal acceleration + friction (feels snappy, not slippery)
 *  - AABB collision resolution against the world grid (separate X/Y axes)
 *  - Keyboard input managed internally
 *  - Jump with coyote time (8-frame grace window after walking off a ledge)
 *  - Jump buffering (10-frame input buffer so early jumps register)
 */

const GRAVITY          = 1800;   // px/s²  (tweak for feel)
const TERMINAL_VEL     = 900;    // px/s   (max fall speed)
const MOVE_SPEED       = 220;    // px/s   horizontal target speed
const ACCEL_GROUND     = 2400;   // px/s²  how fast we reach MOVE_SPEED on ground
const ACCEL_AIR        = 900;    // px/s²  reduced air control
const FRICTION_GROUND  = 2800;   // px/s²  deceleration when no key held on ground
const FRICTION_AIR     = 600;    // px/s²  reduced air friction
const JUMP_FORCE       = -580;   // px/s   initial vertical impulse
const COYOTE_FRAMES    = 8;      // frames of grace after leaving ground
const JUMP_BUFFER_MS   = 166;    // ms of jump buffer window (~10 frames @60fps)

class Player {
    /**
     * @param {number} x          - spawn world-pixel X (left edge of AABB)
     * @param {number} y          - spawn world-pixel Y (top  edge of AABB)
     * @param {ChunkManager} chunkManager
     */
    constructor(x, y, chunkManager) {
        // Position (top-left corner of AABB in world-pixels)
        this.x = x;
        this.y = y;

        // AABB dimensions (slightly less than 2 blocks tall, 1 block wide)
        this.w = 14;   // px wide  (just under 1 block)
        this.h = 30;   // px tall  (just under 2 blocks)

        // Velocity (px per second)
        this.vx = 0;
        this.vy = 0;

        this.onGround      = false;
        this.coyoteFrames  = 0;          // counts down after leaving ground
        this.jumpBufferEnd = 0;          // timestamp when jump buffer expires

        // Facing direction: 1 = right, -1 = left
        this.facing = 1;

        this.chunkManager = chunkManager;

        // ---- HP & Combat ----
        this.hp = 100;
        this.maxHp = 100;
        this.invulnTimer = 0;
        this.isDead = false;

        // ---- Customizable colors ----
        this.colors = {
            hair:  '#5a3010',
            shirt: '#3a7ad9',
            pants: '#5a4a3a',
        };

        // ---- Tool swing animation ----
        this.swingAngle = 0;    // current rotation (radians)
        this.swingActive = false;
        this.swingTool = 'pickaxe'; // 'pickaxe' | 'axe' | 'sword'
        this.swingSpeed = 12;   // rad/s
        this.swingMax = Math.PI * 0.6;

        // ---- Input state ----
        this._keys = {};
        this._bindInput();
    }

    // -----------------------------------------------------------------------
    // Input
    // -----------------------------------------------------------------------
    _bindInput() {
        window.addEventListener('keydown', e => {
            this._keys[e.code] = true;
            // Buffer jump: record the deadline up to which jump is valid
            if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
                this.jumpBufferEnd = performance.now() + JUMP_BUFFER_MS;
            }
            // Prevent page scrolling on arrow keys / space
            if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }
        });
        window.addEventListener('keyup', e => {
            this._keys[e.code] = false;
        });
    }

    _isLeft()  { return this._keys['ArrowLeft']  || this._keys['KeyA']; }
    _isRight() { return this._keys['ArrowRight'] || this._keys['KeyD']; }
    _isJump()  { return performance.now() < this.jumpBufferEnd; }

    // -----------------------------------------------------------------------
    // Update
    // -----------------------------------------------------------------------
    /**
     * Advance player simulation by delta time.
     * @param {number} dt - seconds since last frame
     * @param {number} speedMod - movement speed modifier (1.0 = normal, <1.0 = slowed)
     */
    update(dt, speedMod = 1.0) {
        const wasOnGround = this.onGround;

        // --- Coyote time ---
        if (wasOnGround) {
            this.coyoteFrames = COYOTE_FRAMES;
        } else if (this.coyoteFrames > 0) {
            this.coyoteFrames--;
        }

        // --- Horizontal input ---
        const accel   = (this.onGround ? ACCEL_GROUND   : ACCEL_AIR) * speedMod;
        const friction = (this.onGround ? FRICTION_GROUND : FRICTION_AIR) * speedMod;
        const moveSpeed = MOVE_SPEED * speedMod;

        if (this._isLeft()) {
            this.vx -= accel * dt;
            if (this.vx < -moveSpeed) this.vx = -moveSpeed;
            this.facing = -1;
        } else if (this._isRight()) {
            this.vx += accel * dt;
            if (this.vx > moveSpeed) this.vx = moveSpeed;
            this.facing = 1;
        } else {
            // Apply friction
            if (this.vx > 0) {
                this.vx -= friction * dt;
                if (this.vx < 0) this.vx = 0;
            } else if (this.vx < 0) {
                this.vx += friction * dt;
                if (this.vx > 0) this.vx = 0;
            }
        }

        // --- Jump ---
        const canJump = this.onGround || this.coyoteFrames > 0;
        if (this._isJump() && canJump) {
            this.vy            = JUMP_FORCE;
            this.coyoteFrames  = 0;
            this.jumpBufferEnd = 0;  // consume the buffer
        }

        // --- Gravity ---
        this.vy += GRAVITY * dt;
        if (this.vy > TERMINAL_VEL) this.vy = TERMINAL_VEL;

        // --- Move & collide (X then Y, separate axes) ---
        this.onGround = false;

        this.x += this.vx * dt;
        this._resolveX();

        this.y += this.vy * dt;
        this._resolveY();
    }

    // -----------------------------------------------------------------------
    // AABB Collision (separate axis resolution)
    // -----------------------------------------------------------------------

    /**
     * Returns true if the given world-pixel rect overlaps any solid block.
     */
    _isSolid(px, py, pw, ph) {
        const cm = this.chunkManager;
        const x0 = Math.floor(px          / BLOCK_SIZE);
        const y0 = Math.floor(py          / BLOCK_SIZE);
        const x1 = Math.floor((px + pw - 1) / BLOCK_SIZE);
        const y1 = Math.floor((py + ph - 1) / BLOCK_SIZE);

        for (let bx = x0; bx <= x1; bx++) {
            for (let by = y0; by <= y1; by++) {
                const id = cm.getBlockAt(bx, by);
                if (id !== BLOCK.AIR && id !== BLOCK.TORCH) return true;
            }
        }
        return false;
    }

    /**
     * Take damage (with invulnerability check).
     */
    takeDamage(amount) {
        if (this.invulnTimer > 0 || this.isDead) return;
        this.hp -= amount;
        this.invulnTimer = INVULN_TIME;
        if (this.hp <= 0) {
            this.hp = 0;
            this.isDead = true;
        }
    }

    _resolveX() {
        if (this._isSolid(this.x, this.y, this.w, this.h)) {
            if (this.vx > 0) {
                // Moving right — push left edge of player to left edge of the solid block
                this.x = Math.floor((this.x + this.w) / BLOCK_SIZE) * BLOCK_SIZE - this.w;
            } else if (this.vx < 0) {
                // Moving left — push player right so left edge clears the solid block
                this.x = (Math.floor(this.x / BLOCK_SIZE) + 1) * BLOCK_SIZE;
            }
            this.vx = 0;
        }
    }

    _resolveY() {
        if (this._isSolid(this.x, this.y, this.w, this.h)) {
            if (this.vy > 0) {
                // Falling down — place bottom edge at top edge of the solid block
                this.y = Math.floor((this.y + this.h) / BLOCK_SIZE) * BLOCK_SIZE - this.h;
                this.onGround = true;
            } else if (this.vy < 0) {
                // Moving up — place top edge below the ceiling block
                this.y = (Math.floor(this.y / BLOCK_SIZE) + 1) * BLOCK_SIZE;
            }
            this.vy = 0;
        }
    }

    // -----------------------------------------------------------------------
    // Animation & Render
    // -----------------------------------------------------------------------
    /**
     * Trigger tool swing animation.
     * @param {string} [toolKind='pickaxe'] - 'pickaxe', 'axe', or 'sword'
     */
    startSwing(toolKind = 'pickaxe') {
        this.swingActive = true;
        this.swingAngle = -this.swingMax * 0.5;
        this.swingTool = toolKind;
    }

    /**
     * Update swing animation.
     */
    updateSwing(dt) {
        if (!this.swingActive) return;
        this.swingAngle += this.swingSpeed * dt;
        if (this.swingAngle > this.swingMax * 0.5) {
            this.swingActive = false;
            this.swingAngle = 0;
        }
    }

    /**
     * Apply custom colors from menu config.
     */
    setColors(colorObj) {
        if (colorObj.hair)  this.colors.hair  = colorObj.hair;
        if (colorObj.shirt) this.colors.shirt = colorObj.shirt;
        if (colorObj.pants) this.colors.pants = colorObj.pants;
    }

    draw(ctx, camera) {
        if (this.isDead) return;

        const { sx, sy } = camera.worldToScreen(this.x, this.y);
        const rx = Math.round(sx);
        const ry = Math.round(sy);

        // Invulnerability flash (blink)
        if (this.invulnTimer > 0 && Math.floor(this.invulnTimer * 15) % 2 === 0) return;

        // Outline
        ctx.fillStyle = '#000';
        ctx.fillRect(rx - 1, ry - 1, this.w + 2, this.h + 2);

        // --- Structured character: Head, Body, Arms, Legs ---
        const headH = 8;
        const bodyH = 12;
        const legH  = this.h - headH - bodyH;

        // Head (skin)
        ctx.fillStyle = '#e8c07a';
        ctx.fillRect(rx, ry, this.w, headH);

        // Hair (customizable)
        ctx.fillStyle = this.colors.hair;
        ctx.fillRect(rx, ry, this.w, 3);

        // Eyes
        ctx.fillStyle = '#1a1a2e';
        if (this.facing >= 0) {
            ctx.fillRect(rx + 9, ry + 4, 3, 3);
        } else {
            ctx.fillRect(rx + 2, ry + 4, 3, 3);
        }

        // Body (customizable shirt)
        ctx.fillStyle = this.colors.shirt;
        ctx.fillRect(rx, ry + headH, this.w, bodyH);

        // Belt
        ctx.fillStyle = '#5a4020';
        ctx.fillRect(rx, ry + headH + bodyH - 2, this.w, 2);

        // Arms (skin)
        ctx.fillStyle = '#e8c07a';
        ctx.fillRect(rx - 3, ry + headH + 2, 3, 8);
        ctx.fillRect(rx + this.w, ry + headH + 2, 3, 8);

        // Legs (customizable pants)
        ctx.fillStyle = this.colors.pants;
        ctx.fillRect(rx, ry + headH + bodyH, 6, legH);
        ctx.fillRect(rx + this.w - 6, ry + headH + bodyH, 6, legH);

        // Shoes
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(rx, ry + this.h - 2, 6, 2);
        ctx.fillRect(rx + this.w - 6, ry + this.h - 2, 6, 2);

        // --- Tool swing overlay ---
        if (this.swingActive) {
            const shoulderX = rx + (this.facing > 0 ? this.w : 0);
            const shoulderY = ry + headH + 4;
            ctx.save();
            ctx.translate(shoulderX, shoulderY);
            const rotAngle = this.facing > 0 ? this.swingAngle : -this.swingAngle;
            ctx.rotate(rotAngle);

            const f = this.facing;
            const tool = this.swingTool || 'pickaxe';

            if (tool === 'axe') {
                // Cabo (marrom)
                ctx.fillStyle = '#7a4e2d';
                ctx.fillRect(0, -1, 20 * f, 2);
                // Lâmina do machado (metal)
                ctx.fillStyle = '#aaaaaa';
                ctx.fillRect(15 * f, -5, 6 * f, 9);
                ctx.fillStyle = '#cccccc';
                ctx.fillRect(16 * f, -6, 3 * f, 2); // fio superior
                ctx.fillRect(16 * f,  5, 3 * f, 2); // fio inferior
            } else if (tool === 'sword') {
                // Lâmina (prateado)
                ctx.fillStyle = '#bbbbcc';
                ctx.fillRect(0, -2, 24 * f, 3);
                // Guarda-mão (dourado)
                ctx.fillStyle = '#ddaa22';
                ctx.fillRect(4 * f, -4, 3 * f, 7);
                // Ponta
                ctx.fillStyle = '#ddddee';
                ctx.fillRect(21 * f, -1, 4 * f, 2);
            } else {
                // Picareta — cabo (marrom) + cabeça em L
                ctx.fillStyle = '#7a4e2d';
                ctx.fillRect(0, -1, 20 * f, 2);
                // Corpo da cabeça (metal)
                ctx.fillStyle = '#999999';
                ctx.fillRect(14 * f, -3, 7 * f, 3);
                // Ponta superior (bico)
                ctx.fillStyle = '#bbbbbb';
                ctx.fillRect(19 * f, -6, 3 * f, 4);
                // Ponta inferior (ancinho)
                ctx.fillStyle = '#aaaaaa';
                ctx.fillRect(19 * f,  1, 3 * f, 3);
            }

            ctx.restore();
        }
    }

    /**
     * Center point in world-pixels (for camera targeting).
     * @returns {{ cx: number, cy: number }}
     */
    getCenter() {
        return {
            cx: this.x + this.w * 0.5,
            cy: this.y + this.h * 0.5
        };
    }

    /**
     * World block coordinates of the player's feet.
     * Useful for biome lookup and UI.
     */
    getBlockPos() {
        return {
            bx: Math.floor((this.x + this.w * 0.5) / BLOCK_SIZE),
            by: Math.floor((this.y + this.h)        / BLOCK_SIZE)
        };
    }
}
