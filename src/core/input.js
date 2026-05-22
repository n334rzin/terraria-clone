/**
 * InputManager — Centralized mouse + keyboard state tracking.
 * Converts screen mouse position to world/block coordinates via Camera.
 */

class InputManager {
    constructor(canvasEl) {
        this.canvas = canvasEl;

        // Mouse state
        this.mouseScreenX = 0;
        this.mouseScreenY = 0;
        this.mouseWorldX  = 0;
        this.mouseWorldY  = 0;
        this.mouseBlockX  = 0;
        this.mouseBlockY  = 0;
        this.mouseDown    = { left: false, right: false };
        this.mouseJustPressed = { left: false, right: false };
        this.scrollDelta  = 0;

        // Keyboard state
        this.keys         = {};
        this.keysJustPressed = {};

        this._bind();
    }

    _bind() {
        const c = this.canvas;

        c.addEventListener('mousemove', e => {
            this.mouseScreenX = e.clientX;
            this.mouseScreenY = e.clientY;
        });

        c.addEventListener('mousedown', e => {
            e.preventDefault();
            if (e.button === 0) { this.mouseDown.left = true; this.mouseJustPressed.left = true; }
            if (e.button === 2) { this.mouseDown.right = true; this.mouseJustPressed.right = true; }
        });

        c.addEventListener('mouseup', e => {
            if (e.button === 0) this.mouseDown.left = false;
            if (e.button === 2) this.mouseDown.right = false;
        });

        c.addEventListener('contextmenu', e => e.preventDefault());

        c.addEventListener('wheel', e => {
            e.preventDefault();
            this.scrollDelta += Math.sign(e.deltaY);
        }, { passive: false });

        window.addEventListener('keydown', e => {
            this.keys[e.code] = true;
            this.keysJustPressed[e.code] = true;
            if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', e => {
            this.keys[e.code] = false;
        });
    }

    /**
     * Update world coordinates based on camera. Call once per frame BEFORE game logic.
     */
    update(camera) {
        const { wx, wy } = camera.screenToWorld(this.mouseScreenX, this.mouseScreenY);
        this.mouseWorldX = wx;
        this.mouseWorldY = wy;
        this.mouseBlockX = Math.floor(wx / BLOCK_SIZE);
        this.mouseBlockY = Math.floor(wy / BLOCK_SIZE);
    }

    /**
     * Clear per-frame events. Call at END of each frame.
     */
    endFrame() {
        this.mouseJustPressed.left  = false;
        this.mouseJustPressed.right = false;
        this.keysJustPressed = {};
        this.scrollDelta = 0;
    }

    isKeyDown(code)        { return !!this.keys[code]; }
    isKeyJustPressed(code) { return !!this.keysJustPressed[code]; }
}
