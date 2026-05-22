/**
 * MainMenu — Title screen with Play, Customize, QA Bot buttons.
 * Includes player customization (hair, shirt, pants color) and world size selection.
 * Renders entirely on the game canvas.
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
        this.screen = 'title'; // 'title' | 'customize' | 'worldSelect'

        // Customization state
        this.playerColors = { ...DEFAULT_COLORS };

        // World selection
        this.selectedWorld = 'MEDIUM';

        // QA Bot toggle
        this.qaBotEnabled = false;

        // UI button rects (recalculated on draw)
        this._buttons = [];
        this._hoverIdx = -1;

        // Animation
        this._time = 0;
        this._titleGlow = 0;

        // Color picker state
        this._colorOptions = {
            hair:  ['#5a3010', '#1a1a2e', '#d4a800', '#cc3333', '#eeeedd', '#7722cc'],
            shirt: ['#3a7ad9', '#cc2222', '#22aa44', '#dd8800', '#8833aa', '#222222'],
            pants: ['#5a4a3a', '#2a2a4a', '#3a3a3a', '#1a4a2a', '#4a2a1a', '#cccccc'],
        };

        // Bind mouse
        this._mouseX = 0;
        this._mouseY = 0;
        this._mouseClicked = false;
        this._onMouseMove = (e) => { this._mouseX = e.clientX; this._mouseY = e.clientY; };
        this._onMouseDown = (e) => { if (e.button === 0) this._mouseClicked = true; };
        canvasEl.addEventListener('mousemove', this._onMouseMove);
        canvasEl.addEventListener('mousedown', this._onMouseDown);
    }

    /**
     * Returns config when user starts game: { worldW, worldH, playerColors, qaBotEnabled }
     */
    getConfig() {
        const preset = WORLD_PRESETS[this.selectedWorld];
        return {
            worldW: preset.w,
            worldH: preset.h,
            playerColors: { ...this.playerColors },
            qaBotEnabled: this.qaBotEnabled,
        };
    }

    /**
     * Cleanup listeners when menu closes.
     */
    destroy() {
        this.canvas.removeEventListener('mousemove', this._onMouseMove);
        this.canvas.removeEventListener('mousedown', this._onMouseDown);
    }

    /**
     * Update + Render menu. Returns true if game should start.
     */
    update(dt) {
        this._time += dt;
        this._titleGlow = 0.5 + 0.5 * Math.sin(this._time * 2);

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
        switch (action) {
            case 'play':
                this.screen = 'worldSelect';
                if (window._audio) window._audio.playSelect();
                return false;
            case 'customize':
                this.screen = 'customize';
                if (window._audio) window._audio.playSelect();
                return false;
            case 'qabot':
                this.qaBotEnabled = !this.qaBotEnabled;
                if (window._audio) window._audio.playSelect();
                return false;
            case 'back':
                this.screen = 'title';
                if (window._audio) window._audio.playSelect();
                return false;
            case 'startGame':
                if (window._audio) window._audio.playSelect();
                this.active = false;
                return true;
            case 'selectWorld':
                this.selectedWorld = data;
                if (window._audio) window._audio.playSelect();
                return false;
            case 'setColor':
                this.playerColors[data.part] = data.color;
                if (window._audio) window._audio.playSelect();
                return false;
        }
        return false;
    }

    /**
     * Render the menu on the canvas context.
     */
    draw(ctx, w, h) {
        this._buttons = [];

        // Background
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#050510');
        grad.addColorStop(0.5, '#0a1030');
        grad.addColorStop(1, '#1a0a30');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Stars
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        for (let i = 0; i < 60; i++) {
            const sx = ((i * 137.5) % w);
            const sy = ((i * 93.7 + this._time * 5) % h);
            ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
        }

        if (this.screen === 'title') this._drawTitle(ctx, w, h);
        else if (this.screen === 'customize') this._drawCustomize(ctx, w, h);
        else if (this.screen === 'worldSelect') this._drawWorldSelect(ctx, w, h);
    }

    _drawTitle(ctx, w, h) {
        // Title
        const glowAlpha = 0.4 + this._titleGlow * 0.6;
        ctx.save();
        ctx.shadowColor = `rgba(100, 200, 255, ${glowAlpha})`;
        ctx.shadowBlur = 20;
        ctx.fillStyle = '#aaeeff';
        ctx.font = 'bold 48px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('TERRAVOXEL', w * 0.5, h * 0.22);
        ctx.restore();

        ctx.fillStyle = '#88aacc';
        ctx.font = '16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Um mundo vivo à sua espera', w * 0.5, h * 0.28);

        // Buttons
        const btnW = 260;
        const btnH = 50;
        const btnX = (w - btnW) * 0.5;
        let btnY = h * 0.38;

        this._drawButton(ctx, btnX, btnY, btnW, btnH, '▶ JOGAR', 'play');
        btnY += 70;
        this._drawButton(ctx, btnX, btnY, btnW, btnH, '🎨 CUSTOMIZAR', 'customize');
        btnY += 70;
        const qaTxt = this.qaBotEnabled ? '🤖 BOT QA: ATIVO' : '🤖 ATIVAR BOT QA';
        this._drawButton(ctx, btnX, btnY, btnW, btnH, qaTxt, 'qabot', this.qaBotEnabled ? '#224422' : null);

        // Footer
        ctx.fillStyle = '#556';
        ctx.font = '11px monospace';
        ctx.fillText('v2.0 — WASD + Mouse | E = Inventário | P = QA Bot', w * 0.5, h * 0.92);

        // Preview player
        this._drawPlayerPreview(ctx, w * 0.5, h * 0.72, 3);
    }

    _drawCustomize(ctx, w, h) {
        ctx.fillStyle = '#ddd';
        ctx.font = 'bold 28px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CUSTOMIZAR PERSONAGEM', w * 0.5, h * 0.12);

        // Player preview (large)
        this._drawPlayerPreview(ctx, w * 0.5, h * 0.35, 5);

        // Color pickers
        const parts = ['hair', 'shirt', 'pants'];
        const labels = { hair: 'Cabelo', shirt: 'Camisa', pants: 'Calça' };
        let yOff = h * 0.55;

        for (const part of parts) {
            ctx.fillStyle = '#aaa';
            ctx.font = '14px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(labels[part], w * 0.5, yOff);

            const colors = this._colorOptions[part];
            const totalCW = colors.length * 36;
            let cx = (w - totalCW) * 0.5;
            yOff += 10;

            for (const color of colors) {
                const selected = (this.playerColors[part] === color);
                ctx.fillStyle = color;
                ctx.fillRect(cx, yOff, 30, 30);
                if (selected) {
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(cx - 1, yOff - 1, 32, 32);
                }
                this._buttons.push({ x: cx, y: yOff, w: 30, h: 30, action: 'setColor', data: { part, color } });
                cx += 36;
            }
            yOff += 50;
        }

        // Back button
        this._drawButton(ctx, (w - 200) * 0.5, h * 0.88, 200, 40, '← VOLTAR', 'back');
    }

    _drawWorldSelect(ctx, w, h) {
        ctx.fillStyle = '#ddd';
        ctx.font = 'bold 28px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SELECIONAR MUNDO', w * 0.5, h * 0.15);

        const presets = Object.entries(WORLD_PRESETS);
        const btnW = 320;
        const btnH = 55;
        const btnX = (w - btnW) * 0.5;
        let btnY = h * 0.28;

        for (const [key, preset] of presets) {
            const selected = (this.selectedWorld === key);
            this._drawButton(ctx, btnX, btnY, btnW, btnH, preset.label, 'selectWorld', key,
                selected ? '#1a3a2a' : null);
            if (selected) {
                ctx.strokeStyle = '#44ff88';
                ctx.lineWidth = 2;
                ctx.strokeRect(btnX - 2, btnY - 2, btnW + 4, btnH + 4);
            }
            btnY += 75;
        }

        // Start game button
        btnY += 30;
        this._drawButton(ctx, btnX, btnY, btnW, 60, '🚀 INICIAR JOGO', 'startGame', null, '#1a2a1a');

        // Back
        this._drawButton(ctx, (w - 200) * 0.5, h * 0.9, 200, 40, '← VOLTAR', 'back');
    }

    _drawButton(ctx, x, y, w, h, text, action, data, bgOverride) {
        const hover = this._mouseX >= x && this._mouseX <= x + w &&
                      this._mouseY >= y && this._mouseY <= y + h;

        ctx.fillStyle = bgOverride || (hover ? 'rgba(80,140,200,0.4)' : 'rgba(40,60,100,0.5)');
        ctx.fillRect(x, y, w, h);

        ctx.strokeStyle = hover ? '#88ccff' : '#445577';
        ctx.lineWidth = hover ? 2 : 1;
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = hover ? '#ffffff' : '#ccddee';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + w * 0.5, y + h * 0.5);
        ctx.textBaseline = 'alphabetic';

        this._buttons.push({ x, y, w, h, action, data });
    }

    _drawPlayerPreview(ctx, cx, cy, scale) {
        const s = scale;
        const pw = 14 * s;
        const ph = 30 * s;
        const x = cx - pw * 0.5;
        const y = cy - ph * 0.5;

        // Outline
        ctx.fillStyle = '#000';
        ctx.fillRect(x - s, y - s, pw + s * 2, ph + s * 2);

        // Head
        ctx.fillStyle = '#e8c07a';
        ctx.fillRect(x, y, pw, 8 * s);

        // Hair
        ctx.fillStyle = this.playerColors.hair;
        ctx.fillRect(x, y, pw, 3 * s);

        // Eyes
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(x + 9 * s, y + 4 * s, 3 * s, 3 * s);

        // Shirt
        ctx.fillStyle = this.playerColors.shirt;
        ctx.fillRect(x, y + 8 * s, pw, 12 * s);

        // Belt
        ctx.fillStyle = '#5a4020';
        ctx.fillRect(x, y + 18 * s, pw, 2 * s);

        // Pants
        ctx.fillStyle = this.playerColors.pants;
        ctx.fillRect(x, y + 20 * s, 6 * s, 10 * s);
        ctx.fillRect(x + pw - 6 * s, y + 20 * s, 6 * s, 10 * s);

        // Arms
        ctx.fillStyle = '#e8c07a';
        ctx.fillRect(x - 3 * s, y + 10 * s, 3 * s, 8 * s);
        ctx.fillRect(x + pw, y + 10 * s, 3 * s, 8 * s);

        // Shoes
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(x, y + ph - 2 * s, 6 * s, 2 * s);
        ctx.fillRect(x + pw - 6 * s, y + ph - 2 * s, 6 * s, 2 * s);
    }
}
