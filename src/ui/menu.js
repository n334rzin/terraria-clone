/**
 * MainMenu — Splash screen with animated parallax world scene.
 * Visual: sky gradient, twinkling stars, moon, 3 mountain layers, trees, torch,
 *         walking player preview, glowing title.
 */

const WORLD_PRESETS = Object.freeze({
    SMALL:  { w: 1000, h: 400, label: 'Pequeno (1000×400)' },
    MEDIUM: { w: 2000, h: 600, label: 'Médio (2000×600)' },
    LARGE:  { w: 4000, h: 1000, label: 'Grande (4000×1000)' },
});

const DEFAULT_COLORS = {
    hair:  '#5a3010',
    shirt: '#3a7ad9',
    pants: '#5a4a3a',
};

class MainMenu {
    constructor(canvasEl) {
        this.canvas = canvasEl;
        this.active = true;
        this.screen = 'title';

        this.playerColors = { ...DEFAULT_COLORS };
        this.selectedWorld = 'MEDIUM';
        this.qaBotEnabled = false;

        this._buttons = [];
        this._time = 0;

        // Star field — fixed random positions
        this._stars = Array.from({ length: 180 }, (_, i) => ({
            x: (i * 137.508) % 1,
            y: (i * 93.701 + i * 0.3) % 0.65,
            size: i % 7 === 0 ? 2 : 1,
            speed: 0.4 + (i % 5) * 0.15,
        }));

        // Clouds
        this._clouds = Array.from({ length: 5 }, (_, i) => ({
            x: i * 0.2 + 0.05,
            y: 0.08 + (i % 3) * 0.06,
            w: 0.08 + (i % 3) * 0.03,
        }));

        // Walking player animation
        this._playerWalkX = 0;
        this._playerStep = 0;

        this._colorOptions = {
            hair:  ['#5a3010', '#1a1a2e', '#d4a800', '#cc3333', '#eeeedd', '#7722cc'],
            shirt: ['#3a7ad9', '#cc2222', '#22aa44', '#dd8800', '#8833aa', '#222222'],
            pants: ['#5a4a3a', '#2a2a4a', '#3a3a3a', '#1a4a2a', '#4a2a1a', '#cccccc'],
        };

        this._mouseX = 0;
        this._mouseY = 0;
        this._mouseClicked = false;
        this._onMouseMove = (e) => { this._mouseX = e.clientX; this._mouseY = e.clientY; };
        this._onMouseDown = (e) => { if (e.button === 0) this._mouseClicked = true; };
        canvasEl.addEventListener('mousemove', this._onMouseMove);
        canvasEl.addEventListener('mousedown', this._onMouseDown);

        // Pre-bake mountain silhouettes for 3 layers
        this._mtnCache = null;
    }

    getConfig() {
        const preset = WORLD_PRESETS[this.selectedWorld];
        return {
            worldW: preset.w,
            worldH: preset.h,
            playerColors: { ...this.playerColors },
            qaBotEnabled: this.qaBotEnabled,
        };
    }

    destroy() {
        this.canvas.removeEventListener('mousemove', this._onMouseMove);
        this.canvas.removeEventListener('mousedown', this._onMouseDown);
    }

    update(dt) {
        this._time += dt;
        this._playerWalkX += dt * 60;
        this._playerStep = Math.floor(this._time * 6) % 4;
        const result = this._processInput();
        this._mouseClicked = false;
        return result;
    }

    _processInput() {
        if (!this._mouseClicked) return false;
        for (let i = 0; i < this._buttons.length; i++) {
            const b = this._buttons[i];
            if (this._mouseX >= b.x && this._mouseX <= b.x + b.w &&
                this._mouseY >= b.y && this._mouseY <= b.y + b.h) {
                return this._handleButton(b.action, b.data);
            }
        }
        return false;
    }

    _handleButton(action, data) {
        if (window._audio) window._audio.playSelect();
        switch (action) {
            case 'play':       this.screen = 'worldSelect'; return false;
            case 'customize':  this.screen = 'customize';   return false;
            case 'qabot':      this.qaBotEnabled = !this.qaBotEnabled; return false;
            case 'back':       this.screen = 'title';        return false;
            case 'startGame':  this.active = false;          return true;
            case 'selectWorld':this.selectedWorld = data;    return false;
            case 'setColor':   this.playerColors[data.part] = data.color; return false;
        }
        return false;
    }

    // =========================================================================
    // MAIN DRAW
    // =========================================================================
    draw(ctx, w, h) {
        this._buttons = [];
        this._drawBackground(ctx, w, h);
        if (this.screen === 'title')       this._drawTitle(ctx, w, h);
        else if (this.screen === 'customize')  this._drawCustomize(ctx, w, h);
        else if (this.screen === 'worldSelect') this._drawWorldSelect(ctx, w, h);
    }

    // =========================================================================
    // BACKGROUND SCENE — drawn on all screens
    // =========================================================================
    _drawBackground(ctx, w, h) {
        const t = this._time;
        const groundY = h * 0.72;

        // --- Sky gradient ---
        const sky = ctx.createLinearGradient(0, 0, 0, groundY);
        sky.addColorStop(0,   '#010410');
        sky.addColorStop(0.3, '#060d28');
        sky.addColorStop(0.7, '#0e1f50');
        sky.addColorStop(1,   '#1a3060');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, groundY);

        // --- Moon ---
        const moonX = w * 0.82;
        const moonY = h * 0.12;
        ctx.save();
        ctx.shadowColor = 'rgba(200,220,255,0.6)';
        ctx.shadowBlur = 30;
        ctx.fillStyle = '#e8e8ff';
        ctx.beginPath();
        ctx.arc(moonX, moonY, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0a0e20'; // crater shadow
        ctx.beginPath();
        ctx.arc(moonX + 8, moonY - 4, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // Crater details
        ctx.fillStyle = 'rgba(180,180,220,0.3)';
        ctx.beginPath(); ctx.arc(moonX - 6, moonY + 4, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(moonX + 3, moonY - 6, 2, 0, Math.PI * 2); ctx.fill();

        // --- Stars ---
        for (const s of this._stars) {
            const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(t * s.speed + s.x * 100));
            ctx.fillStyle = `rgba(220,230,255,${twinkle.toFixed(2)})`;
            ctx.fillRect(s.x * w | 0, s.y * h | 0, s.size, s.size);
        }

        // --- Clouds ---
        for (const c of this._clouds) {
            const cx = ((c.x + t * 0.018) % 1.2 - 0.1) * w;
            const cy = c.y * h;
            const cw = c.w * w;
            ctx.save();
            ctx.globalAlpha = 0.18;
            ctx.fillStyle = '#aaccff';
            this._drawCloud(ctx, cx, cy, cw);
            ctx.restore();
        }

        // --- Mountain layer 3 (far, low contrast) ---
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#1a2f55';
        this._drawMountains(ctx, w, groundY, 6, 0.22, 0.08, 0.007, 0);
        ctx.restore();

        // --- Mountain layer 2 (mid) ---
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = '#0f1e3a';
        this._drawMountains(ctx, w, groundY, 9, 0.17, 0.05, 0.012, 200);
        ctx.restore();

        // --- Mountain layer 1 (near, darkest) ---
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#080e22';
        this._drawMountains(ctx, w, groundY, 14, 0.12, 0.03, 0.02, 500);
        ctx.restore();

        // --- Underground fill ---
        const ugGrad = ctx.createLinearGradient(0, groundY, 0, h);
        ugGrad.addColorStop(0, '#0a0c1a');
        ugGrad.addColorStop(1, '#050710');
        ctx.fillStyle = ugGrad;
        ctx.fillRect(0, groundY, w, h - groundY);

        // --- Ground blocks row ---
        const BS = 16;
        for (let bx = 0; bx < w + BS; bx += BS) {
            // Grass top
            ctx.fillStyle = '#2d6e18';
            ctx.fillRect(bx, groundY, BS, 3);
            ctx.fillStyle = '#1e5010';
            ctx.fillRect(bx, groundY, BS, 1);
            // Dirt
            ctx.fillStyle = '#5a3a1e';
            ctx.fillRect(bx, groundY + 3, BS, BS - 3);
            // Dirt variation
            ctx.fillStyle = '#4a2a14';
            ctx.fillRect(bx + (bx * 7) % (BS - 4), groundY + 5, 2, 2);
            // Block seams
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(bx, groundY, 1, BS);
            ctx.fillRect(bx, groundY + BS - 1, BS, 1);
        }

        // --- Second dirt row ---
        for (let bx = 0; bx < w + BS; bx += BS) {
            ctx.fillStyle = '#4a3018';
            ctx.fillRect(bx, groundY + BS, BS, BS);
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fillRect(bx, groundY + BS, 1, BS);
        }

        // --- Trees ---
        const treePositions = [0.08, 0.22, 0.42, 0.55, 0.70, 0.88];
        for (const tp of treePositions) {
            this._drawMenuTree(ctx, tp * w, groundY);
        }

        // --- Torches ---
        this._drawMenuTorch(ctx, w * 0.30, groundY, t);
        this._drawMenuTorch(ctx, w * 0.65, groundY, t + 1.2);

        // --- Underground blocks peek ---
        for (let bx = 0; bx < w + BS; bx += BS) {
            ctx.fillStyle = '#3a3a5a';
            ctx.fillRect(bx, groundY + BS * 2, BS, 4);
            // Occasional ore glint
            if ((bx * 13) % 80 < 8) {
                ctx.fillStyle = '#8855aa';
                ctx.fillRect(bx + 4, groundY + BS * 2 + 1, 2, 2);
            }
        }
    }

    _drawMountains(ctx, w, groundY, peaks, heightFactor, noiseAmp, freq, seed) {
        ctx.beginPath();
        ctx.moveTo(0, groundY);
        const step = w / (peaks * 4);
        for (let x = 0; x <= w; x += step) {
            const n1 = Math.sin(x * freq + seed * 0.01) * 0.5;
            const n2 = Math.sin(x * freq * 2.1 + seed * 0.02 + 1) * 0.3;
            const n3 = Math.sin(x * freq * 3.7 + seed * 0.03 + 2) * 0.2;
            const h2 = (n1 + n2 + n3) * 0.5 + 0.5;
            const y = groundY - h2 * groundY * heightFactor - groundY * noiseAmp;
            x === 0 ? ctx.moveTo(0, y) : ctx.lineTo(x, y);
        }
        ctx.lineTo(w, groundY);
        ctx.closePath();
        ctx.fill();
    }

    _drawCloud(ctx, x, y, w) {
        ctx.beginPath();
        ctx.ellipse(x, y, w * 0.5, w * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + w * 0.2, y - w * 0.08, w * 0.3, w * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x - w * 0.15, y - w * 0.04, w * 0.25, w * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    _drawMenuTree(ctx, x, groundY) {
        const h = 36 + (x * 7 | 0) % 18;
        // Trunk
        ctx.fillStyle = '#2e1a08';
        ctx.fillRect(x - 3 | 0, groundY - h | 0, 7, h);
        ctx.fillStyle = '#3e2a14';
        ctx.fillRect(x - 2 | 0, groundY - h | 0, 2, h);
        // Leaves — 3 layers bottom to top
        ctx.fillStyle = '#153a0a';
        ctx.fillRect(x - 14 | 0, groundY - h - 6 | 0, 29, 14);
        ctx.fillStyle = '#1e5010';
        ctx.fillRect(x - 11 | 0, groundY - h - 18 | 0, 23, 14);
        ctx.fillStyle = '#2a6814';
        ctx.fillRect(x - 7 | 0, groundY - h - 28 | 0, 15, 12);
        // Highlight on leaves
        ctx.fillStyle = '#3a8820';
        ctx.fillRect(x - 4 | 0, groundY - h - 26 | 0, 5, 3);
        ctx.fillRect(x - 8 | 0, groundY - h - 16 | 0, 6, 3);
    }

    _drawMenuTorch(ctx, x, groundY, t) {
        const flicker = 0.7 + 0.3 * Math.sin(t * 12 + x);
        x = x | 0;
        // Torch glow
        ctx.save();
        const glow = ctx.createRadialGradient(x, groundY - 18, 2, x, groundY - 18, 28 * flicker);
        glow.addColorStop(0, `rgba(255,180,50,${0.25 * flicker})`);
        glow.addColorStop(1, 'rgba(255,100,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - 30, groundY - 48, 60, 60);
        ctx.restore();
        // Stick
        ctx.fillStyle = '#6a4a18';
        ctx.fillRect(x - 1, groundY - 14, 3, 14);
        // Flame layers
        ctx.fillStyle = `rgba(200,80,0,${flicker})`;
        ctx.fillRect(x - 2, groundY - 20, 5, 7);
        ctx.fillStyle = `rgba(255,160,0,${flicker})`;
        ctx.fillRect(x - 1, groundY - 22, 3, 6);
        ctx.fillStyle = `rgba(255,240,100,${flicker * 0.9})`;
        ctx.fillRect(x, groundY - 23, 1, 3);
    }

    // =========================================================================
    // TITLE SCREEN
    // =========================================================================
    _drawTitle(ctx, w, h) {
        const t = this._time;
        const groundY = h * 0.72;

        // Animated walking player at the bottom
        const walkX = (w * 0.35 + Math.sin(t * 1.2) * w * 0.08) | 0;
        const step = this._playerStep;
        this._drawAnimatedPlayer(ctx, walkX, groundY, step, this.playerColors);

        // --- TITLE BLOCK ---
        const titleY = h * 0.18;

        // Outer glow pulse
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.8);
        ctx.save();
        ctx.shadowColor = `rgba(80,180,255,${0.5 + 0.4 * pulse})`;
        ctx.shadowBlur = 40 + 20 * pulse;

        // Title shadow
        ctx.fillStyle = 'rgba(0,10,40,0.9)';
        ctx.font = 'bold 58px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('TERRAVOXEL', w * 0.5 + 3, titleY + 3);

        // Title gradient
        const titleGrad = ctx.createLinearGradient(w * 0.1, titleY - 50, w * 0.9, titleY);
        titleGrad.addColorStop(0,   '#4dd8ff');
        titleGrad.addColorStop(0.3, '#88eeff');
        titleGrad.addColorStop(0.6, '#ffffff');
        titleGrad.addColorStop(1,   '#88ccff');
        ctx.fillStyle = titleGrad;
        ctx.fillText('TERRAVOXEL', w * 0.5, titleY);
        ctx.restore();

        // Subtitle
        ctx.save();
        ctx.shadowColor = 'rgba(100,200,255,0.6)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#88bbdd';
        ctx.font = '16px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SANDBOX 2D', w * 0.5, titleY + 34);
        ctx.restore();

        // Decorative pixel line under title
        const lineY = titleY + 50;
        const lineX = w * 0.5 - 180;
        for (let i = 0; i < 36; i++) {
            const col = i % 6;
            const colors = ['#ff4444','#ff8844','#ffcc44','#44ff88','#44aaff','#aa44ff'];
            ctx.fillStyle = colors[col];
            ctx.fillRect(lineX + i * 10, lineY, 8, 3);
        }

        // --- BUTTONS ---
        const btnW = 300;
        const btnH = 52;
        const btnX = (w - btnW) * 0.5;
        let btnY = h * 0.36;

        this._drawButton(ctx, btnX, btnY, btnW, btnH, '▶  JOGAR', 'play');
        btnY += 68;
        this._drawButton(ctx, btnX, btnY, btnW, btnH, '✦  CUSTOMIZAR', 'customize');
        btnY += 68;
        const qaLabel = this.qaBotEnabled ? '🤖  BOT QA: ATIVO' : '🤖  BOT QA: OFF';
        const qaBg = this.qaBotEnabled ? '#0a2a0a' : null;
        this._drawButton(ctx, btnX, btnY, btnW, btnH, qaLabel, 'qabot', null, qaBg);

        // Controls hint
        ctx.fillStyle = 'rgba(120,160,200,0.6)';
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('WASD/SETAS · MOUSE · E=INVENTÁRIO · I=CRAFTING · P=BOT', w * 0.5, h * 0.94);

        ctx.fillStyle = 'rgba(80,100,140,0.5)';
        ctx.font = '8px monospace';
        ctx.fillText('v2.1 — HTML5 Canvas', w * 0.5, h * 0.97);
    }

    _drawAnimatedPlayer(ctx, x, groundY, step, colors) {
        const y = groundY - 30;
        const legSwing = (step % 2 === 0) ? 3 : -3;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(x - 7, groundY - 2, 18, 4);

        // --- Legs ---
        ctx.fillStyle = colors.pants;
        ctx.fillRect(x, y + 20, 5, 8 + (step % 2 === 0 ? 2 : 0));
        ctx.fillRect(x + 7, y + 20, 5, 8 + (step % 2 !== 0 ? 2 : 0));
        // Shoes
        ctx.fillStyle = '#222';
        ctx.fillRect(x - 1, y + 28 + (step % 2 === 0 ? 2 : 0), 7, 2);
        ctx.fillRect(x + 6, y + 28 + (step % 2 !== 0 ? 2 : 0), 7, 2);

        // --- Body ---
        ctx.fillStyle = colors.shirt;
        ctx.fillRect(x - 1, y + 8, 16, 13);
        ctx.fillStyle = '#5a4020';
        ctx.fillRect(x - 1, y + 19, 16, 2);

        // --- Arms ---
        ctx.fillStyle = '#e8c07a';
        ctx.fillRect(x - 4, y + 10, 4, 7);
        ctx.fillRect(x + 14, y + 10, 4, 7);

        // --- Head ---
        ctx.fillStyle = '#e8c07a';
        ctx.fillRect(x, y, 14, 9);
        ctx.fillStyle = colors.hair;
        ctx.fillRect(x, y, 14, 3);
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(x + 9, y + 4, 3, 3);

        // Outline
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 1, y, 16, 31);
    }

    // =========================================================================
    // CUSTOMIZE SCREEN
    // =========================================================================
    _drawCustomize(ctx, w, h) {
        // Semi-transparent panel
        ctx.fillStyle = 'rgba(5,10,25,0.88)';
        ctx.fillRect(w * 0.1, h * 0.06, w * 0.8, h * 0.88);
        ctx.strokeStyle = 'rgba(80,140,220,0.4)';
        ctx.lineWidth = 2;
        ctx.strokeRect(w * 0.1, h * 0.06, w * 0.8, h * 0.88);

        ctx.fillStyle = '#aaddff';
        ctx.font = 'bold 20px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CUSTOMIZAR', w * 0.5, h * 0.14);

        // Large player preview (animated)
        this._drawAnimatedPlayer(ctx, w * 0.5 - 36, h * 0.36, this._playerStep, this.playerColors);
        // Scale up 3x manually
        const previewX = w * 0.5 - 7 * 3;
        const previewY = h * 0.22;
        ctx.save();
        ctx.translate(previewX, previewY);
        ctx.scale(3, 3);
        this._drawAnimatedPlayer(ctx, 0, 30, this._playerStep, this.playerColors);
        ctx.restore();

        const parts = ['hair', 'shirt', 'pants'];
        const labels = { hair: 'Cabelo', shirt: 'Camisa', pants: 'Calça' };
        let yOff = h * 0.52;

        for (const part of parts) {
            ctx.fillStyle = '#88aacc';
            ctx.font = '11px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(labels[part], w * 0.5, yOff);

            const colors = this._colorOptions[part];
            const swatch = 34;
            const totalCW = colors.length * (swatch + 4);
            let cx = (w - totalCW) * 0.5;
            yOff += 12;

            for (const color of colors) {
                const selected = (this.playerColors[part] === color);
                if (selected) {
                    ctx.fillStyle = '#4488ff';
                    ctx.fillRect(cx - 3, yOff - 3, swatch + 6, swatch + 6);
                }
                ctx.fillStyle = color;
                ctx.fillRect(cx, yOff, swatch, swatch);
                // Shine on swatch
                ctx.fillStyle = 'rgba(255,255,255,0.15)';
                ctx.fillRect(cx + 2, yOff + 2, swatch - 4, 4);
                this._buttons.push({ x: cx, y: yOff, w: swatch, h: swatch, action: 'setColor', data: { part, color } });
                cx += swatch + 4;
            }
            yOff += swatch + 16;
        }

        this._drawButton(ctx, (w - 220) * 0.5, h * 0.88, 220, 44, '← VOLTAR', 'back');
    }

    // =========================================================================
    // WORLD SELECT SCREEN
    // =========================================================================
    _drawWorldSelect(ctx, w, h) {
        ctx.fillStyle = 'rgba(5,10,25,0.88)';
        ctx.fillRect(w * 0.1, h * 0.06, w * 0.8, h * 0.88);
        ctx.strokeStyle = 'rgba(80,180,120,0.4)';
        ctx.lineWidth = 2;
        ctx.strokeRect(w * 0.1, h * 0.06, w * 0.8, h * 0.88);

        ctx.fillStyle = '#88ffaa';
        ctx.font = 'bold 18px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SELECIONAR MUNDO', w * 0.5, h * 0.15);

        // World info
        const worldIcons = { SMALL: '🌱', MEDIUM: '🌍', LARGE: '🌐' };
        const worldDescs = {
            SMALL: 'Rápido para explorar e testar',
            MEDIUM: 'Balanceado — recomendado',
            LARGE: 'Imenso! Pode ser lento no início',
        };

        const presets = Object.entries(WORLD_PRESETS);
        const btnW = Math.min(400, w * 0.6);
        const btnX = (w - btnW) * 0.5;
        let btnY = h * 0.24;

        for (const [key, preset] of presets) {
            const selected = (this.selectedWorld === key);
            this._drawButton(ctx, btnX, btnY, btnW, 60, `${worldIcons[key]}  ${preset.label}`, 'selectWorld', key,
                selected ? '#0a2a18' : null, selected ? '#44ff88' : null);
            // Description
            ctx.fillStyle = selected ? '#88ffaa' : '#557755';
            ctx.font = '9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(worldDescs[key], w * 0.5, btnY + 76);
            btnY += 95;
        }

        this._drawButton(ctx, btnX, btnY + 10, btnW, 60, '🚀  INICIAR JOGO', 'startGame', null, '#0a2010', '#44ff88');
        this._drawButton(ctx, (w - 200) * 0.5, h * 0.91, 200, 40, '← VOLTAR', 'back');
    }

    // =========================================================================
    // BUTTON RENDERER
    // =========================================================================
    _drawButton(ctx, x, y, w, h, text, action, data, bgOverride, borderOverride) {
        const hover = this._mouseX >= x && this._mouseX <= x + w &&
                      this._mouseY >= y && this._mouseY <= y + h;

        // Background
        if (bgOverride) {
            ctx.fillStyle = bgOverride;
        } else if (hover) {
            const hg = ctx.createLinearGradient(x, y, x, y + h);
            hg.addColorStop(0, 'rgba(60,120,200,0.55)');
            hg.addColorStop(1, 'rgba(30,60,120,0.55)');
            ctx.fillStyle = hg;
        } else {
            const ng = ctx.createLinearGradient(x, y, x, y + h);
            ng.addColorStop(0, 'rgba(20,40,80,0.7)');
            ng.addColorStop(1, 'rgba(10,20,50,0.7)');
            ctx.fillStyle = ng;
        }
        ctx.fillRect(x, y, w, h);

        // Shine on top of button
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(x + 2, y + 2, w - 4, h * 0.4);

        // Border with glow
        const borderColor = borderOverride || (hover ? '#66aaff' : 'rgba(80,120,200,0.5)');
        ctx.save();
        if (hover) {
            ctx.shadowColor = borderColor;
            ctx.shadowBlur = 12;
        }
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = hover ? 2 : 1;
        ctx.strokeRect(x, y, w, h);
        ctx.restore();

        // Text
        ctx.fillStyle = hover ? '#ffffff' : '#aaccee';
        ctx.font = `bold 14px "Press Start 2P", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + w * 0.5, y + h * 0.5);
        ctx.textBaseline = 'alphabetic';

        this._buttons.push({ x, y, w, h, action, data });
    }
}
